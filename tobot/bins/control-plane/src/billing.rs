//! Fachada de Checkout y proyección de acceso; los resultados del navegador nunca son pago.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use subtle::ConstantTimeEq;
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_delivery_client::SupportDeliveryClient;
use tobot_discord_adapter::{InteractionCallback, TransportError};
use tobot_persistence::{
    CatalogBenefit, CatalogPublication, CommercialCatalogStore, CommercialGrant, DefaultPlan,
    EarningsStore, PlatformEntitlementStore, supported_catalog_capabilities,
};
use uuid::Uuid;

use super::{
    AppState, authorize_browser_session, authorize_mutation, live_user_guilds, session_id,
};
use crate::welcome::access;

#[derive(Clone)]
pub(super) struct BillingClient {
    url: String,
    command_token: String,
    grant_token: String,
    client: reqwest::Client,
}

impl BillingClient {
    pub(super) fn from_env() -> Option<Self> {
        let url = std::env::var("TOBOT_BILLING_URL")
            .ok()
            .filter(|value| value.starts_with("http://"))?;
        let command_token = std::env::var("TOBOT_BILLING_COMMAND_TOKEN")
            .ok()
            .filter(|value| value.len() >= 32)?;
        let grant_token = std::env::var("TOBOT_BILLING_TO_CONTROL_TOKEN")
            .ok()
            .filter(|value| value.len() >= 32)?;
        Some(Self {
            url,
            command_token,
            grant_token,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(6))
                .build()
                .ok()?,
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CheckoutRequest {
    semantic_key: Uuid,
    revision_id: Uuid,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct OwnerEnrollment {
    account_id: Uuid,
}

fn catalog_admin(headers: &HeaderMap, state: &AppState) -> bool {
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

async fn provider_request(
    state: &AppState,
    headers: &HeaderMap,
    method: reqwest::Method,
    path: String,
    body: Option<Value>,
) -> Response {
    if !catalog_admin(headers, state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(billing) = state.billing.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let mut request = billing
        .client
        .request(
            method,
            format!(
                "{}/internal/v1/catalog/provider/{path}",
                billing.url.trim_end_matches('/')
            ),
        )
        .header("x-billing-command-token", &billing.command_token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let Ok(response) = request.send().await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let status = response.status();
    let Ok(bytes) = response.bytes().await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    (
        status,
        [
            (header::CACHE_CONTROL, "private, no-store"),
            (header::CONTENT_TYPE, "application/json"),
        ],
        bytes,
    )
        .into_response()
}

pub(super) async fn provider_plans(State(state): State<AppState>, headers: HeaderMap) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::GET,
        "plans".to_owned(),
        None,
    )
    .await
}
pub(super) async fn provider_create_plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::POST,
        "plans".to_owned(),
        Some(body),
    )
    .await
}
pub(super) async fn provider_price(
    State(state): State<AppState>,
    Path(price_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::GET,
        format!("prices/{price_id}"),
        None,
    )
    .await
}
pub(super) async fn provider_create_price(
    State(state): State<AppState>,
    Path(product_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::POST,
        format!("products/{product_id}/prices"),
        Some(body),
    )
    .await
}
pub(super) async fn provider_update_product(
    State(state): State<AppState>,
    Path(product_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::POST,
        format!("products/{product_id}"),
        Some(body),
    )
    .await
}
pub(super) async fn provider_archive_price(
    State(state): State<AppState>,
    Path(price_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::POST,
        format!("prices/{price_id}/archive"),
        Some(body),
    )
    .await
}
pub(super) async fn provider_archive_product(
    State(state): State<AppState>,
    Path(product_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    provider_request(
        &state,
        &headers,
        reqwest::Method::POST,
        format!("products/{product_id}/archive"),
        Some(body),
    )
    .await
}

pub(super) async fn publish_catalog(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(revision): Json<CatalogPublication>,
) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.catalog.request_publication(&revision).await {
        Ok(()) => StatusCode::ACCEPTED.into_response(),
        Err(sqlx::Error::Protocol(reason)) => {
            tracing::warn!(%reason, "catalog publication rejected");
            (StatusCode::CONFLICT, Json(json!({"error": reason}))).into_response()
        }
        Err(error) => {
            tracing::error!(%error, "catalog publication failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn active_catalog(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.catalog.active_offers().await {
        Ok(revisions) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(revisions),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(%error, "catalog read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn catalog_capabilities(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(supported_catalog_capabilities()),
    )
        .into_response()
}

pub(super) async fn default_plan(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.catalog.default_plan().await {
        Ok(plan) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(plan),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(%error, "default plan read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn save_default_plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(plan): Json<DefaultPlan>,
) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.catalog.save_default_plan(&plan).await {
        Ok(()) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(plan),
        )
            .into_response(),
        Err(sqlx::Error::Protocol(reason)) => {
            (StatusCode::BAD_REQUEST, Json(json!({"error": reason}))).into_response()
        }
        Err(error) => {
            tracing::error!(%error, "default plan save failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn listed_guilds(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.entitlement.listed_guilds().await {
        Ok(list) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(list),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(%error, "guild list failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn latest_catalog(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.catalog.statuses().await {
        Ok(statuses) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(statuses),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(%error, "catalog status read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn retire_catalog(
    State(state): State<AppState>,
    Path(revision_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.catalog.retire_revision(revision_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            tracing::error!(%error, "catalog retirement failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn enroll_owner(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OwnerEnrollment>,
) -> Response {
    if !catalog_admin(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.identity.active_account(request.account_id).await {
        Ok(true) => {}
        Ok(false) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
    enroll_billing_account(&state, request.account_id).await
}

async fn enroll_billing_account(state: &AppState, account_id: Uuid) -> Response {
    let Some(billing) = state.billing.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match billing
        .client
        .post(format!(
            "{}/internal/v1/owners",
            billing.url.trim_end_matches('/')
        ))
        .header("x-billing-command-token", &billing.command_token)
        .json(&OwnerEnrollment { account_id })
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => StatusCode::NO_CONTENT.into_response(),
        Ok(response) if response.status() == reqwest::StatusCode::CONFLICT => {
            StatusCode::CONFLICT.into_response()
        }
        _ => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn run_catalog_delivery(
    catalog: CommercialCatalogStore,
    billing: Option<BillingClient>,
) -> anyhow::Result<()> {
    loop {
        if let Some(billing) = billing.as_ref() {
            let pending = match catalog.pending_publications().await {
                Ok(value) => value,
                Err(error) => {
                    tracing::error!(%error, "catalog delivery paused");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
            };
            for revision in pending {
                let response = billing
                    .client
                    .post(format!(
                        "{}/internal/v1/catalog/revisions",
                        billing.url.trim_end_matches('/')
                    ))
                    .header("x-billing-command-token", &billing.command_token)
                    .json(&revision)
                    .send()
                    .await;
                let result = match response {
                    Ok(value) if value.status().is_success() => {
                        catalog.publication_delivered(revision.revision_id).await
                    }
                    Ok(value) => {
                        let reason = if value.status() == reqwest::StatusCode::CONFLICT {
                            "Billing rejected the selected Price, Product tax code, or revision"
                                .to_owned()
                        } else {
                            format!("billing status {}", value.status())
                        };
                        catalog
                            .publication_retry(revision.revision_id, &reason)
                            .await
                    }
                    Err(error) => {
                        catalog
                            .publication_retry(revision.revision_id, &error.to_string())
                            .await
                    }
                };
                if let Err(error) = result {
                    tracing::error!(%error, revision_id=%revision.revision_id, "catalog delivery persistence failed");
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

pub(super) async fn checkout(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<CheckoutRequest>,
) -> Response {
    let Some(billing) = state.billing.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let (_, session) = match authorize_mutation(&state, &headers).await {
        Ok(value) => value,
        Err(code) => return code.into_response(),
    };
    let guild = match access(&state, &headers, tenant).await {
        Ok(value) => value,
        Err(code) => return code.into_response(),
    };
    let live = match live_user_guilds(&state, &session).await {
        Ok(value) => value,
        Err(code) => return code.into_response(),
    };
    if !live.iter().any(|item| {
        item.id == guild
            && tobot_installation::has_live_guild_install_authority(item.owner, &item.permissions)
    }) {
        return StatusCode::FORBIDDEN.into_response();
    }
    match state.identity.active_account(session.account_id).await {
        Ok(true) => {}
        Ok(false) => return StatusCode::FORBIDDEN.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
    let revision = match state.catalog.active_revision(request.revision_id).await {
        Ok(Some(value)) => value,
        Ok(None) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let enrollment = enroll_billing_account(&state, session.account_id).await;
    if !enrollment.status().is_success() {
        return enrollment;
    }
    let response=billing.client.post(format!("{}/internal/v1/checkout",billing.url.trim_end_matches('/')))
        .header("x-billing-command-token",&billing.command_token)
        .json(&json!({"tenant_id":tenant,"guild_id":guild,"actor_account_id":session.account_id,"semantic_key":request.semantic_key,"revision_id":revision.revision_id}))
        .send().await;
    match response {
        Ok(value) if value.status().is_success() => match value.json::<Value>().await {
            Ok(body) => {
                ([(header::CACHE_CONTROL, "private, no-store")], Json(body)).into_response()
            }
            Err(_) => StatusCode::BAD_GATEWAY.into_response(),
        },
        Ok(value) if value.status() == reqwest::StatusCode::CONFLICT => {
            StatusCode::CONFLICT.into_response()
        }
        Ok(value) if value.status() == reqwest::StatusCode::FORBIDDEN => {
            StatusCode::FORBIDDEN.into_response()
        }
        _ => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn status(
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
    let now = time::OffsetDateTime::from(state.clock.now());
    let session = match authorize_browser_session(&state, cookie, now).await {
        Ok(Some(value)) => value,
        Ok(None) => return StatusCode::UNAUTHORIZED.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let projection = match state.entitlement.projection(tenant).await {
        Ok(value) => value,
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let Some(billing) = state.billing.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let response = billing
        .client
        .get(format!(
            "{}/internal/v1/order/{tenant}",
            billing.url.trim_end_matches('/')
        ))
        .header("x-billing-command-token", &billing.command_token)
        .header("x-billing-actor-id", session.account_id.to_string())
        .send()
        .await;
    let billing_status = match response {
        Ok(value) if value.status().is_success() => match value.json::<Value>().await {
            Ok(body) => body,
            Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
        },
        _ => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let offers = match state.catalog.active_offers().await {
        Ok(value) => value,
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(json!({"entitlement":projection,"billing":billing_status,"offers":offers})),
    )
        .into_response()
}

pub(super) async fn grant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(fact): Json<CommercialGrant>,
) -> Response {
    let Some(billing) = state.billing.as_ref() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if !headers
        .get("x-billing-grant-token")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .as_bytes()
                .ct_eq(billing.grant_token.as_bytes())
                .into()
        })
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.entitlement.apply_commercial_grant(&fact).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => {
            tracing::error!(%error,fact_id=%fact.fact_id,"commercial grant rejected");
            StatusCode::CONFLICT.into_response()
        }
    }
}

pub(super) async fn run_plan(
    entitlement: PlatformEntitlementStore,
    edge_receipts: EarningsStore,
    delivery: SupportDeliveryClient,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match consume_plan(&entitlement, &edge_receipts, &delivery, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                tracing::error!(%error,"plan interaction worker paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn consume_plan(
    entitlement: &PlatformEntitlementStore,
    edge_receipts: &EarningsStore,
    delivery: &SupportDeliveryClient,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event = parsed.event;
        if event.schema_name == "GatewayEventAccepted" && event.payload["kind"] == "PlanCommand" {
            let tenant = event
                .tenant_id
                .ok_or_else(|| anyhow::anyhow!("plan interaction has no tenant"))?;
            let interaction = event.payload["interaction_id"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("plan interaction has no id"))?;
            if let Some(token) = edge_receipts.interaction_token(tenant, interaction).await? {
                let projection = entitlement.projection(tenant).await?;
                let content = match projection {
                    Some(value) if value.active && value.state == "Grace" => {
                        value.valid_until.map_or_else(
                            || "Plan access is pending verification.".to_owned(),
                            |deadline| {
                                format!(
                                    "Plan feature {} is in grace until <t:{deadline}:R>.",
                                    value.feature_key
                                )
                            },
                        )
                    }
                    Some(value) if value.active => {
                        let capacity = value.benefits.iter().find_map(|benefit| match benefit {
                            CatalogBenefit::Limit {
                                key,
                                quantity,
                                unit,
                            } if key == "support.max_open_tickets" && unit == "tickets" => {
                                Some(*quantity)
                            }
                            _ => None,
                        });
                        capacity.map_or_else(
                            || format!("Plan feature {} is active.", value.feature_key),
                            |quantity| format!("Plan access is active. Active support ticket limit: {quantity}."),
                        )
                    }
                    Some(value) if value.state == "Frozen" => {
                        "Plan access is unavailable while a payment dispute is reviewed.".to_owned()
                    }
                    Some(_) => "Plan access is unavailable.".to_owned(),
                    None => "No active platform plan for this server.".to_owned(),
                };
                let callback = InteractionCallback {
                    application_id: event.application_id.parse()?,
                    interaction_id: interaction.parse()?,
                    interaction_token: token,
                    ephemeral: true,
                };
                match delivery.edit_deferred(callback, &content).await {
                    Ok(()) | Err(TransportError::Rejected { status: 400 | 404 }) => {}
                    Err(error) => return Err(error.into()),
                }
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}
