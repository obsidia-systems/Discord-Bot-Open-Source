//! Proceso privado de créditos de IA y ejecución de texto.
//! No tiene token de Discord ni credencial de Billing.

mod desk;
mod provider;
mod rules;
mod secret;
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
use secret::SecretBox;
use sqlx::postgres::PgPoolOptions;
use store::{AiError, AiStore, GrantInput, PricingInput, TextInput};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_envelope::{CommandAdmission, CommandEnvelope, verify_money_request_signature};
use tracing::error;
use uuid::Uuid;

use crate::rules::AttemptClass;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Clone)]
struct AppState {
    store: AiStore,
    service_token: Arc<str>,
    receipt_key: Arc<[u8]>,
    allow_fixture: bool,
    secrets: Option<SecretBox>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let database_url =
        std::env::var("TOBOT_AI_DATABASE_URL").context("missing TOBOT_AI_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await?;
    if std::env::args().any(|argument| argument == "--migrate") {
        MIGRATOR.run(&pool).await?;
        return Ok(());
    }
    let token =
        std::env::var("TOBOT_AI_SERVICE_TOKEN").context("missing TOBOT_AI_SERVICE_TOKEN")?;
    let key = std::env::var("TOBOT_AI_RECEIPT_KEY").context("missing TOBOT_AI_RECEIPT_KEY")?;
    if token.len() < 32 || key.len() < 32 {
        anyhow::bail!("AI service credentials must be at least 32 characters");
    }
    let application_id =
        std::env::var("TOBOT_DISCORD_APPLICATION_ID").unwrap_or_else(|_| "tobot-ai".to_owned());
    let store = AiStore {
        pool,
        application_id,
    };
    let bind: SocketAddr = std::env::var("TOBOT_AI_BIND")
        .unwrap_or_else(|_| "0.0.0.0:8088".to_owned())
        .parse()?;
    let app = router(AppState {
        store: store.clone(),
        service_token: Arc::from(token),
        receipt_key: Arc::from(key.into_bytes()),
        allow_fixture: std::env::var("TOBOT_AI_ALLOW_FIXTURE").ok().as_deref() == Some("1"),
        secrets: SecretBox::from_env(),
    });
    tracing::info!(%bind, "ai credits starting");
    tokio::select! {
        result = axum::serve(tokio::net::TcpListener::bind(bind).await?, app) => result.context("ai listener failed"),
        result = sweep(store) => result,
    }
}

async fn sweep(store: AiStore) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        if let Err(error) = store.sweep(OffsetDateTime::now_utc()).await {
            error!(?error, "ai credit sweep delayed");
        }
    }
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(|| async { StatusCode::NO_CONTENT }))
        .route("/health/ready", get(ready))
        .route("/internal/v1/ai/command", post(command))
        .route("/internal/v1/ai/pricing", get(pricing))
        .route("/internal/v1/ai/usage/{tenant}/{actor}", get(usage))
        .route("/internal/v1/ai/reviews/{tenant}", get(reviews))
        .route("/internal/v1/ai/desk", get(desk::desk))
        .route("/internal/v1/ai/providers", post(desk::save_provider))
        .route(
            "/internal/v1/ai/providers/enable",
            post(desk::enable_provider),
        )
        .route(
            "/internal/v1/ai/providers/models",
            post(desk::refresh_models),
        )
        .route("/internal/v1/ai/models/price", post(desk::save_price))
        .route("/internal/v1/ai/functions/ask", post(desk::save_ask))
        .route("/internal/v1/ai/operations", get(desk::operations))
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

pub(crate) fn authorized(
    state: &AppState,
    headers: &HeaderMap,
    method: &str,
    uri: &Uri,
    body: &[u8],
) -> bool {
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
        .get("x-ai-expires")
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
        .get("x-ai-signature")
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
    let Ok(parsed) = CommandEnvelope::parse_s0(&body) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if !parsed.command_name.is_ai_credit() {
        return StatusCode::BAD_REQUEST.into_response();
    }
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
    let now = OffsetDateTime::now_utc();
    let outcome = dispatch(&state, &command, now).await;
    match outcome {
        Ok(value) => Json(value).into_response(),
        Err(AiError::Rejected(code)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({"code": code})),
        )
            .into_response(),
        Err(AiError::Unavailable(code)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"code": code})),
        )
            .into_response(),
        Err(AiError::Conflict) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"code": "conflict"})),
        )
            .into_response(),
        Err(AiError::Database(error)) => {
            error!(%error, "ai command failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn dispatch(
    state: &AppState,
    command: &CommandEnvelope,
    now: OffsetDateTime,
) -> Result<serde_json::Value, AiError> {
    match command.schema_name.as_str() {
        "PublishAiPricingRevision" => {
            let pricing = PricingInput {
                pricing_revision_id: uuid_field(&command.payload, "pricing_revision_id")?,
                model_class: text_field(&command.payload, "model_class")?,
                estimate_amount: int_field(&command.payload, "estimate_amount")?,
                maximum_amount: int_field(&command.payload, "maximum_amount")?,
                unit_charge: int_field(&command.payload, "unit_charge")?,
                user_daily_ceiling: int_field(&command.payload, "user_daily_ceiling")?,
                guild_daily_ceiling: int_field(&command.payload, "guild_daily_ceiling")?,
            };
            state.store.publish_pricing(&pricing, now).await?;
            Ok(serde_json::json!({"pricing_revision_id": pricing.pricing_revision_id}))
        }
        "ApplyAiCreditGrant" => {
            let expires_at = command
                .payload
                .get("expires_at")
                .and_then(serde_json::Value::as_i64)
                .map(OffsetDateTime::from_unix_timestamp)
                .transpose()
                .map_err(|_| AiError::Rejected("invalid expiry"))?;
            let grant = GrantInput {
                source_ref: uuid_field(&command.payload, "source_ref")?,
                credit_minors: int_field(&command.payload, "credit_minors")?,
                expires_at,
            };
            let lot = state
                .store
                .apply_grant(command.tenant_id, &grant, now)
                .await?;
            Ok(serde_json::json!({"lot_id": lot}))
        }
        "RunTextOperation" => {
            let scripted = command
                .payload
                .get("scripted_class")
                .and_then(serde_json::Value::as_str);
            if scripted.is_some() && !state.allow_fixture {
                return Err(AiError::Rejected("fixture class is not enabled"));
            }
            let class = scripted.and_then(AttemptClass::parse);
            let input = TextInput {
                operation_id: uuid_field(&command.payload, "operation_id")?,
                semantic_key: uuid_field(&command.payload, "semantic_key")?,
                actor_id: text_field(&command.payload, "actor_id")?,
                pricing_revision_id: uuid_field(&command.payload, "pricing_revision_id")?,
                prompt: text_field(&command.payload, "prompt")?,
                script: class.into_iter().collect(),
            };
            let resolved = if input.script.is_empty() {
                desk::resolve_call(
                    &state.store,
                    input.pricing_revision_id,
                    state.secrets.as_ref(),
                )
                .await?
            } else {
                desk::ResolvedCall {
                    provider: None,
                    prices: None,
                    system_prompt: String::new(),
                }
            };
            let outcome = state
                .store
                .run_text(
                    command.tenant_id,
                    &input,
                    now,
                    resolved.provider.as_ref(),
                    resolved.prices,
                    &resolved.system_prompt,
                )
                .await?;
            Ok(
                serde_json::to_value(outcome)
                    .map_err(|_| AiError::Rejected("response encoding"))?,
            )
        }
        "ReconcileAiCreditReservation" => {
            let outcome = state
                .store
                .reconcile(
                    command.tenant_id,
                    uuid_field(&command.payload, "reservation_id")?,
                    &text_field(&command.payload, "evidence")?,
                    now,
                )
                .await?;
            Ok(
                serde_json::to_value(outcome)
                    .map_err(|_| AiError::Rejected("response encoding"))?,
            )
        }
        _ => Err(AiError::Rejected("unsupported command")),
    }
}

async fn pricing(State(state): State<AppState>, uri: Uri, headers: HeaderMap) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.store.active_pricing().await {
        Ok(Some(revision)) => {
            Json(serde_json::json!({"pricing_revision_id": revision})).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            error!(?error, "ai pricing read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn usage(
    State(state): State<AppState>,
    Path((tenant, actor)): Path<(Uuid, String)>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[])
        || !actor.chars().all(|character| character.is_ascii_digit())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.store.usage(tenant, &actor).await {
        Ok(view) => Json(view).into_response(),
        Err(error) => {
            error!(?error, "ai usage read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn reviews(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.store.open_reviews(tenant).await {
        Ok(rows) => Json(serde_json::json!({"reviews": rows})).into_response(),
        Err(error) => {
            error!(?error, "ai review read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

fn uuid_field(payload: &serde_json::Value, key: &str) -> Result<Uuid, AiError> {
    payload
        .get(key)
        .and_then(serde_json::Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(AiError::Rejected("invalid identifier"))
}

fn text_field(payload: &serde_json::Value, key: &str) -> Result<String, AiError> {
    payload
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or(AiError::Rejected("invalid text"))
}

fn int_field(payload: &serde_json::Value, key: &str) -> Result<i64, AiError> {
    payload
        .get(key)
        .and_then(serde_json::Value::as_i64)
        .ok_or(AiError::Rejected("invalid amount"))
}
