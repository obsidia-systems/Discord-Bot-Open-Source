//! Admisión de `/ask` y entrega del grant de compensación al diario de créditos.

use std::collections::HashMap;

use axum::{
    Json,
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use reqwest::{Client, Method, StatusCode as HttpStatus};
use serde::Deserialize;
use serde_json::{Value, json};
use subtle::ConstantTimeEq;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_delivery_client::SupportDeliveryClient;
use tobot_discord_adapter::{InteractionCallback, TransportError};
use tobot_envelope::{CommandEnvelope, TraceContext, money_request_signature};
use tobot_persistence::{EarningsStore, PlatformEntitlementStore};
use uuid::Uuid;

use super::{AppState, session_id};
use crate::welcome::access;

#[derive(Clone)]
pub(super) struct AiClient {
    http: Client,
    base: String,
    token: String,
    key: Vec<u8>,
}

impl AiClient {
    pub(super) fn from_env() -> Option<Self> {
        let base = std::env::var("TOBOT_AI_URL").ok()?;
        let token = std::env::var("TOBOT_AI_SERVICE_TOKEN").ok()?;
        let key = std::env::var("TOBOT_AI_RECEIPT_KEY").ok()?.into_bytes();
        if base.is_empty() || token.len() < 32 || key.len() < 32 {
            return None;
        }
        Some(Self {
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(50))
                .build()
                .ok()?,
            base: base.trim_end_matches('/').to_owned(),
            token,
            key,
        })
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Vec<u8>,
    ) -> Result<Value, StatusCode> {
        let expiry = OffsetDateTime::now_utc().unix_timestamp() + 30;
        let signature = money_request_signature(&self.key, method.as_str(), path, expiry, &body)
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let response = self
            .http
            .request(method, format!("{}{path}", self.base))
            .bearer_auth(&self.token)
            .header("x-ai-expires", expiry.to_string())
            .header("x-ai-signature", signature)
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let status = response.status();
        if status == HttpStatus::NOT_FOUND {
            return Err(StatusCode::NOT_FOUND);
        }
        if status == HttpStatus::NO_CONTENT {
            return Ok(Value::Null);
        }
        let payload: Value = response
            .json()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        if status.is_success() {
            Ok(payload)
        } else if status == HttpStatus::UNPROCESSABLE_ENTITY {
            Err(StatusCode::UNPROCESSABLE_ENTITY)
        } else if status == HttpStatus::CONFLICT {
            Err(StatusCode::CONFLICT)
        } else {
            Err(StatusCode::SERVICE_UNAVAILABLE)
        }
    }

    pub(super) async fn command(
        &self,
        tenant: Uuid,
        name: &str,
        payload: Value,
    ) -> Result<Value, StatusCode> {
        let now = OffsetDateTime::now_utc();
        let deadline = now + time::Duration::seconds(55);
        let command = CommandEnvelope {
            command_id: Uuid::now_v7(),
            schema_name: name.to_owned(),
            schema_version: 1,
            schema_family: Some("AiCreditReservation".to_owned()),
            actor_account_id: Uuid::now_v7(),
            tenant_id: tenant,
            idempotency_key: Uuid::now_v7(),
            deadline_at: deadline.format(&Rfc3339).unwrap_or_default(),
            correlation_id: Uuid::now_v7(),
            trace_context: TraceContext {
                trace_id: tenant.to_string(),
                span_id: "control".to_owned(),
            },
            payload,
        };
        let body = serde_json::to_vec(&command).map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        self.request(Method::POST, "/internal/v1/ai/command", body)
            .await
    }

    async fn pricing(&self) -> Result<Option<Uuid>, StatusCode> {
        match self
            .request(Method::GET, "/internal/v1/ai/pricing", Vec::new())
            .await
        {
            Ok(value) => value
                .get("pricing_revision_id")
                .and_then(Value::as_str)
                .and_then(|item| Uuid::parse_str(item).ok())
                .map(Some)
                .ok_or(StatusCode::SERVICE_UNAVAILABLE),
            Err(StatusCode::NOT_FOUND) => Ok(None),
            Err(code) => Err(code),
        }
    }

    /// Reenvía un cuerpo al proceso de IA. El cuerpo no se registra ni se guarda.
    pub(super) async fn exchange(
        &self,
        method: Method,
        path: &str,
        query: &str,
        body: Vec<u8>,
    ) -> Result<(u16, Vec<u8>), StatusCode> {
        let expiry = OffsetDateTime::now_utc().unix_timestamp() + 30;
        let signature = money_request_signature(&self.key, method.as_str(), path, expiry, &body)
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let url = if query.is_empty() {
            format!("{}{path}", self.base)
        } else {
            format!("{}{path}?{query}", self.base)
        };
        let response = self
            .http
            .request(method, url)
            .bearer_auth(&self.token)
            .header("x-ai-expires", expiry.to_string())
            .header("x-ai-signature", signature)
            .header(header::CONTENT_TYPE, "application/json")
            .body(body)
            .send()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let status = response.status().as_u16();
        let bytes = response
            .bytes()
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        Ok((status, bytes.to_vec()))
    }

    pub(super) async fn usage(&self, tenant: Uuid, actor: &str) -> Result<Value, StatusCode> {
        let path = format!("/internal/v1/ai/usage/{tenant}/{actor}");
        self.request(Method::GET, &path, Vec::new()).await
    }

    async fn reviews(&self, tenant: Uuid) -> Result<Value, StatusCode> {
        let path = format!("/internal/v1/ai/reviews/{tenant}");
        self.request(Method::GET, &path, Vec::new()).await
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PricingBody {
    pricing_revision_id: Uuid,
    model_class: String,
    estimate_amount: i64,
    maximum_amount: i64,
    unit_charge: i64,
    user_daily_ceiling: i64,
    guild_daily_ceiling: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CompensationBody {
    tenant_id: Uuid,
    source_ref: Uuid,
    credit_minors: i64,
    expires_at: Option<i64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ReconcileBody {
    tenant_id: Uuid,
    reservation_id: Uuid,
    evidence: String,
}

fn admin(headers: &HeaderMap, state: &AppState) -> bool {
    state
        .catalog_admin_token
        .as_deref()
        .is_some_and(|expected| {
            headers
                .get("x-catalog-admin-token")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value.as_bytes().ct_eq(expected.as_bytes()).into())
        })
}

pub(super) async fn publish_pricing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PricingBody>,
) -> Response {
    if !admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(ai) = state.ai.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let payload = json!({
        "pricing_revision_id": body.pricing_revision_id,
        "operation_class": "text",
        "model_class": body.model_class,
        "estimate_amount": body.estimate_amount,
        "maximum_amount": body.maximum_amount,
        "unit_charge": body.unit_charge,
        "user_daily_ceiling": body.user_daily_ceiling,
        "guild_daily_ceiling": body.guild_daily_ceiling,
    });
    match ai
        .command(
            body.pricing_revision_id,
            "PublishAiPricingRevision",
            payload,
        )
        .await
    {
        Ok(value) => Json(value).into_response(),
        Err(code) => code.into_response(),
    }
}

pub(super) async fn compensate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CompensationBody>,
) -> Response {
    if !admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(expires) = body
        .expires_at
        .map(OffsetDateTime::from_unix_timestamp)
        .transpose()
    else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let fact_id = Uuid::now_v7();
    if state
        .entitlement
        .apply_compensation(
            fact_id,
            body.tenant_id,
            body.source_ref,
            body.credit_minors,
            expires,
        )
        .await
        .is_err()
    {
        return StatusCode::CONFLICT.into_response();
    }
    if deliver(
        &state,
        fact_id,
        body.tenant_id,
        body.source_ref,
        body.credit_minors,
        expires,
    )
    .await
    .is_err()
    {
        return (
            StatusCode::ACCEPTED,
            Json(json!({"fact_id": fact_id, "delivered": false})),
        )
            .into_response();
    }
    Json(json!({"fact_id": fact_id, "delivered": true})).into_response()
}

pub(super) async fn reviews(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(tenant): Path<Uuid>,
) -> Response {
    if !admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(ai) = state.ai.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match ai.reviews(tenant).await {
        Ok(value) => Json(value).into_response(),
        Err(code) => code.into_response(),
    }
}

pub(super) async fn reconcile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ReconcileBody>,
) -> Response {
    if !admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !matches!(body.evidence.as_str(), "usage" | "absence") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Some(ai) = state.ai.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let payload = json!({
        "reservation_id": body.reservation_id,
        "evidence": body.evidence,
    });
    match ai
        .command(body.tenant_id, "ReconcileAiCreditReservation", payload)
        .await
    {
        Ok(value) => Json(json!({
            "reservation_state": value.get("reservation_state").and_then(Value::as_str).unwrap_or(""),
            "captured": value.get("captured").and_then(Value::as_i64).unwrap_or(0),
        }))
        .into_response(),
        Err(StatusCode::UNPROCESSABLE_ENTITY) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"code": "reservation is not in review"})),
        )
            .into_response(),
        Err(code) => code.into_response(),
    }
}

async fn deliver(
    state: &AppState,
    fact_id: Uuid,
    tenant: Uuid,
    source: Uuid,
    amount: i64,
    expires: Option<OffsetDateTime>,
) -> Result<(), StatusCode> {
    let Some(ai) = state.ai.as_ref() else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };
    let mut payload =
        json!({"source_ref": source, "credit_minors": amount, "feature_key": "ai.text"});
    if let Some(deadline) = expires {
        payload["expires_at"] = json!(deadline.unix_timestamp());
    }
    ai.command(tenant, "ApplyAiCreditGrant", payload).await?;
    state
        .entitlement
        .mark_compensation_delivered(fact_id)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(())
}

pub(super) async fn usage(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(code) = access(&state, &headers, tenant).await {
        return code.into_response();
    }
    let Some(cookie) = session_id(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let now = OffsetDateTime::from(state.clock.now());
    let session = match super::authorize_browser_session(&state, cookie, now).await {
        Ok(Some(value)) => value,
        Ok(None) => return StatusCode::UNAUTHORIZED.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let Ok(Some(member)) = state.identity.discord_user_id(session.account_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(ai) = state.ai.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match ai.usage(tenant, &member).await {
        Ok(value) => ([(header::CACHE_CONTROL, "private, no-store")], Json(value)).into_response(),
        Err(StatusCode::NOT_FOUND) => {
            Json(json!({"available": 0, "reserved": 0, "operations": []})).into_response()
        }
        Err(code) => code.into_response(),
    }
}

pub(super) async fn run_ask(
    entitlement: PlatformEntitlementStore,
    receipts: EarningsStore,
    delivery: SupportDeliveryClient,
    ai: Option<AiClient>,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        if let Err(error) =
            consume_ask(&entitlement, &receipts, &delivery, ai.as_ref(), &consumer).await
        {
            tracing::error!(%error, "ask interaction worker paused");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }
}

async fn consume_ask(
    entitlement: &PlatformEntitlementStore,
    receipts: &EarningsStore,
    delivery: &SupportDeliveryClient,
    ai: Option<&AiClient>,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event = parsed.event;
        if event.schema_name == "GatewayEventAccepted"
            && event.payload["kind"] == "AskCommand"
            && let Some(tenant) = event.tenant_id
            && let Some(interaction) = event.payload["interaction_id"].as_str()
            && let Some(token) = receipts.interaction_token(tenant, interaction).await?
        {
            let content = ask_reply(entitlement, receipts, ai, tenant, interaction).await;
            let callback = InteractionCallback {
                application_id: event.application_id.parse()?,
                interaction_id: interaction.parse()?,
                interaction_token: token,
                ephemeral: true,
            };
            match delivery.edit_deferred(callback, &content).await {
                Ok(()) | Err(TransportError::Rejected { status: 400 | 404 }) => {
                    receipts.delete_ask_prompt(tenant, interaction).await?;
                }
                Err(error) => return Err(error.into()),
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

async fn ask_reply(
    entitlement: &PlatformEntitlementStore,
    receipts: &EarningsStore,
    ai: Option<&AiClient>,
    tenant: Uuid,
    interaction: &str,
) -> String {
    if !entitlement.ai_text_active(tenant).await.unwrap_or(false) {
        return "Text operations are not available for this server.".to_owned();
    }
    let Some(ai) = ai else {
        return "The text operation could not be completed. Try again later.".to_owned();
    };
    let Ok(Some((actor, prompt))) = receipts.read_ask_prompt(tenant, interaction).await else {
        return "The prompt must be 1 to 500 characters.".to_owned();
    };
    let Ok(Some(pricing)) = ai.pricing().await else {
        return "Text pricing is not published.".to_owned();
    };
    let operation_id = Uuid::new_v5(
        &Uuid::NAMESPACE_OID,
        format!("ask-op:{tenant}:{interaction}").as_bytes(),
    );
    let semantic = Uuid::new_v5(
        &Uuid::NAMESPACE_OID,
        format!("ask:{tenant}:{interaction}").as_bytes(),
    );
    let payload = json!({
        "operation_id": operation_id,
        "semantic_key": semantic,
        "actor_id": actor,
        "pricing_revision_id": pricing,
        "prompt": prompt,
    });
    match ai.command(tenant, "RunTextOperation", payload).await {
        Ok(value) => reply_text(&value),
        Err(StatusCode::UNPROCESSABLE_ENTITY) => "Not enough AI credits.".to_owned(),
        Err(_) => "The text operation could not be completed. Try again later.".to_owned(),
    }
}

fn reply_text(value: &Value) -> String {
    if value["reservation_state"] == "Uncertain" || value["reservation_state"] == "Disputed" {
        return "The text operation is pending verification.".to_owned();
    }
    value["reply"]
        .as_str()
        .filter(|text| !text.is_empty())
        .unwrap_or("The text operation did not complete.")
        .to_owned()
}

pub(super) async fn deliver_pending(
    entitlement: PlatformEntitlementStore,
    ai: Option<AiClient>,
) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
    loop {
        interval.tick().await;
        let Some(ai) = ai.as_ref() else {
            continue;
        };
        let pending = entitlement.pending_compensations().await?;
        for (fact, tenant, source, amount, expires) in pending {
            let mut payload =
                json!({"source_ref": source, "credit_minors": amount, "feature_key": "ai.text"});
            if let Some(deadline) = expires {
                payload["expires_at"] = json!(deadline.unix_timestamp());
            }
            if ai
                .command(tenant, "ApplyAiCreditGrant", payload)
                .await
                .is_ok()
            {
                entitlement.mark_compensation_delivered(fact).await?;
            }
        }
    }
}

async fn forward(
    state: &AppState,
    headers: &HeaderMap,
    method: Method,
    path: &str,
    query: &str,
    body: Vec<u8>,
) -> Response {
    if !admin(headers, state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(ai) = state.ai.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match ai.exchange(method, path, query, body).await {
        Ok((status, bytes)) => forwarded(status, &bytes),
        Err(code) => code.into_response(),
    }
}

fn forwarded(status: u16, bytes: &[u8]) -> Response {
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::SERVICE_UNAVAILABLE);
    let body = scrub(bytes);
    (
        status,
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::CONTENT_TYPE, "application/json"),
        ],
        body,
    )
        .into_response()
}

fn scrub(bytes: &[u8]) -> Vec<u8> {
    if bytes.is_empty() {
        return Vec::new();
    }
    let Ok(mut value) = serde_json::from_slice::<Value>(bytes) else {
        return Vec::new();
    };
    strip_secrets(&mut value);
    serde_json::to_vec(&value).unwrap_or_default()
}

fn strip_secrets(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.retain(|key, _| {
                key != "secret"
                    && key != "api_key"
                    && key != "credential"
                    && key != "secret_ciphertext"
            });
            for child in map.values_mut() {
                strip_secrets(child);
            }
        }
        Value::Array(items) => {
            for item in items {
                strip_secrets(item);
            }
        }
        Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null => {}
    }
}

pub(super) async fn desk(State(state): State<AppState>, headers: HeaderMap) -> Response {
    forward(
        &state,
        &headers,
        Method::GET,
        "/internal/v1/ai/desk",
        "",
        Vec::new(),
    )
    .await
}

pub(super) async fn save_provider(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    forward(
        &state,
        &headers,
        Method::POST,
        "/internal/v1/ai/providers",
        "",
        body.to_vec(),
    )
    .await
}

pub(super) async fn enable_provider(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    forward(
        &state,
        &headers,
        Method::POST,
        "/internal/v1/ai/providers/enable",
        "",
        body.to_vec(),
    )
    .await
}

pub(super) async fn refresh_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    forward(
        &state,
        &headers,
        Method::POST,
        "/internal/v1/ai/providers/models",
        "",
        body.to_vec(),
    )
    .await
}

pub(super) async fn save_model_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    forward(
        &state,
        &headers,
        Method::POST,
        "/internal/v1/ai/models/price",
        "",
        body.to_vec(),
    )
    .await
}

pub(super) async fn save_ask(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    forward(
        &state,
        &headers,
        Method::POST,
        "/internal/v1/ai/functions/ask",
        "",
        body.to_vec(),
    )
    .await
}

#[derive(Deserialize)]
pub(super) struct OperationQuery {
    tenant_id: Option<Uuid>,
    actor_id: Option<String>,
    from: Option<i64>,
    to: Option<i64>,
}

pub(super) async fn operations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OperationQuery>,
) -> Response {
    if !admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(ai) = state.ai.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(encoded) = operation_query(&query) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok((status, bytes)) = ai
        .exchange(
            Method::GET,
            "/internal/v1/ai/operations",
            &encoded,
            Vec::new(),
        )
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if status != 200 {
        return forwarded(status, &bytes);
    }
    let Ok(mut value) = serde_json::from_slice::<Value>(&bytes) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    strip_secrets(&mut value);
    if let Err(code) = attach_guilds(&state, &mut value).await {
        return code.into_response();
    }
    (
        StatusCode::OK,
        [(header::CACHE_CONTROL, "no-store")],
        Json(value),
    )
        .into_response()
}

fn operation_query(query: &OperationQuery) -> Result<String, ()> {
    let mut parts = Vec::new();
    if let Some(tenant) = query.tenant_id {
        parts.push(format!("tenant_id={tenant}"));
    }
    if let Some(actor) = &query.actor_id {
        if actor.is_empty()
            || !actor.chars().all(|character| character.is_ascii_digit())
            || actor.len() > 32
        {
            return Err(());
        }
        parts.push(format!("actor_id={actor}"));
    }
    if let Some(from) = query.from {
        if from < 0 {
            return Err(());
        }
        parts.push(format!("from={from}"));
    }
    if let Some(to) = query.to {
        if to < 0 {
            return Err(());
        }
        parts.push(format!("to={to}"));
    }
    Ok(parts.join("&"))
}

async fn attach_guilds(state: &AppState, value: &mut Value) -> Result<(), StatusCode> {
    let Some(rows) = value.get_mut("operations").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    let mut ids = Vec::new();
    for row in rows.iter() {
        if let Some(tenant) = row
            .get("tenant_id")
            .and_then(Value::as_str)
            .and_then(|item| Uuid::parse_str(item).ok())
        {
            ids.push(tenant);
        }
    }
    ids.sort_unstable();
    ids.dedup();
    let found = state
        .entitlement
        .guild_snowflakes(&ids)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let names: HashMap<Uuid, String> = found.into_iter().collect();
    for row in rows {
        let guild = row
            .get("tenant_id")
            .and_then(Value::as_str)
            .and_then(|item| Uuid::parse_str(item).ok())
            .and_then(|tenant| names.get(&tenant).cloned());
        if let Some(object) = row.as_object_mut() {
            object.insert("guild_id".to_owned(), json!(guild));
        }
    }
    Ok(())
}
