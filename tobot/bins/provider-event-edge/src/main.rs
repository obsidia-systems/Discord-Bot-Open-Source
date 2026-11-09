//! Recepción autenticada de eventos de pago; nunca aplica fulfillment.

use std::{net::SocketAddr, time::Duration};

use anyhow::Context;
use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::{PgPool, Row};
use subtle::ConstantTimeEq;
use tracing::{error, info};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;
const MAX_BODY: usize = 256 * 1024;
const SIGNATURE_TOLERANCE_SECONDS: i64 = 300;

#[derive(Clone)]
struct App {
    pool: PgPool,
    webhook_secret: String,
    billing_url: String,
    delivery_token: String,
    provider_account: String,
    endpoint_generation: i32,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let database_url = required("TOBOT_PROVIDER_EDGE_DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    if std::env::args().any(|argument| argument == "--migrate") {
        return Ok(());
    }
    let webhook_secret = required("TOBOT_STRIPE_TEST_WEBHOOK_SECRET")?;
    anyhow::ensure!(
        webhook_secret.starts_with("whsec_"),
        "invalid Stripe webhook secret"
    );
    let app = App {
        pool,
        webhook_secret,
        billing_url: required("TOBOT_BILLING_URL")?,
        delivery_token: required("TOBOT_PROVIDER_TO_BILLING_TOKEN")?,
        provider_account: required("TOBOT_STRIPE_TEST_ACCOUNT_SCOPE")?,
        endpoint_generation: 1,
        client: reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?,
    };
    anyhow::ensure!(
        app.delivery_token.len() >= 32 && !app.provider_account.is_empty(),
        "invalid provider edge scope or service token"
    );
    let bind: SocketAddr = required("TOBOT_PROVIDER_EDGE_BIND")?.parse()?;
    let worker = app.clone();
    let router = Router::new()
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/health/ready", get(ready))
        .route("/internal/v1/ingress/pending", get(pending))
        .route("/webhooks/stripe/{generation}", post(webhook))
        .with_state(app);
    info!(%bind, "provider event edge starting");
    tokio::select! {
        result = axum::serve(tokio::net::TcpListener::bind(bind).await?, router) => result.context("provider edge listener failed"),
        result = deliver(worker) => result,
    }
}

async fn ready(State(app): State<App>) -> Response {
    if sqlx::query("SELECT 1").execute(&app.pool).await.is_ok() {
        StatusCode::NO_CONTENT.into_response()
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "Database").into_response()
    }
}

async fn pending(State(app): State<App>, headers: HeaderMap) -> Response {
    if !service_token(&headers, &app.delivery_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match sqlx::query_scalar::<_, i64>(
        "SELECT count(*)::bigint FROM provider_edge.event_receipt WHERE delivered_at IS NULL",
    )
    .fetch_one(&app.pool)
    .await
    {
        Ok(pending) => Json(serde_json::json!({ "pending": pending })).into_response(),
        Err(error) => {
            error!(%error, "stripe receipt count unavailable");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

fn service_token(headers: &HeaderMap, expected: &str) -> bool {
    headers
        .get("x-provider-service-token")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value.len() == expected.len() && value.as_bytes().ct_eq(expected.as_bytes()).into()
        })
}

fn required(name: &str) -> anyhow::Result<String> {
    std::env::var(name).with_context(|| format!("missing {name}"))
}

async fn webhook(
    State(app): State<App>,
    Path(generation): Path<i32>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    if generation != app.endpoint_generation {
        return StatusCode::NOT_FOUND;
    }
    if body.len() > MAX_BODY {
        return StatusCode::PAYLOAD_TOO_LARGE;
    }
    let Some(signature) = headers
        .get("stripe-signature")
        .and_then(|value| value.to_str().ok())
    else {
        return StatusCode::BAD_REQUEST;
    };
    if signature.len() > 1024 {
        return StatusCode::BAD_REQUEST;
    }
    if !verify_signature(
        signature,
        &body,
        &app.webhook_secret,
        time::OffsetDateTime::now_utc().unix_timestamp(),
    ) {
        return StatusCode::BAD_REQUEST;
    }
    let Ok(event) = serde_json::from_slice::<serde_json::Value>(&body) else {
        return StatusCode::BAD_REQUEST;
    };
    let (Some(id), Some(kind), Some(created)) = (
        event.get("id").and_then(serde_json::Value::as_str),
        event.get("type").and_then(serde_json::Value::as_str),
        event.get("created").and_then(serde_json::Value::as_i64),
    ) else {
        return StatusCode::BAD_REQUEST;
    };
    if event.get("livemode").and_then(serde_json::Value::as_bool) != Some(false)
        || !id.starts_with("evt_")
        || id.len() > 255
        || kind.len() > 120
    {
        return StatusCode::BAD_REQUEST;
    }
    let normalized = normalize_event(&event);
    let result = sqlx::query("INSERT INTO provider_edge.event_receipt (receipt_id,provider_account,environment,event_id,event_type,provider_created_at,endpoint_generation,payload) VALUES ($1,$2,'test',$3,$4,$5,$6,$7) ON CONFLICT (provider_account,environment,event_id) DO NOTHING")
        .bind(Uuid::now_v7()).bind(&app.provider_account).bind(id).bind(kind).bind(created)
        .bind(app.endpoint_generation).bind(&normalized).execute(&app.pool).await;
    match result {
        Ok(outcome) if outcome.rows_affected() == 1 => StatusCode::OK,
        Ok(_) => {
            let existing=sqlx::query("SELECT payload FROM provider_edge.event_receipt WHERE provider_account=$1 AND environment='test' AND event_id=$2")
                .bind(&app.provider_account).bind(id).fetch_optional(&app.pool).await;
            match existing {
                Ok(Some(row))
                    if row.try_get::<serde_json::Value, _>("payload").ok().as_ref()
                        == Some(&normalized) =>
                {
                    StatusCode::OK
                }
                Ok(Some(_)) => StatusCode::CONFLICT,
                _ => StatusCode::SERVICE_UNAVAILABLE,
            }
        }
        Err(cause) => {
            error!(%cause, "provider receipt was not durable");
            StatusCode::SERVICE_UNAVAILABLE
        }
    }
}

fn normalize_event(event: &serde_json::Value) -> serde_json::Value {
    let object = &event["data"]["object"];
    let kind = event["type"].as_str().unwrap_or_default();
    let selected = match kind {
        "checkout.session.completed"
        | "checkout.session.async_payment_succeeded"
        | "checkout.session.async_payment_failed"
        | "checkout.session.expired" => serde_json::json!({
            "id":object["id"],"client_reference_id":object["client_reference_id"],
            "subscription":object["subscription"],"customer":object["customer"],
            "status":object["status"],"payment_status":object["payment_status"],
        }),
        "invoice.paid" | "invoice.payment_failed" => {
            let lines=object["lines"]["data"].as_array().map(|rows|rows.iter().take(10).map(|row|serde_json::json!({
                "price":row["price"],"pricing":{"price_details":{"price":row["pricing"]["price_details"]["price"]}},
                "quantity":row["quantity"],"period":{"end":row["period"]["end"]},
            })).collect::<Vec<_>>()).unwrap_or_default();
            let payments=object["payments"]["data"].as_array().map(|rows|rows.iter().take(10).map(|row|serde_json::json!({
                "status":row["status"],"payment":{"payment_intent":row["payment"]["payment_intent"]},
            })).collect::<Vec<_>>()).unwrap_or_default();
            serde_json::json!({"id":object["id"],"status":object["status"],"paid":object["paid"],
                "paid_out_of_band":object["paid_out_of_band"],"currency":object["currency"],
                "amount_paid":object["amount_paid"],"subscription":object["subscription"],
                "parent":{"subscription_details":{"subscription":object["parent"]["subscription_details"]["subscription"]}},
                "customer":object["customer"],"payment_intent":object["payment_intent"],
                "payments":{"data":payments},"lines":{"data":lines}})
        }
        "refund.created" | "refund.updated" | "refund.failed" => serde_json::json!({
            "id":object["id"],"payment_intent":object["payment_intent"],"amount":object["amount"],
            "currency":object["currency"],"status":object["status"],
        }),
        "charge.dispute.created" | "charge.dispute.updated" | "charge.dispute.closed" => {
            serde_json::json!({
                "id":object["id"],"payment_intent":object["payment_intent"],"status":object["status"],
            })
        }
        "customer.subscription.deleted"
        | "customer.subscription.paused"
        | "customer.subscription.updated" => serde_json::json!({
            "id":object["id"],"status":object["status"],
        }),
        _ => serde_json::json!({"id":object["id"]}),
    };
    serde_json::json!({"id":event["id"],"type":event["type"],"created":event["created"],
        "livemode":event["livemode"],"api_version":event["api_version"],"data":{"object":selected}})
}

fn verify_signature(header: &str, body: &[u8], secret: &str, now: i64) -> bool {
    let mut timestamp = None;
    let mut candidates = Vec::new();
    for part in header.split(',').take(16) {
        if let Some(value) = part.strip_prefix("t=") {
            timestamp = value.parse::<i64>().ok();
        }
        if let Some(value) = part.strip_prefix("v1=") {
            candidates.push(value);
        }
    }
    let Some(timestamp) = timestamp else {
        return false;
    };
    if now.abs_diff(timestamp) > SIGNATURE_TOLERANCE_SECONDS as u64 {
        return false;
    }
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    let expected = mac.finalize().into_bytes();
    candidates.iter().any(|candidate| {
        hex_bytes(candidate)
            .is_some_and(|bytes| bytes.len() == 32 && expected.as_slice().ct_eq(&bytes).into())
    })
}

fn hex_bytes(input: &str) -> Option<Vec<u8>> {
    if !input.len().is_multiple_of(2) || input.len() > 128 {
        return None;
    }
    input
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16)? as u8;
            let low = (pair[1] as char).to_digit(16)? as u8;
            Some((high << 4) | low)
        })
        .collect()
}

async fn deliver(app: App) -> anyhow::Result<()> {
    loop {
        let rows = sqlx::query("SELECT receipt_id,payload FROM provider_edge.event_receipt WHERE delivered_at IS NULL ORDER BY received_at LIMIT 32")
            .fetch_all(&app.pool).await?;
        for row in rows {
            let receipt: Uuid = row.try_get("receipt_id")?;
            let payload: serde_json::Value = row.try_get("payload")?;
            let response = app
                .client
                .post(format!(
                    "{}/internal/v1/provider-events",
                    app.billing_url.trim_end_matches('/')
                ))
                .header("x-provider-service-token", &app.delivery_token)
                .header("x-provider-receipt-id", receipt.to_string())
                .json(&payload)
                .send()
                .await;
            if response.is_ok_and(|value| value.status().is_success()) {
                sqlx::query("UPDATE provider_edge.event_receipt SET delivered_at=now(),delivery_attempts=delivery_attempts+1 WHERE receipt_id=$1 AND delivered_at IS NULL")
                    .bind(receipt).execute(&app.pool).await?;
            } else {
                sqlx::query("UPDATE provider_edge.event_receipt SET delivery_attempts=delivery_attempts+1 WHERE receipt_id=$1")
                    .bind(receipt).execute(&app.pool).await?;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_body_and_timestamp_required() {
        let body = br#"{"id":"evt_test"}"#;
        let secret = "whsec_test";
        let timestamp = 1_700_000_000;
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(format!("{timestamp}.").as_bytes());
        mac.update(body);
        let digest = mac.finalize().into_bytes();
        let signature = digest
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let header = format!("t={timestamp},v1={signature}");
        assert!(verify_signature(&header, body, secret, timestamp));
        assert!(!verify_signature(&header, b"{}", secret, timestamp));
        assert!(!verify_signature(&header, body, secret, timestamp + 301));
    }

    #[tokio::test]
    async fn authenticated_duplicate_acks_only_one_durable_receipt() {
        let Ok(url) = std::env::var("TOBOT_S7_PROVIDER_EDGE_TEST_DATABASE_URL") else {
            return;
        };
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let app = App {
            pool: pool.clone(),
            webhook_secret: "whsec_fixture".to_owned(),
            billing_url: "http://127.0.0.1:1".to_owned(),
            delivery_token: "x".repeat(32),
            provider_account: "acct_s7_test".to_owned(),
            endpoint_generation: 1,
            client: reqwest::Client::new(),
        };
        let id = format!("evt_{}", Uuid::now_v7().simple());
        let timestamp = time::OffsetDateTime::now_utc().unix_timestamp();
        let body=serde_json::to_vec(&serde_json::json!({"id":id,"type":"invoice.paid","created":timestamp,"livemode":false,"data":{"object":{"id":"in_test"}}})).unwrap();
        let signed = |raw: &[u8]| {
            let mut mac = HmacSha256::new_from_slice(app.webhook_secret.as_bytes()).unwrap();
            mac.update(format!("{timestamp}.").as_bytes());
            mac.update(raw);
            let digest = mac.finalize().into_bytes();
            let signature = digest
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            let mut headers = HeaderMap::new();
            headers.insert(
                "stripe-signature",
                format!("t={timestamp},v1={signature}").parse().unwrap(),
            );
            headers
        };
        assert_eq!(
            webhook(
                State(app.clone()),
                Path(1),
                signed(&body),
                Bytes::from(body.clone())
            )
            .await,
            StatusCode::OK
        );
        assert_eq!(
            webhook(
                State(app.clone()),
                Path(1),
                signed(&body),
                Bytes::from(body.clone())
            )
            .await,
            StatusCode::OK
        );
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM provider_edge.event_receipt WHERE event_id=$1",
        )
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
        assert_eq!(
            webhook(
                State(app.clone()),
                Path(2),
                signed(&body),
                Bytes::from(body.clone())
            )
            .await,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            webhook(
                State(app.clone()),
                Path(1),
                signed(&body),
                Bytes::from(b"{}".to_vec())
            )
            .await,
            StatusCode::BAD_REQUEST
        );
        let changed=serde_json::to_vec(&serde_json::json!({"id":id,"type":"invoice.payment_failed","created":timestamp,"livemode":false})).unwrap();
        assert_eq!(
            webhook(
                State(app.clone()),
                Path(1),
                signed(&changed),
                Bytes::from(changed)
            )
            .await,
            StatusCode::CONFLICT
        );
    }
}
