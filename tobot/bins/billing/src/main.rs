//! Facturación de prueba. Solo los eventos autenticados y el estado confirmado del proveedor producen grants.

use std::{net::SocketAddr, time::Duration};

use anyhow::{Context, Result};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Row};
use subtle::ConstantTimeEq;
use tobot_persistence::CatalogPublication;
use tracing::{error, info, warn};
use uuid::Uuid;

mod provider_catalog;

#[derive(Clone)]
struct App {
    pool: PgPool,
    client: reqwest::Client,
    stripe_key: String,
    provider_account: String,
    app_origin: String,
    control_url: String,
    control_token: String,
    command_token: String,
    provider_token: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CheckoutCommand {
    tenant_id: Uuid,
    guild_id: String,
    actor_account_id: Uuid,
    semantic_key: Uuid,
    revision_id: Uuid,
}

#[derive(Serialize)]
struct CheckoutResult {
    order_id: Uuid,
    state: String,
    checkout_url: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let pool = PgPool::connect(&required("TOBOT_BILLING_DATABASE_URL")?).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    if std::env::args().any(|argument| argument == "--migrate") {
        return Ok(());
    }
    let stripe_key = required("TOBOT_STRIPE_TEST_API_KEY")?;
    anyhow::ensure!(
        stripe_key.starts_with("rk_test_") || stripe_key.starts_with("sk_test_"),
        "only Stripe test-mode credentials are admitted"
    );
    let app_origin = required("TOBOT_PUBLIC_APP_ORIGIN")?;
    anyhow::ensure!(
        app_origin.starts_with("https://")
            && !app_origin.contains('?')
            && !app_origin.contains('#'),
        "invalid app origin"
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()?;
    let app = App {
        pool,
        client,
        stripe_key,
        provider_account: required("TOBOT_STRIPE_TEST_ACCOUNT_SCOPE")?,
        app_origin,
        control_url: required("TOBOT_CONTROL_URL")?,
        control_token: required("TOBOT_BILLING_TO_CONTROL_TOKEN")?,
        command_token: required("TOBOT_BILLING_COMMAND_TOKEN")?,
        provider_token: required("TOBOT_PROVIDER_TO_BILLING_TOKEN")?,
    };
    anyhow::ensure!(
        app.command_token.len() >= 32
            && app.provider_token.len() >= 32
            && app.control_token.len() >= 32
            && !app.provider_account.is_empty(),
        "invalid billing service credentials or scope"
    );
    let bind: SocketAddr = required("TOBOT_BILLING_BIND")?.parse()?;
    let worker = app.clone();
    let router = Router::new()
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/internal/v1/checkout", post(checkout))
        .route("/internal/v1/catalog/revisions", post(receive_catalog))
        .route(
            "/internal/v1/catalog/provider/plans",
            get(provider_catalog::list).post(provider_catalog::create),
        )
        .route(
            "/internal/v1/catalog/provider/prices/{price_id}",
            get(provider_catalog::price),
        )
        .route(
            "/internal/v1/catalog/provider/products/{product_id}/prices",
            post(provider_catalog::create_price),
        )
        .route(
            "/internal/v1/catalog/provider/products/{product_id}",
            post(provider_catalog::update_product),
        )
        .route(
            "/internal/v1/catalog/provider/products/{product_id}/archive",
            post(provider_catalog::archive_product),
        )
        .route(
            "/internal/v1/catalog/provider/prices/{price_id}/archive",
            post(provider_catalog::archive_price),
        )
        .route("/internal/v1/owners", post(enroll_owner))
        .route("/internal/v1/order/{tenant_id}", get(order_status))
        .route("/internal/v1/provider-events", post(receive_event))
        .with_state(app);
    info!(%bind, "billing starting in Stripe test mode");
    tokio::select! {
        result = axum::serve(tokio::net::TcpListener::bind(bind).await?, router) => result.context("billing listener failed"),
        result = run_worker(worker) => result,
    }
}

fn required(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("missing {name}"))
}
fn authorized(headers: &HeaderMap, name: &str, expected: &str) -> bool {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.as_bytes().ct_eq(expected.as_bytes()).into())
}

async fn stripe_get(app: &App, path: &str) -> Result<Value> {
    let response = app
        .client
        .get(format!("https://api.stripe.com/v1/{path}"))
        .bearer_auth(&app.stripe_key)
        .send()
        .await?;
    anyhow::ensure!(
        response.status().is_success(),
        "Stripe read rejected: {}",
        response.status()
    );
    Ok(response.json().await?)
}

async fn stripe_post(app: &App, path: &str, key: &str, fields: &[(&str, String)]) -> Result<Value> {
    let response = app
        .client
        .post(format!("https://api.stripe.com/v1/{path}"))
        .bearer_auth(&app.stripe_key)
        .header("Idempotency-Key", key)
        .form(fields)
        .send()
        .await?;
    anyhow::ensure!(
        response.status().is_success(),
        "Stripe command rejected: {}",
        response.status()
    );
    Ok(response.json().await?)
}

async fn receive_catalog(
    State(app): State<App>,
    headers: HeaderMap,
    Json(revision): Json<CatalogPublication>,
) -> StatusCode {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED;
    }
    if revision.validate().is_err() || revision.provider_account != app.provider_account {
        return StatusCode::CONFLICT;
    }
    if let Err(cause) = validate_catalog_product(&app, &revision).await {
        warn!(%cause, revision_id=%revision.revision_id, "catalog provider terms rejected");
        return StatusCode::CONFLICT;
    }
    match apply_catalog(&app, &revision).await {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(cause) => {
            warn!(%cause, revision_id=%revision.revision_id, "catalog publication rejected");
            StatusCode::CONFLICT
        }
    }
}

async fn validate_catalog_product(app: &App, revision: &CatalogPublication) -> Result<()> {
    let price = stripe_get(app, &format!("prices/{}", revision.provider_price_ref)).await?;
    let product_id = price["product"].as_str().context("price has no product")?;
    anyhow::ensure!(
        product_id.starts_with("prod_"),
        "invalid Stripe product reference"
    );
    let product = stripe_get(app, &format!("products/{product_id}")).await?;
    anyhow::ensure!(
        price["active"] == true
            && price["livemode"] == false
            && price["currency"] == revision.currency
            && price["unit_amount"] == revision.unit_amount
            && price["recurring"]["interval"] == revision.interval_name
            && price["recurring"]["interval_count"] == 1
            && price["recurring"]["usage_type"] == "licensed"
            && product["active"] == true
            && product["livemode"] == false
            && product["tax_code"] == revision.tax_classification,
        "Stripe Product tax code or active state differs from catalog revision"
    );
    Ok(())
}

async fn apply_catalog(app: &App, revision: &CatalogPublication) -> Result<()> {
    let publication = serde_json::to_value(revision)?;
    sqlx::query("INSERT INTO billing.catalog_revision (revision_id,product_key,provider_price_ref,currency,unit_amount,interval_name,feature_key,benefits,publication) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (revision_id) DO NOTHING")
        .bind(revision.revision_id).bind(&revision.product_key).bind(&revision.provider_price_ref)
        .bind(&revision.currency).bind(revision.unit_amount).bind(&revision.interval_name)
        .bind(&revision.feature_key).bind(serde_json::to_value(&revision.benefits)?).bind(&publication).execute(&app.pool).await?;
    let saved: Value =
        sqlx::query_scalar("SELECT publication FROM billing.catalog_revision WHERE revision_id=$1")
            .bind(revision.revision_id)
            .fetch_one(&app.pool)
            .await?;
    anyhow::ensure!(saved == publication, "catalog revision is immutable");
    Ok(())
}

async fn catalog_for_revision(app: &App, revision_id: Uuid) -> Result<CatalogPublication> {
    let publication: Value = sqlx::query_scalar(
        "SELECT publication FROM billing.catalog_revision WHERE revision_id=$1 AND publication IS NOT NULL",
    )
    .bind(revision_id)
    .fetch_one(&app.pool)
    .await?;
    let revision: CatalogPublication = serde_json::from_value(publication)?;
    anyhow::ensure!(
        revision.provider_account == app.provider_account,
        "catalog merchant scope mismatch"
    );
    Ok(revision)
}

async fn catalog_for_order(app: &App, order_id: Uuid) -> Result<CatalogPublication> {
    let revision_id: Uuid =
        sqlx::query_scalar("SELECT revision_id FROM billing.commercial_order WHERE order_id=$1")
            .bind(order_id)
            .fetch_one(&app.pool)
            .await?;
    catalog_for_revision(app, revision_id).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnerEnrollment {
    account_id: Uuid,
}

async fn enroll_owner(
    State(app): State<App>,
    headers: HeaderMap,
    Json(request): Json<OwnerEnrollment>,
) -> StatusCode {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED;
    }
    let owner_id = Uuid::new_v5(&Uuid::NAMESPACE_OID, request.account_id.as_bytes());
    match sqlx::query("INSERT INTO billing.billing_owner (billing_owner_id,account_id) VALUES ($1,$2) ON CONFLICT (account_id) DO NOTHING")
        .bind(owner_id).bind(request.account_id).execute(&app.pool).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(cause) => {
            error!(%cause, "billing owner enrollment failed");
            StatusCode::SERVICE_UNAVAILABLE
        }
    }
}

async fn checkout(
    State(app): State<App>,
    headers: HeaderMap,
    Json(command): Json<CheckoutCommand>,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if command.guild_id.is_empty() || !command.guild_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let owner_exists: Option<Uuid> = match sqlx::query_scalar(
        "SELECT billing_owner_id FROM billing.billing_owner WHERE account_id=$1",
    )
    .bind(command.actor_account_id)
    .fetch_optional(&app.pool)
    .await
    {
        Ok(value) => value,
        Err(cause) => {
            error!(%cause, "billing owner lookup failed");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    if owner_exists.is_none() {
        return StatusCode::FORBIDDEN.into_response();
    }
    match start_checkout(&app, &command).await {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err(cause) => {
            warn!(%cause, tenant_id=%command.tenant_id, "checkout did not start");
            StatusCode::CONFLICT.into_response()
        }
    }
}

async fn start_checkout(app: &App, command: &CheckoutCommand) -> Result<CheckoutResult> {
    let terms = catalog_for_revision(app, command.revision_id).await?;
    terms.validate().map_err(anyhow::Error::msg)?;
    let mut tx = app.pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(command.tenant_id.to_string())
        .execute(&mut *tx)
        .await?;
    let owner_id = Uuid::new_v5(&Uuid::NAMESPACE_OID, command.actor_account_id.as_bytes());
    let published: Option<Uuid> = sqlx::query_scalar("SELECT revision_id FROM billing.catalog_revision WHERE revision_id=$1 AND publication IS NOT NULL")
        .bind(command.revision_id).fetch_optional(&mut *tx).await?;
    anyhow::ensure!(published.is_some(), "catalog revision is not published");
    let saved_owner: Option<Uuid> = sqlx::query_scalar(
        "SELECT billing_owner_id FROM billing.billing_owner WHERE account_id=$1",
    )
    .bind(command.actor_account_id)
    .fetch_optional(&mut *tx)
    .await?;
    anyhow::ensure!(saved_owner == Some(owner_id), "payer is not enrolled");
    let binding = sqlx::query("SELECT billing_owner_id,guild_id FROM billing.scope_binding WHERE tenant_id=$1 AND state='Active' FOR UPDATE")
        .bind(command.tenant_id).fetch_optional(&mut *tx).await?;
    if let Some(row) = binding {
        anyhow::ensure!(
            row.try_get::<Uuid, _>("billing_owner_id")? == owner_id
                && row.try_get::<String, _>("guild_id")? == command.guild_id,
            "scope belongs to a different payer"
        );
    } else {
        sqlx::query("INSERT INTO billing.scope_binding (binding_id,billing_owner_id,tenant_id,guild_id,state) VALUES ($1,$2,$3,$4,'Active')")
            .bind(Uuid::now_v7()).bind(owner_id).bind(command.tenant_id).bind(&command.guild_id).execute(&mut *tx).await?;
    }
    let existing = sqlx::query("SELECT order_id,billing_owner_id,tenant_id,guild_id,revision_id,state FROM billing.commercial_order WHERE semantic_key=$1")
        .bind(command.semantic_key).fetch_optional(&mut *tx).await?;
    let order_id = if let Some(row) = existing {
        anyhow::ensure!(
            row.try_get::<Uuid, _>("billing_owner_id")? == owner_id
                && row.try_get::<Uuid, _>("tenant_id")? == command.tenant_id
                && row.try_get::<String, _>("guild_id")? == command.guild_id
                && row.try_get::<Uuid, _>("revision_id")? == command.revision_id,
            "semantic-key payload conflict"
        );
        let id = row.try_get::<Uuid, _>("order_id")?;
        let order_state: String = row.try_get("state")?;
        if order_state == "Cancelled" {
            let paid: Option<Uuid> = sqlx::query_scalar(
                "SELECT invoice_id FROM billing.invoice WHERE order_id=$1 AND state='Paid' LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
            anyhow::ensure!(paid.is_none(), "paid order cannot restart checkout");
            sqlx::query("UPDATE billing.commercial_order SET state='Open' WHERE order_id=$1 AND state='Cancelled'")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        } else {
            anyhow::ensure!(order_state == "Open", "scope already has an order");
        }
        id
    } else {
        let other: Option<Uuid> = sqlx::query_scalar("SELECT order_id FROM billing.commercial_order WHERE tenant_id=$1 AND state IN ('Open','Fulfilled') LIMIT 1")
            .bind(command.tenant_id).fetch_optional(&mut *tx).await?;
        anyhow::ensure!(other.is_none(), "scope already has an order");
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO billing.commercial_order (order_id,semantic_key,billing_owner_id,tenant_id,guild_id,revision_id,state) VALUES ($1,$2,$3,$4,$5,$6,'Open')")
            .bind(id).bind(command.semantic_key).bind(owner_id).bind(command.tenant_id).bind(&command.guild_id).bind(command.revision_id).execute(&mut *tx).await?;
        id
    };
    let attempt = sqlx::query("SELECT attempt_id,state,checkout_url FROM billing.checkout_attempt WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1")
        .bind(order_id).fetch_optional(&mut *tx).await?;
    let attempt_id = if let Some(row) = attempt {
        let state: String = row.try_get("state")?;
        let url: Option<String> = row.try_get("checkout_url")?;
        if state == "Open" && url.is_some() {
            tx.commit().await?;
            return Ok(CheckoutResult {
                order_id,
                state,
                checkout_url: url,
            });
        }
        if state == "Creating" {
            row.try_get::<Uuid, _>("attempt_id")?
        } else if matches!(state.as_str(), "Expired" | "Failed" | "Cancelled") {
            let id = Uuid::now_v7();
            sqlx::query("INSERT INTO billing.checkout_attempt (attempt_id,order_id,state) VALUES ($1,$2,'Creating')")
                .bind(id).bind(order_id).execute(&mut *tx).await?;
            id
        } else {
            anyhow::bail!("checkout attempt requires provider reconciliation");
        }
    } else {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO billing.checkout_attempt (attempt_id,order_id,state) VALUES ($1,$2,'Creating')")
            .bind(id).bind(order_id).execute(&mut *tx).await?;
        id
    };
    tx.commit().await?;

    let customer = customer_for_owner(app, owner_id, command.actor_account_id).await?;
    let success = format!(
        "{}/guild/{}/billing?checkout=returned",
        app.app_origin.trim_end_matches('/'),
        command.tenant_id
    );
    let cancel = format!(
        "{}/guild/{}/billing?checkout=cancelled",
        app.app_origin.trim_end_matches('/'),
        command.tenant_id
    );
    let session = stripe_post(
        app,
        "checkout/sessions",
        &format!("tobot-attempt-{attempt_id}"),
        &[
            ("mode", "subscription".to_owned()),
            ("customer", customer),
            ("client_reference_id", attempt_id.to_string()),
            ("line_items[0][price]", terms.provider_price_ref),
            ("line_items[0][quantity]", "1".to_owned()),
            ("success_url", success),
            ("cancel_url", cancel),
            ("metadata[tobot_order_id]", order_id.to_string()),
            (
                "subscription_data[metadata][tobot_order_id]",
                order_id.to_string(),
            ),
        ],
    )
    .await?;
    anyhow::ensure!(
        session["livemode"] == false && session["mode"] == "subscription",
        "Stripe returned unexpected session"
    );
    let session_id = required_str(&session, "id")?;
    let url = required_str(&session, "url")?;
    anyhow::ensure!(
        url.starts_with("https://checkout.stripe.com/"),
        "unexpected checkout URL"
    );
    let expires = session["expires_at"]
        .as_i64()
        .and_then(|seconds| time::OffsetDateTime::from_unix_timestamp(seconds).ok());
    sqlx::query("UPDATE billing.checkout_attempt SET state='Open',provider_session_ref=$2,checkout_url=$3,expires_at=$4 WHERE attempt_id=$1 AND state='Creating'")
        .bind(attempt_id).bind(session_id).bind(url).bind(expires).execute(&app.pool).await?;
    Ok(CheckoutResult {
        order_id,
        state: "Open".to_owned(),
        checkout_url: Some(url.to_owned()),
    })
}

async fn customer_for_owner(app: &App, owner_id: Uuid, account_id: Uuid) -> Result<String> {
    if let Some(value) = sqlx::query_scalar::<_, String>("SELECT provider_customer_ref FROM billing.provider_customer_mapping WHERE billing_owner_id=$1 AND provider_account=$2 AND environment='test' AND state='Active'")
        .bind(owner_id).bind(&app.provider_account).fetch_optional(&app.pool).await? { return Ok(value); }
    let customer = stripe_post(
        app,
        "customers",
        &format!("tobot-owner-{owner_id}"),
        &[
            ("metadata[tobot_billing_owner_id]", owner_id.to_string()),
            ("metadata[tobot_account_id]", account_id.to_string()),
        ],
    )
    .await?;
    anyhow::ensure!(
        customer["livemode"] == false,
        "Stripe returned live customer"
    );
    let reference = required_str(&customer, "id")?.to_owned();
    sqlx::query("INSERT INTO billing.provider_customer_mapping (mapping_id,billing_owner_id,provider_account,environment,provider_customer_ref,state) VALUES ($1,$2,$3,'test',$4,'Active') ON CONFLICT DO NOTHING")
        .bind(Uuid::now_v7()).bind(owner_id).bind(&app.provider_account).bind(&reference).execute(&app.pool).await?;
    let saved: String = sqlx::query_scalar("SELECT provider_customer_ref FROM billing.provider_customer_mapping WHERE billing_owner_id=$1 AND provider_account=$2 AND environment='test' AND state='Active'")
        .bind(owner_id).bind(&app.provider_account).fetch_one(&app.pool).await?;
    anyhow::ensure!(saved == reference, "provider customer mapping conflict");
    Ok(saved)
}

fn required_str<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .context(format!("missing provider {key}"))
}

async fn order_status(
    State(app): State<App>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let actor = headers
        .get("x-billing-actor-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<Uuid>().ok());
    let Some(actor) = actor else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let enrolled: Result<Option<Uuid>, _> = sqlx::query_scalar(
        "SELECT billing_owner_id FROM billing.billing_owner WHERE account_id=$1",
    )
    .bind(actor)
    .fetch_optional(&app.pool)
    .await;
    let Ok(enrolled) = enrolled else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let row = sqlx::query("SELECT o.order_id,o.state,c.publication,s.state AS subscription_state,s.grace_until,i.state AS invoice_state FROM billing.commercial_order o JOIN billing.billing_owner b ON b.billing_owner_id=o.billing_owner_id JOIN billing.catalog_revision c ON c.revision_id=o.revision_id LEFT JOIN billing.subscription s ON s.order_id=o.order_id LEFT JOIN LATERAL (SELECT state FROM billing.invoice WHERE order_id=o.order_id ORDER BY paid_at DESC NULLS LAST LIMIT 1) i ON true WHERE o.tenant_id=$1 AND b.account_id=$2 ORDER BY o.created_at DESC LIMIT 1")
        .bind(tenant).bind(actor).fetch_optional(&app.pool).await;
    match row {
        Ok(Some(row)) => (StatusCode::OK,Json(json!({
            "order_id":row.get::<Uuid,_>("order_id"), "order_state":row.get::<String,_>("state"),
            "subscription_state":row.get::<Option<String>,_>("subscription_state"),
            "invoice_state":row.get::<Option<String>,_>("invoice_state"),
            "grace_until":row.get::<Option<time::OffsetDateTime>,_>("grace_until").map(|value| value.unix_timestamp()),
            "purchased_offer": row.get::<Option<Value>,_>("publication").and_then(|value| serde_json::from_value::<CatalogPublication>(value).ok()).map(|terms| json!({"name":terms.display_name,"price_minor":terms.unit_amount,"currency":terms.currency,"interval":terms.interval_name,"benefits":terms.benefits,"support_url":terms.support_url})),
            "payer_enrolled":enrolled.is_some(),
        }))).into_response(),
        Ok(None) => (StatusCode::OK,Json(json!({"order_id":null,"order_state":null,"payer_enrolled":enrolled.is_some()}))).into_response(),
        Err(cause) => { error!(%cause, "billing status unavailable"); StatusCode::SERVICE_UNAVAILABLE.into_response() },
    }
}

async fn receive_event(
    State(app): State<App>,
    headers: HeaderMap,
    Json(event): Json<Value>,
) -> StatusCode {
    if !authorized(&headers, "x-provider-service-token", &app.provider_token) {
        return StatusCode::UNAUTHORIZED;
    }
    let receipt = headers
        .get("x-provider-receipt-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<Uuid>().ok());
    let (Some(receipt), Some(id), Some(kind), Some(created)) = (
        receipt,
        event["id"].as_str(),
        event["type"].as_str(),
        event["created"].as_i64(),
    ) else {
        return StatusCode::BAD_REQUEST;
    };
    if event["livemode"] != false || !id.starts_with("evt_") || id.len() > 255 || kind.len() > 120 {
        return StatusCode::BAD_REQUEST;
    }
    match sqlx::query("INSERT INTO billing.provider_event (event_id,receipt_id,event_type,provider_created_at,payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING")
        .bind(id).bind(receipt).bind(kind).bind(created).bind(&event).execute(&app.pool).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(cause) => {error!(%cause,"billing event inbox unavailable");StatusCode::SERVICE_UNAVAILABLE},
    }
}

async fn run_worker(app: App) -> Result<()> {
    loop {
        if let Err(cause) = reconcile_creating(&app).await {
            error!(%cause,"checkout creation reconciliation paused");
        }
        if let Err(cause) = reconcile_attempts(&app).await {
            error!(%cause,"checkout session reconciliation paused");
        }
        if let Err(cause) = apply_pending_events(&app).await {
            error!(%cause,"billing event apply paused");
        }
        if let Err(cause) = reconcile_subscriptions(&app).await {
            error!(%cause,"subscription reconciliation paused");
        }
        if let Err(cause) = run_dunning(&app).await {
            error!(%cause,"billing dunning paused");
        }
        if let Err(cause) = expire_grace(&app).await {
            error!(%cause,"billing grace expiry paused");
        }
        if let Err(cause) = publish_grants(&app).await {
            error!(%cause,"commercial grant delivery paused");
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn apply_pending_events(app: &App) -> Result<()> {
    let rows = sqlx::query("SELECT event_id,event_type,payload FROM billing.provider_event WHERE applied_at IS NULL AND next_attempt_at<=now() ORDER BY provider_created_at,event_id LIMIT 32")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let id: String = row.try_get("event_id")?;
        let kind: String = row.try_get("event_type")?;
        let payload: Value = row.try_get("payload")?;
        match apply_event(app, &kind, &payload).await {
            Ok(true) => {
                sqlx::query("UPDATE billing.provider_event SET applied_at=now(),last_error=NULL WHERE event_id=$1 AND applied_at IS NULL")
                .bind(&id).execute(&app.pool).await?;
            }
            Ok(false) => {
                sqlx::query("UPDATE billing.provider_event SET next_attempt_at=now()+interval '10 seconds' WHERE event_id=$1")
                .bind(&id).execute(&app.pool).await?;
            }
            Err(cause) => {
                let reason = cause.to_string();
                sqlx::query("UPDATE billing.provider_event SET last_error=$2,next_attempt_at=now()+interval '30 seconds' WHERE event_id=$1")
                    .bind(&id).bind(&reason[..reason.len().min(255)]).execute(&app.pool).await?;
                warn!(event_id=%id, event_type=%kind, "payment event requires reconciliation");
            }
        }
    }
    Ok(())
}

async fn apply_event(app: &App, kind: &str, payload: &Value) -> Result<bool> {
    let object = &payload["data"]["object"];
    match kind {
        "checkout.session.completed" | "checkout.session.async_payment_succeeded" => {
            apply_session(app, object).await
        }
        "checkout.session.expired" | "checkout.session.async_payment_failed" => {
            apply_session_failure(app, object).await
        }
        "invoice.paid" => apply_paid_invoice(app, object).await,
        "invoice.payment_failed" => apply_failed_invoice(app, object).await,
        "customer.subscription.deleted" => apply_subscription_state(app, object, "Cancelled").await,
        "customer.subscription.paused" => apply_subscription_state(app, object, "Paused").await,
        "customer.subscription.updated" => apply_subscription_update(app, object).await,
        "refund.created" | "refund.updated" | "refund.failed" => apply_refund(app, object).await,
        "charge.dispute.created" | "charge.dispute.updated" | "charge.dispute.closed" => {
            apply_dispute(app, object).await
        }
        _ => Ok(true),
    }
}

async fn reconcile_creating(app: &App) -> Result<()> {
    let rows=sqlx::query("SELECT o.semantic_key,o.tenant_id,o.guild_id,o.revision_id,b.account_id FROM billing.checkout_attempt a JOIN billing.commercial_order o ON o.order_id=a.order_id JOIN billing.billing_owner b ON b.billing_owner_id=o.billing_owner_id WHERE a.state='Creating' AND a.created_at<now()-interval '10 seconds' ORDER BY a.created_at LIMIT 16")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let command = CheckoutCommand {
            semantic_key: row.try_get("semantic_key")?,
            tenant_id: row.try_get("tenant_id")?,
            guild_id: row.try_get("guild_id")?,
            actor_account_id: row.try_get("account_id")?,
            revision_id: row.try_get("revision_id")?,
        };
        if let Err(cause) = start_checkout(app, &command).await {
            warn!(%cause,tenant_id=%command.tenant_id,"checkout reconciliation remains pending");
        }
    }
    Ok(())
}

async fn reconcile_attempts(app: &App) -> Result<()> {
    let rows=sqlx::query("SELECT attempt_id,provider_session_ref FROM billing.checkout_attempt WHERE state='Open' AND provider_session_ref IS NOT NULL AND next_reconcile_at<=now() ORDER BY next_reconcile_at LIMIT 16")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let attempt: Uuid = row.try_get("attempt_id")?;
        let reference: String = row.try_get("provider_session_ref")?;
        sqlx::query("UPDATE billing.checkout_attempt SET next_reconcile_at=now()+interval '2 minutes' WHERE attempt_id=$1")
            .bind(attempt).execute(&app.pool).await?;
        match stripe_get(app, &format!("checkout/sessions/{reference}")).await {
            Ok(session) if session["status"] == "complete" => {
                let _ = apply_session(app, &session).await?;
            }
            Ok(session) if session["status"] == "expired" => {
                let _ = apply_session_failure(app, &session).await?;
            }
            Ok(_) => {}
            Err(cause) => {
                warn!(%cause,attempt_id=%attempt,"checkout session reconciliation inconclusive")
            }
        }
    }
    Ok(())
}

async fn reconcile_subscriptions(app: &App) -> Result<()> {
    let rows=sqlx::query("SELECT subscription_id,provider_subscription_ref FROM billing.subscription WHERE state IN ('Incomplete','Active','PastDue','Paused','Restricted','Disputed') AND next_reconcile_at<=now() ORDER BY next_reconcile_at LIMIT 16")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let subscription: Uuid = row.try_get("subscription_id")?;
        let reference: String = row.try_get("provider_subscription_ref")?;
        sqlx::query("UPDATE billing.subscription SET next_reconcile_at=now()+interval '5 minutes' WHERE subscription_id=$1")
            .bind(subscription).execute(&app.pool).await?;
        match stripe_get(app, &format!("subscriptions/{reference}")).await {
            Ok(value) => {
                let _ = apply_subscription_update(app, &value).await?;
                if let Some(invoice) = provider_ref(&value["latest_invoice"]) {
                    if let Ok(object) = stripe_get(app, &format!("invoices/{invoice}")).await {
                        if object["status"] == "paid" {
                            let _ = apply_paid_invoice(app, &object).await?;
                        }
                    }
                }
            }
            Err(cause) => {
                warn!(%cause,subscription_id=%subscription,"subscription reconciliation inconclusive")
            }
        }
    }
    Ok(())
}

async fn apply_session_failure(app: &App, object: &Value) -> Result<bool> {
    let Some(reference) = object["id"].as_str() else {
        return Ok(false);
    };
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT a.attempt_id,o.state AS order_state FROM billing.checkout_attempt a JOIN billing.commercial_order o ON o.order_id=a.order_id WHERE a.provider_session_ref=$1 FOR UPDATE")
        .bind(reference).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    if row.try_get::<String, _>("order_state")? == "Open" {
        let attempt: Uuid = row.try_get("attempt_id")?;
        sqlx::query("UPDATE billing.checkout_attempt SET state=$2 WHERE attempt_id=$1 AND state IN ('Open','Creating','Completed')")
            .bind(attempt).bind(if object["status"]=="expired" {"Expired"}else{"Failed"}).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(true)
}

async fn apply_subscription_update(app: &App, object: &Value) -> Result<bool> {
    match object["status"].as_str() {
        Some("canceled" | "incomplete_expired") => close_expired_subscription(app, object).await,
        Some("paused") => apply_subscription_state(app, object, "Paused").await,
        Some("unpaid") => apply_subscription_state(app, object, "Restricted").await,
        _ => Ok(true),
    }
}

/// An unpaid checkout whose provider subscription expired or was canceled does not
/// become a grant. The open order is cancelled and its attempt expired so another
/// checkout can start. A paid subscription still follows the cancellation grant path.
async fn close_expired_subscription(app: &App, object: &Value) -> Result<bool> {
    let reference = required_str(object, "id")?;
    let mut tx = app.pool.begin().await?;
    let row = sqlx::query("SELECT s.order_id,o.state AS order_state FROM billing.subscription s JOIN billing.commercial_order o ON o.order_id=s.order_id WHERE s.provider_subscription_ref=$1 FOR UPDATE")
        .bind(reference)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let order_state: String = row.try_get("order_state")?;
    let paid: Option<Uuid> = sqlx::query_scalar(
        "SELECT invoice_id FROM billing.invoice WHERE order_id=$1 AND state='Paid' LIMIT 1",
    )
    .bind(order)
    .fetch_optional(&mut *tx)
    .await?;
    if paid.is_none() && order_state == "Open" {
        sqlx::query("UPDATE billing.subscription SET state='Cancelled',updated_at=now() WHERE order_id=$1")
            .bind(order)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE billing.checkout_attempt SET state='Expired' WHERE order_id=$1 AND state IN ('Open','Creating','Completed')")
            .bind(order)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE billing.commercial_order SET state='Cancelled' WHERE order_id=$1 AND state='Open'")
            .bind(order)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(true);
    }
    tx.commit().await?;
    if paid.is_some() && object["status"] == "canceled" {
        return apply_subscription_state(app, object, "Cancelled").await;
    }
    Ok(true)
}

fn provider_ref(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value.get("id").and_then(Value::as_str))
}

fn invoice_subscription_ref(object: &Value) -> Option<&str> {
    provider_ref(&object["subscription"])
        .or_else(|| provider_ref(&object["parent"]["subscription_details"]["subscription"]))
}

fn invoice_price_matches(object: &Value, price_id: &str) -> bool {
    object["lines"]["data"].as_array().is_some_and(|items| {
        items.iter().any(|item| {
            provider_ref(&item["price"])
                .or_else(|| provider_ref(&item["pricing"]["price_details"]["price"]))
                == Some(price_id)
                && item["quantity"].as_i64() == Some(1)
        })
    })
}

async fn invoice_payment_intent(app: &App, object: &Value) -> Result<String> {
    if let Some(reference) = provider_ref(&object["payment_intent"]) {
        return Ok(reference.to_owned());
    }
    if let Some(reference) = object["payments"]["data"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["status"] == "paid"))
        .and_then(|row| provider_ref(&row["payment"]["payment_intent"]))
    {
        return Ok(reference.to_owned());
    }
    let invoice = required_str(object, "id")?;
    let listing = stripe_get(app, &format!("invoice_payments?invoice={invoice}&limit=10")).await?;
    listing["data"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["status"] == "paid"))
        .and_then(|row| provider_ref(&row["payment"]["payment_intent"]))
        .map(str::to_owned)
        .context("paid invoice has no verified payment intent")
}

async fn apply_session(app: &App, object: &Value) -> Result<bool> {
    let Some(attempt) = object["client_reference_id"]
        .as_str()
        .and_then(|value| value.parse::<Uuid>().ok())
    else {
        return Ok(true);
    };
    let session_id = required_str(object, "id")?;
    let Some(subscription) = provider_ref(&object["subscription"]) else {
        return Ok(false);
    };
    let Some(customer) = provider_ref(&object["customer"]) else {
        return Ok(false);
    };
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT a.order_id,o.billing_owner_id,o.state AS order_state FROM billing.checkout_attempt a JOIN billing.commercial_order o ON o.order_id=a.order_id WHERE a.attempt_id=$1 AND a.provider_session_ref=$2 FOR UPDATE")
        .bind(attempt).bind(session_id).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let owner: Uuid = row.try_get("billing_owner_id")?;
    let order_state: String = row.try_get("order_state")?;
    let mapped: Option<String>=sqlx::query_scalar("SELECT provider_customer_ref FROM billing.provider_customer_mapping WHERE billing_owner_id=$1 AND provider_account=$2 AND environment='test' AND state='Active'")
        .bind(owner).bind(&app.provider_account).fetch_optional(&mut *tx).await?;
    anyhow::ensure!(
        mapped.as_deref() == Some(customer),
        "checkout customer mismatch"
    );
    sqlx::query("UPDATE billing.checkout_attempt SET state='Completed',provider_subscription_ref=$2 WHERE attempt_id=$1 AND state IN ('Creating','Open','Completed')")
        .bind(attempt).bind(subscription).execute(&mut *tx).await?;
    let mapped_subscription: Option<String> = sqlx::query_scalar(
        "SELECT provider_subscription_ref FROM billing.subscription WHERE order_id=$1 FOR UPDATE",
    )
    .bind(order)
    .fetch_optional(&mut *tx)
    .await?;
    if mapped_subscription
        .as_deref()
        .is_some_and(|reference| reference != subscription)
    {
        anyhow::ensure!(
            order_state == "Open",
            "fulfilled order cannot change provider subscription"
        );
        let settled: Option<Uuid> = sqlx::query_scalar(
            "SELECT invoice_id FROM billing.invoice WHERE order_id=$1 AND state='Paid' LIMIT 1",
        )
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?;
        anyhow::ensure!(
            settled.is_none(),
            "paid order cannot change provider subscription"
        );
    }
    sqlx::query("INSERT INTO billing.subscription (subscription_id,order_id,provider_subscription_ref,state) VALUES ($1,$2,$3,'Incomplete') ON CONFLICT (order_id) DO UPDATE SET provider_subscription_ref=EXCLUDED.provider_subscription_ref,state='Incomplete',updated_at=now() WHERE billing.subscription.state IN ('Incomplete','Cancelled','Restricted') AND NOT EXISTS (SELECT 1 FROM billing.invoice WHERE order_id=EXCLUDED.order_id AND state='Paid')")
        .bind(Uuid::now_v7()).bind(order).bind(subscription).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(true)
}

async fn apply_paid_invoice(app: &App, object: &Value) -> Result<bool> {
    let invoice_ref = required_str(object, "id")?;
    let Some(subscription_ref) = invoice_subscription_ref(object) else {
        return Ok(false);
    };
    // Current Stripe invoices report payment with `status`. The legacy boolean
    // `paid` is absent; an explicit false still rejects.
    if object["status"] != "paid"
        || object["paid"] == false
        || object["paid_out_of_band"] == true
    {
        return Ok(false);
    }
    let order_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT order_id FROM billing.subscription WHERE provider_subscription_ref=$1",
    )
    .bind(subscription_ref)
    .fetch_optional(&app.pool)
    .await?;
    let Some(order_id) = order_id else {
        return Ok(false);
    };
    let terms = catalog_for_order(app, order_id).await?;
    if object["currency"] != terms.currency {
        anyhow::bail!("invoice currency mismatch");
    }
    if !invoice_price_matches(object, &terms.provider_price_ref) {
        anyhow::bail!("invoice price mismatch");
    }
    if object["amount_paid"]
        .as_i64()
        .is_none_or(|amount| amount < terms.unit_amount)
    {
        anyhow::bail!("invoice amount insufficient");
    }
    let period_end = object["lines"]["data"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                provider_ref(&item["price"])
                    .or_else(|| provider_ref(&item["pricing"]["price_details"]["price"]))
                    == Some(terms.provider_price_ref.as_str())
            })
        })
        .and_then(|item| item["period"]["end"].as_i64())
        .and_then(|seconds| time::OffsetDateTime::from_unix_timestamp(seconds).ok());
    anyhow::ensure!(
        period_end.is_some_and(|until| until > time::OffsetDateTime::now_utc()),
        "invoice has no future service period"
    );
    let payment_intent = invoice_payment_intent(app, object).await?;
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT s.order_id,o.tenant_id,o.state,s.state AS subscription_state,s.period_end AS current_period_end,o.billing_owner_id FROM billing.subscription s JOIN billing.commercial_order o ON o.order_id=s.order_id WHERE s.provider_subscription_ref=$1 FOR UPDATE")
        .bind(subscription_ref).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let tenant: Uuid = row.try_get("tenant_id")?;
    let state: String = row.try_get("state")?;
    let subscription_state: String = row.try_get("subscription_state")?;
    let current_period_end: Option<time::OffsetDateTime> = row.try_get("current_period_end")?;
    let owner: Uuid = row.try_get("billing_owner_id")?;
    let customer = provider_ref(&object["customer"]);
    let mapped:Option<String>=sqlx::query_scalar("SELECT provider_customer_ref FROM billing.provider_customer_mapping WHERE billing_owner_id=$1 AND provider_account=$2 AND environment='test' AND state='Active'")
        .bind(owner).bind(&app.provider_account).fetch_optional(&mut *tx).await?;
    anyhow::ensure!(customer == mapped.as_deref(), "invoice customer mismatch");
    let invoice_write=sqlx::query("INSERT INTO billing.invoice (invoice_id,order_id,provider_invoice_ref,provider_payment_intent_ref,state,period_end,paid_at) VALUES ($1,$2,$3,$4,'Paid',$5,now()) ON CONFLICT (provider_invoice_ref) DO UPDATE SET provider_payment_intent_ref=EXCLUDED.provider_payment_intent_ref,state='Paid',period_end=EXCLUDED.period_end,paid_at=COALESCE(billing.invoice.paid_at,now()) WHERE billing.invoice.order_id=EXCLUDED.order_id AND (billing.invoice.state!='Paid' OR billing.invoice.provider_payment_intent_ref=EXCLUDED.provider_payment_intent_ref)")
        .bind(Uuid::now_v7()).bind(order).bind(invoice_ref).bind(payment_intent)
        .bind(period_end).execute(&mut *tx).await?;
    anyhow::ensure!(
        invoice_write.rows_affected() == 1,
        "invoice identity conflict"
    );
    if matches!(
        subscription_state.as_str(),
        "Cancelled" | "Disputed" | "Paused"
    ) || current_period_end
        .zip(period_end)
        .is_some_and(|(current, next)| current >= next)
    {
        tx.commit().await?;
        return Ok(true);
    }
    if state == "Open" {
        sqlx::query("UPDATE billing.commercial_order SET state='Fulfilled',fulfilled_at=now() WHERE order_id=$1 AND state='Open'")
            .bind(order).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE billing.subscription SET state='Active',period_end=$2,grace_until=NULL,updated_at=now() WHERE order_id=$1")
        .bind(order).bind(period_end).execute(&mut *tx).await?;
    enqueue_grant(
        &mut tx,
        app,
        order,
        tenant,
        invoice_ref,
        "Active",
        period_end,
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}

async fn apply_failed_invoice(app: &App, object: &Value) -> Result<bool> {
    let invoice_ref = required_str(object, "id")?;
    let Some(subscription_ref) = invoice_subscription_ref(object) else {
        return Ok(false);
    };
    let order_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT order_id FROM billing.subscription WHERE provider_subscription_ref=$1",
    )
    .bind(subscription_ref)
    .fetch_optional(&app.pool)
    .await?;
    let Some(order_id) = order_id else {
        return Ok(false);
    };
    let terms = catalog_for_order(app, order_id).await?;
    let failed_period_end = object["lines"]["data"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                provider_ref(&item["price"])
                    .or_else(|| provider_ref(&item["pricing"]["price_details"]["price"]))
                    == Some(terms.provider_price_ref.as_str())
            })
        })
        .and_then(|item| item["period"]["end"].as_i64())
        .and_then(|seconds| time::OffsetDateTime::from_unix_timestamp(seconds).ok());
    let Some(failed_period_end) = failed_period_end else {
        return Ok(false);
    };
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT s.order_id,o.tenant_id,s.state,s.period_end,s.grace_until FROM billing.subscription s JOIN billing.commercial_order o ON o.order_id=s.order_id WHERE s.provider_subscription_ref=$1 FOR UPDATE")
        .bind(subscription_ref).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let tenant: Uuid = row.try_get("tenant_id")?;
    let subscription_state: String = row.try_get("state")?;
    let current_period_end: Option<time::OffsetDateTime> = row.try_get("period_end")?;
    let existing_grace: Option<time::OffsetDateTime> = row.try_get("grace_until")?;
    if !matches!(subscription_state.as_str(), "Active" | "PastDue") {
        return Ok(false);
    }
    if current_period_end.is_some_and(|current| failed_period_end <= current) {
        tx.commit().await?;
        return Ok(true);
    }
    let existing: Option<String> =
        sqlx::query_scalar("SELECT state FROM billing.invoice WHERE provider_invoice_ref=$1")
            .bind(invoice_ref)
            .fetch_optional(&mut *tx)
            .await?;
    if existing.as_deref() == Some("Paid") {
        tx.commit().await?;
        return Ok(true);
    }
    let grace = existing_grace.unwrap_or_else(|| {
        current_period_end
            .unwrap_or_else(time::OffsetDateTime::now_utc)
            .max(time::OffsetDateTime::now_utc())
            + time::Duration::days(3)
    });
    sqlx::query("INSERT INTO billing.invoice (invoice_id,order_id,provider_invoice_ref,state) VALUES ($1,$2,$3,'Open') ON CONFLICT (provider_invoice_ref) DO NOTHING")
        .bind(Uuid::now_v7()).bind(order).bind(invoice_ref).execute(&mut *tx).await?;
    sqlx::query("UPDATE billing.subscription SET state='PastDue',grace_until=$2,updated_at=now() WHERE order_id=$1 AND state='Active'")
        .bind(order).bind(grace).execute(&mut *tx).await?;
    let invoice_id: Uuid =
        sqlx::query_scalar("SELECT invoice_id FROM billing.invoice WHERE provider_invoice_ref=$1")
            .bind(invoice_ref)
            .fetch_one(&mut *tx)
            .await?;
    sqlx::query("INSERT INTO billing.dunning_attempt (attempt_id,invoice_id,due_at,state) VALUES ($1,$2,$3,'Scheduled') ON CONFLICT (invoice_id) DO NOTHING")
        .bind(Uuid::now_v7()).bind(invoice_id).bind(time::OffsetDateTime::now_utc()+time::Duration::days(1)).execute(&mut *tx).await?;
    enqueue_grant(
        &mut tx,
        app,
        order,
        tenant,
        invoice_ref,
        "Grace",
        Some(grace),
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}

async fn run_dunning(app: &App) -> Result<()> {
    let rows=sqlx::query("SELECT a.attempt_id,i.provider_invoice_ref FROM billing.dunning_attempt a JOIN billing.invoice i ON i.invoice_id=a.invoice_id JOIN billing.subscription s ON s.order_id=i.order_id WHERE a.state='Scheduled' AND a.due_at<=now() AND i.state='Open' AND s.state='PastDue' AND a.due_at<s.grace_until ORDER BY a.due_at LIMIT 16")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let attempt: Uuid = row.try_get("attempt_id")?;
        let invoice: String = row.try_get("provider_invoice_ref")?;
        match stripe_get(app, &format!("invoices/{invoice}")).await {
            Ok(object) if object["status"] == "paid" => {
                if apply_paid_invoice(app, &object).await? {
                    sqlx::query("UPDATE billing.dunning_attempt SET state='Skipped',attempted_at=now() WHERE attempt_id=$1 AND state='Scheduled'")
                        .bind(attempt).execute(&app.pool).await?;
                }
                continue;
            }
            Ok(object) if object["status"] != "open" => {
                sqlx::query("UPDATE billing.dunning_attempt SET state='Skipped',attempted_at=now() WHERE attempt_id=$1 AND state='Scheduled'")
                    .bind(attempt).execute(&app.pool).await?;
                continue;
            }
            Ok(_) => {}
            Err(cause) => {
                warn!(%cause,attempt_id=%attempt,"invoice reconciliation before dunning inconclusive");
                continue;
            }
        }
        let response = stripe_post(
            app,
            &format!("invoices/{invoice}/pay"),
            &format!("tobot-dunning-{attempt}"),
            &[],
        )
        .await;
        if response.is_ok() {
            sqlx::query("UPDATE billing.dunning_attempt SET state='Sent',attempted_at=now() WHERE attempt_id=$1 AND state='Scheduled'")
                .bind(attempt).execute(&app.pool).await?;
        } else {
            sqlx::query("UPDATE billing.dunning_attempt SET due_at=now()+interval '10 minutes',attempted_at=now() WHERE attempt_id=$1 AND state='Scheduled'")
                .bind(attempt).execute(&app.pool).await?;
        }
    }
    Ok(())
}

async fn expire_grace(app: &App) -> Result<()> {
    let rows=sqlx::query("SELECT s.order_id,o.tenant_id,s.grace_until FROM billing.subscription s JOIN billing.commercial_order o ON o.order_id=s.order_id WHERE s.state='PastDue' AND s.grace_until<=now() ORDER BY s.grace_until LIMIT 16")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let order: Uuid = row.try_get("order_id")?;
        let tenant: Uuid = row.try_get("tenant_id")?;
        let grace: time::OffsetDateTime = row.try_get("grace_until")?;
        let mut tx = app.pool.begin().await?;
        sqlx::query("SELECT order_id FROM billing.subscription WHERE order_id=$1 FOR UPDATE")
            .bind(order)
            .execute(&mut *tx)
            .await?;
        let current: Option<String> =
            sqlx::query_scalar("SELECT state FROM billing.subscription WHERE order_id=$1")
                .bind(order)
                .fetch_optional(&mut *tx)
                .await?;
        if current.as_deref() != Some("PastDue") {
            tx.commit().await?;
            continue;
        }
        sqlx::query(
            "UPDATE billing.invoice SET state='Uncollectible' WHERE order_id=$1 AND state='Open'",
        )
        .bind(order)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE billing.subscription SET state='Restricted',updated_at=now() WHERE order_id=$1",
        )
        .bind(order)
        .execute(&mut *tx)
        .await?;
        enqueue_grant(
            &mut tx,
            app,
            order,
            tenant,
            &format!("grace-expired-{}", grace.unix_timestamp()),
            "Restricted",
            None,
        )
        .await?;
        tx.commit().await?;
    }
    Ok(())
}

async fn apply_subscription_state(app: &App, object: &Value, state: &str) -> Result<bool> {
    let reference = required_str(object, "id")?;
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT s.order_id,o.tenant_id FROM billing.subscription s JOIN billing.commercial_order o ON o.order_id=s.order_id WHERE s.provider_subscription_ref=$1 FOR UPDATE")
        .bind(reference).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let tenant: Uuid = row.try_get("tenant_id")?;
    sqlx::query("UPDATE billing.subscription SET state=$2,updated_at=now() WHERE order_id=$1")
        .bind(order)
        .bind(state)
        .execute(&mut *tx)
        .await?;
    enqueue_grant(&mut tx, app, order, tenant, reference, state, None).await?;
    tx.commit().await?;
    Ok(true)
}

async fn apply_refund(app: &App, object: &Value) -> Result<bool> {
    let refund = required_str(object, "id")?;
    anyhow::ensure!(refund.starts_with("re_"), "invalid refund identity");
    let Some(payment_intent) = provider_ref(&object["payment_intent"]) else {
        return Ok(false);
    };
    let Some(amount) = object["amount"].as_i64().filter(|value| *value > 0) else {
        return Ok(false);
    };
    let refund_state = match object["status"].as_str() {
        Some("succeeded") => "Succeeded",
        Some("failed" | "canceled") => "Failed",
        Some("pending" | "requires_action") => "Pending",
        _ => return Ok(false),
    };
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT i.invoice_id,i.order_id,o.tenant_id FROM billing.invoice i JOIN billing.commercial_order o ON o.order_id=i.order_id JOIN billing.subscription s ON s.order_id=i.order_id WHERE i.provider_payment_intent_ref=$1 AND i.state='Paid' LIMIT 1 FOR UPDATE OF s")
        .bind(payment_intent).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let terms = catalog_for_order(app, order).await?;
    anyhow::ensure!(
        object["currency"] == terms.currency,
        "refund currency mismatch"
    );
    let tenant: Uuid = row.try_get("tenant_id")?;
    let invoice_id: Uuid = row.try_get("invoice_id")?;
    let open_dispute:Option<Uuid>=sqlx::query_scalar("SELECT dispute_id FROM billing.commercial_dispute WHERE order_id=$1 AND state='Open' LIMIT 1")
        .bind(order).fetch_optional(&mut *tx).await?;
    if open_dispute.is_some() {
        return Ok(false);
    }
    let prior: Option<String> = sqlx::query_scalar(
        "SELECT state FROM billing.commercial_refund WHERE provider_refund_ref=$1 FOR UPDATE",
    )
    .bind(refund)
    .fetch_optional(&mut *tx)
    .await?;
    if prior.as_deref() == Some("Succeeded") {
        tx.commit().await?;
        return Ok(true);
    }
    let total:i64=sqlx::query_scalar("SELECT COALESCE(SUM(amount),0)::bigint FROM billing.commercial_refund WHERE invoice_id=$1 AND state='Succeeded' AND provider_refund_ref<>$2")
        .bind(invoice_id).bind(refund).fetch_one(&mut *tx).await?;
    anyhow::ensure!(
        total
            .checked_add(amount)
            .is_some_and(|value| value <= terms.unit_amount),
        "refund exceeds pinned amount"
    );
    sqlx::query("INSERT INTO billing.commercial_refund (refund_id,order_id,invoice_id,provider_refund_ref,state,amount) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (provider_refund_ref) DO UPDATE SET state=EXCLUDED.state WHERE billing.commercial_refund.order_id=EXCLUDED.order_id AND billing.commercial_refund.invoice_id=EXCLUDED.invoice_id")
        .bind(Uuid::now_v7()).bind(order).bind(invoice_id).bind(refund).bind(refund_state).bind(amount).execute(&mut *tx).await?;
    if refund_state == "Succeeded" {
        enqueue_grant(&mut tx, app, order, tenant, refund, "Reversed", None).await?;
    }
    tx.commit().await?;
    Ok(true)
}

async fn apply_dispute(app: &App, object: &Value) -> Result<bool> {
    let reference = required_str(object, "id")?;
    anyhow::ensure!(
        reference.starts_with("du_") || reference.starts_with("dp_"),
        "invalid dispute identity"
    );
    let Some(payment_intent) = provider_ref(&object["payment_intent"]) else {
        return Ok(false);
    };
    let observed = match object["status"].as_str() {
        Some("needs_response" | "under_review") => "Open",
        Some("won") => "Won",
        Some("lost") => "Lost",
        Some("warning_needs_response" | "warning_under_review" | "warning_closed") => {
            return Ok(true);
        }
        _ => return Ok(false),
    };
    let mut tx = app.pool.begin().await?;
    let row=sqlx::query("SELECT i.order_id,o.tenant_id,i.period_end FROM billing.invoice i JOIN billing.commercial_order o ON o.order_id=i.order_id JOIN billing.subscription s ON s.order_id=i.order_id WHERE i.provider_payment_intent_ref=$1 AND i.state='Paid' LIMIT 1 FOR UPDATE OF s")
        .bind(payment_intent).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let order: Uuid = row.try_get("order_id")?;
    let tenant: Uuid = row.try_get("tenant_id")?;
    let period_end: Option<time::OffsetDateTime> = row.try_get("period_end")?;
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT state FROM billing.commercial_dispute WHERE provider_dispute_ref=$1 FOR UPDATE",
    )
    .bind(reference)
    .fetch_optional(&mut *tx)
    .await?;
    if matches!(existing.as_deref(), Some("Won" | "Lost")) {
        tx.commit().await?;
        return Ok(true);
    }
    sqlx::query("INSERT INTO billing.commercial_dispute (dispute_id,order_id,provider_dispute_ref,state) VALUES ($1,$2,$3,$4) ON CONFLICT (provider_dispute_ref) DO UPDATE SET state=EXCLUDED.state WHERE billing.commercial_dispute.order_id=EXCLUDED.order_id")
        .bind(Uuid::now_v7()).bind(order).bind(reference).bind(observed).execute(&mut *tx).await?;
    match observed {
        "Open" => {
            sqlx::query("UPDATE billing.subscription SET state='Disputed',updated_at=now() WHERE order_id=$1")
                .bind(order).execute(&mut *tx).await?;
            enqueue_grant(&mut tx, app, order, tenant, reference, "Frozen", None).await?;
        }
        "Won" if period_end.is_some_and(|end| end > time::OffsetDateTime::now_utc()) => {
            let refunded:Option<Uuid>=sqlx::query_scalar("SELECT refund_id FROM billing.commercial_refund WHERE order_id=$1 AND state='Succeeded' LIMIT 1")
                .bind(order).fetch_optional(&mut *tx).await?;
            if refunded.is_none() {
                sqlx::query("UPDATE billing.subscription SET state='Active',updated_at=now() WHERE order_id=$1 AND state='Disputed'")
                    .bind(order).execute(&mut *tx).await?;
                enqueue_grant(
                    &mut tx,
                    app,
                    order,
                    tenant,
                    &format!("{reference}:won"),
                    "Active",
                    period_end,
                )
                .await?;
            } else {
                sqlx::query("UPDATE billing.subscription SET state='Restricted',updated_at=now() WHERE order_id=$1 AND state='Disputed'")
                    .bind(order).execute(&mut *tx).await?;
                enqueue_grant(
                    &mut tx,
                    app,
                    order,
                    tenant,
                    &format!("{reference}:refunded"),
                    "Restricted",
                    None,
                )
                .await?;
            }
        }
        _ => {
            sqlx::query("UPDATE billing.subscription SET state='Restricted',updated_at=now() WHERE order_id=$1 AND state='Disputed'")
                .bind(order).execute(&mut *tx).await?;
            enqueue_grant(
                &mut tx,
                app,
                order,
                tenant,
                &format!("{reference}:lost"),
                "Restricted",
                None,
            )
            .await?;
        }
    }
    tx.commit().await?;
    Ok(true)
}

async fn enqueue_grant(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    _app: &App,
    order: Uuid,
    tenant: Uuid,
    version: &str,
    state: &str,
    valid_until: Option<time::OffsetDateTime>,
) -> Result<()> {
    let row = sqlx::query("SELECT c.feature_key,c.benefits FROM billing.commercial_order o JOIN billing.catalog_revision c ON c.revision_id=o.revision_id WHERE o.order_id=$1")
        .bind(order).fetch_one(&mut **tx).await?;
    sqlx::query("INSERT INTO billing.grant_outbox (fact_id,order_id,tenant_id,schema_family,source_version,state,feature_key,benefits,valid_until) VALUES ($1,$2,$3,'CommercialPayment',$4,$5,$6,$7,$8) ON CONFLICT (order_id,source_version,state) DO NOTHING")
        .bind(Uuid::now_v7()).bind(order).bind(tenant).bind(version).bind(state).bind(row.get::<String,_>("feature_key")).bind(row.get::<Value,_>("benefits")).bind(valid_until)
        .execute(&mut **tx).await?;
    Ok(())
}

async fn publish_grants(app: &App) -> Result<()> {
    let rows=sqlx::query("SELECT fact_id,source_sequence,order_id,tenant_id,source_version,state,feature_key,benefits,valid_until FROM billing.grant_outbox WHERE published_at IS NULL ORDER BY source_sequence LIMIT 32")
        .fetch_all(&app.pool).await?;
    for row in rows {
        let fact: Uuid = row.try_get("fact_id")?;
        let event = json!({"fact_id":fact,"source_sequence":row.get::<i64,_>("source_sequence"),"order_id":row.get::<Uuid,_>("order_id"),"tenant_id":row.get::<Uuid,_>("tenant_id"),
            "schema_family":"CommercialPayment","source_version":row.get::<String,_>("source_version"),
            "state":row.get::<String,_>("state"),"feature_key":row.get::<String,_>("feature_key"),"benefits":row.get::<Value,_>("benefits"),
            "valid_until":row.get::<Option<time::OffsetDateTime>,_>("valid_until").map(|value|value.unix_timestamp())});
        let response = app
            .client
            .post(format!(
                "{}/internal/v1/billing/grants",
                app.control_url.trim_end_matches('/')
            ))
            .header("x-billing-grant-token", &app.control_token)
            .json(&event)
            .send()
            .await;
        if response.is_ok_and(|value| value.status().is_success()) {
            sqlx::query("UPDATE billing.grant_outbox SET published_at=now() WHERE fact_id=$1 AND published_at IS NULL")
                .bind(fact).execute(&app.pool).await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn paid_invoice_is_the_only_initial_fulfillment_and_dispute_freezes_grant() {
        let Ok(url) = std::env::var("TOBOT_S7_BILLING_TEST_DATABASE_URL") else {
            return;
        };
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let suffix = Uuid::now_v7().simple().to_string();
        let price_id = format!("price_{suffix}");
        let revision_id = Uuid::now_v7();
        let app = App {
            pool: pool.clone(),
            client: reqwest::Client::new(),
            stripe_key: "sk_test_fixture".to_owned(),
            provider_account: "acct_s7_test".to_owned(),
            app_origin: "https://dash.tobot.test".to_owned(),
            control_url: "http://127.0.0.1:1".to_owned(),
            control_token: "x".repeat(32),
            command_token: "x".repeat(32),
            provider_token: "x".repeat(32),
        };
        let publication = CatalogPublication {
            revision_id,
            product_key: "base".to_owned(),
            product_kind: "BasePlan".to_owned(),
            display_name: "Test plan".to_owned(),
            provider: "Stripe".to_owned(),
            environment: "test".to_owned(),
            provider_account: app.provider_account.clone(),
            provider_price_ref: price_id.clone(),
            currency: "usd".to_owned(),
            unit_amount: 1200,
            interval_name: "month".to_owned(),
            feature_key: "platform.base".to_owned(),
            benefits: vec![
                tobot_persistence::CatalogBenefit::Feature {
                    key: "platform.base".to_owned(),
                },
                tobot_persistence::CatalogBenefit::Limit {
                    key: "support.max_open_tickets".to_owned(),
                    quantity: 25,
                    unit: "tickets".to_owned(),
                },
            ],
            regions: vec!["US".to_owned()],
            tax_classification: "txcd_10000000".to_owned(),
            merchant_of_record: "Tobot test".to_owned(),
            terms_url: "https://example.com/terms".to_owned(),
            privacy_url: "https://example.com/privacy".to_owned(),
            support_url: "https://example.com/support".to_owned(),
            grace_seconds: 86400,
        };
        apply_catalog(&app, &publication).await.unwrap();
        apply_catalog(&app, &publication).await.unwrap();
        let mut changed = publication.clone();
        changed.unit_amount += 1;
        assert!(apply_catalog(&app, &changed).await.is_err());
        let owner = Uuid::now_v7();
        let order = Uuid::now_v7();
        let attempt = Uuid::now_v7();
        let tenant = Uuid::now_v7();
        let customer = format!("cus_{suffix}");
        let session = format!("cs_{suffix}");
        let subscription = format!("sub_{suffix}");
        let invoice = format!("in_{suffix}");
        let payment = format!("pi_{suffix}");
        sqlx::query(
            "INSERT INTO billing.billing_owner (billing_owner_id,account_id) VALUES ($1,$2)",
        )
        .bind(owner)
        .bind(Uuid::now_v7())
        .execute(&pool)
        .await
        .unwrap();
        let unenrolled = CheckoutCommand {
            tenant_id: Uuid::now_v7(),
            guild_id: "123".to_owned(),
            actor_account_id: Uuid::now_v7(),
            semantic_key: Uuid::now_v7(),
            revision_id,
        };
        assert!(start_checkout(&app, &unenrolled).await.is_err());
        sqlx::query("INSERT INTO billing.scope_binding (binding_id,billing_owner_id,tenant_id,guild_id,state) VALUES ($1,$2,$3,'123','Active')")
            .bind(Uuid::now_v7()).bind(owner).bind(tenant).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.scope_binding (binding_id,billing_owner_id,tenant_id,guild_id,state) VALUES ($1,$2,$3,'456','Active')")
            .bind(Uuid::now_v7()).bind(owner).bind(Uuid::now_v7()).execute(&pool).await.unwrap();
        assert!(sqlx::query("INSERT INTO billing.scope_binding (binding_id,billing_owner_id,tenant_id,guild_id,state) VALUES ($1,$2,$3,'123','Active')")
            .bind(Uuid::now_v7()).bind(owner).bind(tenant).execute(&pool).await.is_err());
        sqlx::query("INSERT INTO billing.provider_customer_mapping (mapping_id,billing_owner_id,provider_account,environment,provider_customer_ref,state) VALUES ($1,$2,$3,'test',$4,'Active')")
            .bind(Uuid::now_v7()).bind(owner).bind(&app.provider_account).bind(&customer).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.commercial_order (order_id,semantic_key,billing_owner_id,tenant_id,guild_id,revision_id,state) VALUES ($1,$2,$3,$4,'123',$5,'Open')")
            .bind(order).bind(Uuid::now_v7()).bind(owner).bind(tenant).bind(revision_id).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.checkout_attempt (attempt_id,order_id,state,provider_session_ref) VALUES ($1,$2,'Open',$3)")
            .bind(attempt).bind(order).bind(&session).execute(&pool).await.unwrap();
        let session_event = json!({"id":session,"client_reference_id":attempt.to_string(),"subscription":subscription,
            "customer":customer});
        assert!(apply_session(&app, &session_event).await.unwrap());
        let state: String =
            sqlx::query_scalar("SELECT state FROM billing.commercial_order WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(state, "Open");
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM billing.grant_outbox WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 0);
        let period = (time::OffsetDateTime::now_utc() + time::Duration::days(30)).unix_timestamp();
        let paid = json!({"id":invoice,"status":"paid","paid":true,"currency":"usd","amount_paid":1200,
            "parent":{"subscription_details":{"subscription":subscription}},"customer":customer,"payment_intent":payment,
            "lines":{"data":[{"quantity":1,"pricing":{"price_details":{"price":price_id}},"period":{"end":period}}]}});
        assert!(apply_paid_invoice(&app, &paid).await.unwrap());
        assert!(apply_paid_invoice(&app, &paid).await.unwrap());
        let state: String =
            sqlx::query_scalar("SELECT state FROM billing.commercial_order WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(state, "Fulfilled");
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM billing.grant_outbox WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
        let pinned_benefits: Value = sqlx::query_scalar(
            "SELECT benefits FROM billing.grant_outbox WHERE order_id=$1 AND state='Active'",
        )
        .bind(order)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            pinned_benefits,
            serde_json::to_value(&publication.benefits).unwrap()
        );
        let dispute =
            json!({"id":format!("dp_{suffix}"),"payment_intent":payment,"status":"needs_response"});
        assert!(apply_dispute(&app, &dispute).await.unwrap());
        let state: String =
            sqlx::query_scalar("SELECT state FROM billing.subscription WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(state, "Disputed");
        assert!(apply_paid_invoice(&app, &paid).await.unwrap());
        let disputed: String =
            sqlx::query_scalar("SELECT state FROM billing.subscription WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(disputed, "Disputed");
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM billing.grant_outbox WHERE order_id=$1 AND state='Frozen'",
        )
        .bind(order)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
        let won = json!({"id":format!("dp_{suffix}"),"payment_intent":payment,"status":"won"});
        assert!(apply_dispute(&app, &won).await.unwrap());
        let restored: String =
            sqlx::query_scalar("SELECT state FROM billing.subscription WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(restored, "Active");
        let later_period =
            (time::OffsetDateTime::now_utc() + time::Duration::days(60)).unix_timestamp();
        let mut renewal = paid.clone();
        renewal["id"] = json!(format!("in_renewal_{suffix}"));
        renewal["payment_intent"] = json!(format!("pi_renewal_{suffix}"));
        renewal["lines"]["data"][0]["period"]["end"] = json!(later_period);
        assert!(apply_paid_invoice(&app, &renewal).await.unwrap());
        assert!(apply_paid_invoice(&app, &paid).await.unwrap());
        let retained_period: time::OffsetDateTime =
            sqlx::query_scalar("SELECT period_end FROM billing.subscription WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(retained_period.unix_timestamp(), later_period);
        let mut old_failure = paid.clone();
        old_failure["status"] = json!("open");
        old_failure["paid"] = json!(false);
        assert!(apply_failed_invoice(&app, &old_failure).await.unwrap());
        let after_old_failure: String =
            sqlx::query_scalar("SELECT state FROM billing.subscription WHERE order_id=$1")
                .bind(order)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(after_old_failure, "Active");
        let refund = json!({"id":format!("re_{suffix}"),"payment_intent":payment,
            "amount":1200,"currency":"usd","status":"succeeded"});
        assert!(apply_refund(&app, &refund).await.unwrap());
        assert!(apply_refund(&app, &refund).await.unwrap());
        let reversals: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM billing.grant_outbox WHERE order_id=$1 AND state='Reversed'",
        )
        .bind(order)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(reversals, 1);
        let paid_state: String =
            sqlx::query_scalar("SELECT state FROM billing.invoice WHERE provider_invoice_ref=$1")
                .bind(&invoice)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(paid_state, "Paid");
    }

    #[tokio::test]
    async fn expired_incomplete_subscription_releases_the_open_order() {
        let Ok(url) = std::env::var("TOBOT_S7_BILLING_TEST_DATABASE_URL") else {
            return;
        };
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let app = App {
            pool: pool.clone(),
            client: reqwest::Client::new(),
            stripe_key: "sk_test_fixture".to_owned(),
            provider_account: "acct_s7_test".to_owned(),
            app_origin: "https://dash.tobot.test".to_owned(),
            control_url: "http://127.0.0.1:1".to_owned(),
            control_token: "x".repeat(32),
            command_token: "x".repeat(32),
            provider_token: "x".repeat(32),
        };
        let suffix = Uuid::now_v7().simple().to_string();
        let owner = Uuid::now_v7();
        let order = Uuid::now_v7();
        let revision = Uuid::now_v7();
        let subscription = format!("sub_{suffix}");
        sqlx::query("INSERT INTO billing.catalog_revision (revision_id,product_key,provider_price_ref,currency,unit_amount,interval_name,feature_key,publication,benefits) VALUES ($1,'base',$2,'usd',499,'month','platform.base',$3,'[]'::jsonb)")
            .bind(revision).bind(format!("price_{suffix}")).bind(json!({"display_name":"Tobot Pro","unit_amount":499,"currency":"usd","interval_name":"month","benefits":[]})).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.billing_owner (billing_owner_id,account_id) VALUES ($1,$2)")
            .bind(owner).bind(Uuid::now_v7()).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.commercial_order (order_id,semantic_key,billing_owner_id,tenant_id,guild_id,revision_id,state) VALUES ($1,$2,$3,$4,'123',$5,'Open')")
            .bind(order).bind(Uuid::now_v7()).bind(owner).bind(Uuid::now_v7()).bind(revision).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.checkout_attempt (attempt_id,order_id,state,provider_session_ref,provider_subscription_ref) VALUES ($1,$2,'Completed',$3,$4)")
            .bind(Uuid::now_v7()).bind(order).bind(format!("cs_{suffix}")).bind(&subscription).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.subscription (subscription_id,order_id,provider_subscription_ref,state) VALUES ($1,$2,$3,'Incomplete')")
            .bind(Uuid::now_v7()).bind(order).bind(&subscription).execute(&pool).await.unwrap();
        let expired = json!({"id": subscription, "status": "incomplete_expired"});
        assert!(apply_subscription_update(&app, &expired).await.unwrap());
        assert!(apply_subscription_update(&app, &expired).await.unwrap());
        let order_state: String = sqlx::query_scalar("SELECT state FROM billing.commercial_order WHERE order_id=$1")
            .bind(order).fetch_one(&pool).await.unwrap();
        let attempt_state: String = sqlx::query_scalar("SELECT state FROM billing.checkout_attempt WHERE order_id=$1")
            .bind(order).fetch_one(&pool).await.unwrap();
        let subscription_state: String = sqlx::query_scalar("SELECT state FROM billing.subscription WHERE order_id=$1")
            .bind(order).fetch_one(&pool).await.unwrap();
        let grants: i64 = sqlx::query_scalar("SELECT count(*) FROM billing.grant_outbox WHERE order_id=$1")
            .bind(order).fetch_one(&pool).await.unwrap();
        assert_eq!(order_state, "Cancelled");
        assert_eq!(attempt_state, "Expired");
        assert_eq!(subscription_state, "Cancelled");
        assert_eq!(grants, 0);
    }

    #[tokio::test]
    async fn paid_invoice_without_legacy_paid_flag_fulfills() {
        let Ok(url) = std::env::var("TOBOT_S7_BILLING_TEST_DATABASE_URL") else {
            return;
        };
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let suffix = Uuid::now_v7().simple().to_string();
        let app = App {
            pool: pool.clone(),
            client: reqwest::Client::new(),
            stripe_key: "sk_test_fixture".to_owned(),
            provider_account: "acct_s7_test".to_owned(),
            app_origin: "https://dash.tobot.test".to_owned(),
            control_url: "http://127.0.0.1:1".to_owned(),
            control_token: "x".repeat(32),
            command_token: "x".repeat(32),
            provider_token: "x".repeat(32),
        };
        let owner = Uuid::now_v7();
        let order = Uuid::now_v7();
        let revision = Uuid::now_v7();
        let price = format!("price_{suffix}");
        let customer = format!("cus_{suffix}");
        let subscription = format!("sub_{suffix}");
        let period = (time::OffsetDateTime::now_utc() + time::Duration::days(20)).unix_timestamp();
        let publication = json!({
            "revision_id": revision,
            "product_key": "legacy.paid",
            "product_kind": "BasePlan",
            "display_name": "Tobot Pro",
            "provider": "Stripe",
            "environment": "test",
            "provider_account": app.provider_account,
            "provider_price_ref": price,
            "currency": "usd",
            "unit_amount": 499,
            "interval_name": "month",
            "feature_key": "platform.base",
            "benefits": [],
            "regions": ["US"],
            "tax_classification": "txcd_10000000",
            "merchant_of_record": "Tobot test",
            "terms_url": "https://example.com/terms",
            "privacy_url": "https://example.com/privacy",
            "support_url": "https://example.com/support",
            "grace_seconds": 86400
        });
        sqlx::query("INSERT INTO billing.catalog_revision (revision_id,product_key,provider_price_ref,currency,unit_amount,interval_name,feature_key,publication,benefits) VALUES ($1,'legacy.paid',$2,'usd',499,'month','platform.base',$3,'[]'::jsonb)")
            .bind(revision).bind(&price).bind(&publication).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.billing_owner (billing_owner_id,account_id) VALUES ($1,$2)")
            .bind(owner).bind(Uuid::now_v7()).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.provider_customer_mapping (mapping_id,billing_owner_id,provider_account,environment,provider_customer_ref,state) VALUES ($1,$2,$3,'test',$4,'Active')")
            .bind(Uuid::now_v7()).bind(owner).bind(&app.provider_account).bind(&customer).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.commercial_order (order_id,semantic_key,billing_owner_id,tenant_id,guild_id,revision_id,state) VALUES ($1,$2,$3,$4,'123',$5,'Open')")
            .bind(order).bind(Uuid::now_v7()).bind(owner).bind(Uuid::now_v7()).bind(revision).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO billing.subscription (subscription_id,order_id,provider_subscription_ref,state) VALUES ($1,$2,$3,'Incomplete')")
            .bind(Uuid::now_v7()).bind(order).bind(&subscription).execute(&pool).await.unwrap();
        let invoice = json!({
            "id": format!("in_{suffix}"),
            "status": "paid",
            "currency": "usd",
            "amount_paid": 499,
            "customer": customer,
            "payment_intent": format!("pi_{suffix}"),
            "parent": {"subscription_details": {"subscription": subscription}},
            "lines": {"data": [{"quantity": 1, "pricing": {"price_details": {"price": price}}, "period": {"end": period}}]}
        });
        assert!(apply_paid_invoice(&app, &invoice).await.unwrap());
        let state: String = sqlx::query_scalar("SELECT state FROM billing.commercial_order WHERE order_id=$1")
            .bind(order).fetch_one(&pool).await.unwrap();
        assert_eq!(state, "Fulfilled");
    }
}
