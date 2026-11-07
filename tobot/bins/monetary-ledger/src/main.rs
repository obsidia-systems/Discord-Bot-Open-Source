//! Servicio privado del diario monetario. No contiene token ni cliente Discord.

mod store;

use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use sqlx::postgres::PgPoolOptions;
use store::{LedgerFault, LedgerResponse, LedgerStore};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamPublisher;
use tobot_envelope::{CommandAdmission, CommandEnvelope, verify_money_request_signature};
use tracing::{error, info, warn};
use uuid::Uuid;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Clone)]
struct AppState {
    store: LedgerStore,
    service_token: Arc<str>,
    receipt_key: Arc<[u8]>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let database_url =
        std::env::var("TOBOT_LEDGER_DATABASE_URL").context("missing TOBOT_LEDGER_DATABASE_URL")?;
    let token = std::env::var("TOBOT_LEDGER_SERVICE_TOKEN")
        .context("missing TOBOT_LEDGER_SERVICE_TOKEN")?;
    let key =
        std::env::var("TOBOT_LEDGER_RECEIPT_KEY").context("missing TOBOT_LEDGER_RECEIPT_KEY")?;
    if token.len() < 32 || key.len() < 32 {
        anyhow::bail!("Ledger credentials must be at least 32 characters");
    }
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    if std::env::args().any(|argument| argument == "--migrate") {
        MIGRATOR.run(&pool).await?;
        return Ok(());
    }
    let application_id = std::env::var("TOBOT_DISCORD_APPLICATION_ID")
        .context("missing TOBOT_DISCORD_APPLICATION_ID")?;
    let store = LedgerStore {
        pool: pool.clone(),
        application_id,
    };
    reconcile_before_ready(&store).await?;
    let redis_url = std::env::var("TOBOT_REDIS_URL").context("missing TOBOT_REDIS_URL")?;
    let publisher = RedisStreamPublisher::connect(&redis_url)?;
    let bind: SocketAddr = std::env::var("TOBOT_LEDGER_BIND")
        .unwrap_or_else(|_| "0.0.0.0:8085".to_owned())
        .parse()?;
    let app = router(AppState {
        store: store.clone(),
        service_token: Arc::from(token),
        receipt_key: Arc::from(key.into_bytes()),
    });
    info!(%bind, "monetary ledger starting");
    tokio::select! {
        result = axum::serve(tokio::net::TcpListener::bind(bind).await?,app) => result.context("ledger listener failed"),
        result = relay_outbox(store.clone(),publisher) => result,
        result = run_reconciliation(store) => result,
    }
}

async fn run_reconciliation(store: LedgerStore) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        match reconcile_before_ready(&store).await {
            Ok(()) => {}
            Err(error) => error!(%error,"periodic ledger reconciliation delayed"),
        }
    }
}

async fn reconcile_before_ready(store: &LedgerStore) -> anyhow::Result<()> {
    let tenants: Vec<Uuid> = sqlx::query_scalar("SELECT tenant_id FROM ledger.currency")
        .fetch_all(&store.pool)
        .await?;
    for tenant in tenants {
        if !store.reconcile(tenant).await? {
            warn!(%tenant,"ledger write circuit closed after reconciliation failure");
        }
    }
    Ok(())
}

async fn relay_outbox(store: LedgerStore, publisher: RedisStreamPublisher) -> anyhow::Result<()> {
    loop {
        match store.claim_outbox().await {
            Ok(Some((id, fence, raw))) => {
                let parsed = tobot_envelope::EventEnvelope::parse_s0(&raw)?;
                if let Err(error) = publisher.publish(&parsed.event, &raw).await {
                    warn!(%error,"ledger outbox publish delayed");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    continue;
                }
                store.mark_published(id, fence).await?;
            }
            Ok(None) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Err(error) => {
                error!(%error,"ledger outbox claim failed");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/health/ready", get(ready))
        .route("/internal/v1/ledger/command", post(command))
        .route("/internal/v1/ledger/policy/{tenant}", get(policy))
        .route("/internal/v1/ledger/wallet/{tenant}/{member}", get(wallet))
        .route("/internal/v1/ledger/reconcile/{tenant}", post(reconcile))
        .route("/internal/v1/ledger/circuit/{tenant}", post(circuit))
        .with_state(state)
}

async fn ready(State(state): State<AppState>) -> StatusCode {
    if sqlx::query("SELECT 1")
        .execute(&state.store.pool)
        .await
        .is_ok()
    {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

fn authorized(state: &AppState, headers: &HeaderMap, method: &str, uri: &Uri, body: &[u8]) -> bool {
    let Some(token) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
    else {
        return false;
    };
    if token.len() != state.service_token.len()
        || subtle::ConstantTimeEq::ct_eq(token.as_bytes(), state.service_token.as_bytes())
            .unwrap_u8()
            != 1
    {
        return false;
    }
    let Some(expires) = headers
        .get("x-ledger-expires")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<i64>().ok())
    else {
        return false;
    };
    let now = OffsetDateTime::now_utc().unix_timestamp();
    if expires < now || expires > now + 60 {
        return false;
    }
    let Some(signature) = headers
        .get("x-ledger-signature")
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    verify_money_request_signature(
        &state.receipt_key,
        method,
        uri.path(),
        expires,
        body,
        signature,
    )
}

async fn command(
    State(state): State<AppState>,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let parsed = match CommandEnvelope::parse_s0(&body) {
        Ok(parsed) if parsed.command_name.is_virtual_payment() => parsed,
        _ => return StatusCode::BAD_REQUEST.into_response(),
    };
    let command = parsed.command;
    let deadline = OffsetDateTime::parse(&command.deadline_at, &Rfc3339).ok();
    if !matches!(
        command.admit(
            command.tenant_id,
            deadline.is_none_or(|at| at < OffsetDateTime::now_utc())
        ),
        CommandAdmission::Admit
    ) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let outcome = match command.schema_name.as_str() {
        "PublishCurrencyPolicy" => state
            .store
            .publish_policy(&command)
            .await
            .map(LedgerResponse::Policy),
        "EnsureMemberWallet" => state
            .store
            .ensure_wallet(&command)
            .await
            .map(LedgerResponse::Wallet),
        "SettleIncomeAction" => state
            .store
            .settle_income(&command)
            .await
            .map(LedgerResponse::Settled),
        _ => Err(LedgerFault::Rejected("unsupported_command")),
    };
    respond(outcome)
}

fn respond(outcome: Result<LedgerResponse, LedgerFault>) -> Response {
    match outcome {
        Ok(value) => Json(value).into_response(),
        Err(LedgerFault::Rejected(code)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({"code":code})),
        )
            .into_response(),
        Err(LedgerFault::Conflict) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"code":"idempotency_conflict"})),
        )
            .into_response(),
        Err(LedgerFault::Database(error)) => {
            error!(%error,"ledger database failure");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
        Err(LedgerFault::Other(error)) => {
            error!(%error,"ledger command failure");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn policy(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.store.policy(tenant).await {
        Ok(Some(policy)) => Json(policy).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            error!(%error,"ledger policy read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn wallet(
    State(state): State<AppState>,
    Path((tenant, member)): Path<(Uuid, String)>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.store.wallet(tenant,&member).await {
        Ok(Some(wallet)) => match state.store.recent_postings(tenant,&member).await {
            Ok(postings) => Json(serde_json::json!({
                "tenant_id":wallet.tenant_id,"currency_id":wallet.currency_id,"member_id":wallet.member_id,
                "current":wallet.current,"available":wallet.available,"journal_sequence":wallet.journal_sequence,
                "recent_postings":postings,
            })).into_response(),
            Err(error) => {error!(%error,"ledger posting read failed");StatusCode::SERVICE_UNAVAILABLE.into_response()},
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(LedgerFault::Rejected(_)) => StatusCode::BAD_REQUEST.into_response(),
        Err(LedgerFault::Database(error)) => {error!(%error,"ledger wallet read failed");StatusCode::SERVICE_UNAVAILABLE.into_response()},
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

async fn reconcile(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.store.reconcile(tenant).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::CONFLICT.into_response(),
        Err(error) => {
            error!(%error,"ledger reconciliation failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct CircuitRequest {
    credit_enabled: bool,
}

async fn circuit(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(request) = serde_json::from_slice::<CircuitRequest>(&body) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    respond(
        state
            .store
            .set_credit_enabled(tenant, request.credit_enabled)
            .await
            .map(LedgerResponse::Policy),
    )
}
