//! Delivery hosts the governed Discord Transport boundary. Its listener is
//! private service-to-service ingress, never a public Discord webhook route.

use anyhow::Context;
use axum::{
    Router,
    extract::{Json, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use std::{net::SocketAddr, sync::Arc};
use subtle::ConstantTimeEq;
use time::OffsetDateTime;
use tobot_bus::{RedisStreamConsumer, RedisStreamPublisher};
use tobot_core::render_gauges;
use tobot_discord_adapter::{
    DiscordTransport, GuildPresenceInspection, InteractionCallback, TransportError,
    TwilightTransport,
};
use tobot_outbox::{EdgeOutboxRelay, MessagingOutboxRelay};
use tobot_persistence::{DeliveryIntentStore, EdgeRelayStore, MessageIntent, MessagingOutbox};
use tracing::{error, info, warn};

struct DeliveryState {
    transport: TwilightTransport,
    service_token: String,
    credentials_present: bool,
    store: Option<EdgeRelayStore>,
    message_store: Option<DeliveryIntentStore>,
    message_notify: tokio::sync::Notify,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let bot_token =
        std::env::var("TOBOT_DISCORD_BOT_TOKEN").context("missing TOBOT_DISCORD_BOT_TOKEN")?;
    let service_token = std::env::var("TOBOT_INTERNAL_SERVICE_TOKEN")
        .context("missing TOBOT_INTERNAL_SERVICE_TOKEN")?;
    let bind: SocketAddr = std::env::var("TOBOT_DELIVERY_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8081".to_owned())
        .parse()
        .context("invalid TOBOT_DELIVERY_BIND")?;
    let metrics_bind: SocketAddr = std::env::var("TOBOT_DELIVERY_METRICS_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8084".to_owned())
        .parse()
        .context("invalid TOBOT_DELIVERY_METRICS_BIND")?;
    let redis_url = std::env::var("TOBOT_REDIS_URL").context("missing TOBOT_REDIS_URL")?;
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let store = EdgeRelayStore::connect(&database_url).await?;
    let message_store = DeliveryIntentStore::connect(&database_url).await?;
    let publisher = RedisStreamPublisher::connect(&redis_url)?;
    let relay = EdgeOutboxRelay::new(store.clone(), publisher);
    let message_relay = MessagingOutboxRelay::new(
        MessagingOutbox::Delivery(message_store.clone()),
        RedisStreamPublisher::connect(&redis_url)?,
    );
    let nonce_consumer = RedisStreamConsumer::connect(&redis_url, "delivery-nonce-s2", "delivery")?;
    let state = Arc::new(DeliveryState {
        transport: TwilightTransport::new(bot_token),
        service_token,
        credentials_present: true,
        store: Some(store),
        message_store: Some(message_store.clone()),
        message_notify: tokio::sync::Notify::new(),
    });
    let app = delivery_router(Arc::clone(&state));
    let metrics = metrics_router(Arc::clone(&state));
    info!(%bind, %metrics_bind, "delivery starting with private typed transport ingress");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    let metrics_listener = tokio::net::TcpListener::bind(metrics_bind).await?;
    tokio::select! {
        result = run_relay(relay) => result,
        result = run_message_claims(message_store.clone(), Arc::clone(&state)) => result,
        result = run_message_reconciliation(message_store, nonce_consumer) => result,
        result = run_message_relay(message_relay) => result,
        result = axum::serve(listener, app) => {
            result.context("Delivery private listener failed")
        },
        result = axum::serve(metrics_listener, metrics) => {
            result.context("Delivery metrics listener failed")
        },
    }
}

fn delivery_router(state: Arc<DeliveryState>) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/metrics", get(metrics))
        .route("/internal/v1/interactions/respond", post(respond))
        .route("/internal/v1/interactions/defer", post(defer))
        .route(
            "/internal/v1/installations/inspect-guild",
            post(inspect_guild),
        )
        .route(
            "/internal/v1/commands/diagnostic",
            post(register_diagnostic),
        )
        .route(
            "/internal/v1/moderation/preflight",
            post(moderation_preflight),
        )
        .route("/internal/v1/moderation/timeout", post(apply_timeout))
        .route("/internal/v1/moderation/clear-timeout", post(clear_timeout))
        .route(
            "/internal/v1/moderation/observe-timeout",
            post(observe_timeout),
        )
        .route("/internal/v1/interactions/followup", post(follow_up))
        .route("/internal/v1/support/panel", post(create_support_panel))
        .route(
            "/internal/v1/support/deferred-edit",
            post(edit_support_response),
        )
        .route("/internal/v1/messages/text-channels", post(text_channels))
        .route("/internal/v1/messages/create", post(create_message))
        .route("/internal/v1/roles/catalog", post(role_catalog))
        .route("/internal/v1/roles/member", post(member_roles))
        .route("/internal/v1/roles/add", post(add_member_role))
        .with_state(state)
}

async fn live() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ready(State(state): State<Arc<DeliveryState>>) -> StatusCode {
    let database_ready = match &state.store {
        Some(store) => store.ping().await.is_ok(),
        None => false,
    };
    transport_readiness(state.credentials_present, database_ready)
}

async fn metrics() -> StatusCode {
    StatusCode::NOT_FOUND
}

fn metrics_router(state: Arc<DeliveryState>) -> Router {
    Router::new()
        .route("/metrics", get(edge_outbox_metrics))
        .with_state(state)
}

async fn edge_outbox_metrics(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(store) = &state.store else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(gauge) = store.edge_relay_gauge(OffsetDateTime::now_utc()).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(body) = render_gauges(&[
        ("tobot_edge_outbox_unpublished", gauge.unpublished),
        (
            "tobot_edge_outbox_oldest_age_seconds",
            gauge.oldest_age_seconds,
        ),
        (
            "tobot_edge_outbox_max_publish_attempts",
            gauge.max_publish_attempts,
        ),
        ("tobot_edge_outbox_expired_leases", gauge.expired_leases),
        ("tobot_transport_http_429", state.transport.http_429_count()),
        (
            "tobot_transport_invalid_requests_10m",
            state.transport.invalid_request_count(),
        ),
    ]) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    ([(header::CONTENT_TYPE, "text/plain; version=0.0.4")], body).into_response()
}

const fn transport_readiness(credentials_present: bool, database_ready: bool) -> StatusCode {
    if credentials_present && database_ready {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

#[derive(serde::Deserialize)]
struct DiagnosticCommandRequest {
    application_id: u64,
    guild_id: u64,
}

async fn register_diagnostic(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<DiagnosticCommandRequest>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    match state
        .transport
        .register_diagnostic_command(request.application_id, request.guild_id)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(error) => {
            warn!(
                guild_id = request.guild_id,
                class = transport_class(&error),
                "diagnostic command registration failed"
            );
            transport_status(&error)
        }
    }
}

#[derive(serde::Deserialize)]
struct PreflightRequest {
    guild_id: String,
    actor_user_id: String,
    target_user_id: String,
    protected_targets: Vec<String>,
}

#[derive(serde::Deserialize)]
struct TimeoutRequest {
    guild_id: String,
    user_id: String,
    until_unix: Option<i64>,
    audit_reason: String,
}

#[derive(serde::Deserialize)]
struct ObserveRequest {
    guild_id: String,
    user_id: String,
}

#[derive(serde::Deserialize)]
struct FollowupRequest {
    #[serde(flatten)]
    callback: InteractionCallback,
    content: String,
}

async fn moderation_preflight(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<PreflightRequest>,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(guild_id) = request.guild_id.parse::<u64>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok(actor_user_id) = request.actor_user_id.parse::<u64>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok(target_user_id) = request.target_user_id.parse::<u64>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    match state
        .transport
        .moderation_preflight(
            guild_id,
            actor_user_id,
            target_user_id,
            &request.protected_targets,
        )
        .await
    {
        Ok(report) => Json(report).into_response(),
        Err(error) => transport_status(&error).into_response(),
    }
}

async fn apply_timeout(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<TimeoutRequest>,
) -> Response {
    timeout_mutation(&state, &headers, &request, true).await
}

async fn clear_timeout(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<TimeoutRequest>,
) -> Response {
    timeout_mutation(&state, &headers, &request, false).await
}

async fn timeout_mutation(
    state: &DeliveryState,
    headers: &HeaderMap,
    request: &TimeoutRequest,
    apply: bool,
) -> Response {
    if !authorized(headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let (Ok(guild_id), Ok(user_id)) = (
        request.guild_id.parse::<u64>(),
        request.user_id.parse::<u64>(),
    ) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let result = if apply {
        let Some(until_unix) = request.until_unix else {
            return StatusCode::BAD_REQUEST.into_response();
        };
        state
            .transport
            .apply_member_timeout(guild_id, user_id, until_unix, &request.audit_reason)
            .await
    } else {
        state
            .transport
            .clear_member_timeout(guild_id, user_id, &request.audit_reason)
            .await
    };
    match result {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => transport_status(&error).into_response(),
    }
}

async fn observe_timeout(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<ObserveRequest>,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let (Ok(guild_id), Ok(user_id)) = (
        request.guild_id.parse::<u64>(),
        request.user_id.parse::<u64>(),
    ) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    match state
        .transport
        .member_timeout_active(guild_id, user_id)
        .await
    {
        Ok(active) => Json(serde_json::json!({ "active": active })).into_response(),
        Err(error) => transport_status(&error).into_response(),
    }
}

async fn follow_up(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<FollowupRequest>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    match state
        .transport
        .create_followup(request.callback, &request.content)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(error) => transport_status(&error),
    }
}

async fn create_support_panel(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<tobot_discord_adapter::SupportPanelMessage>,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.transport.create_support_panel(&request).await {
        Ok(message_id) => Json(serde_json::json!({"message_id":message_id})).into_response(),
        Err(error) => {
            warn!(status=%transport_status(&error), %error, "support panel delivery failed");
            transport_status(&error).into_response()
        }
    }
}

#[derive(serde::Deserialize)]
struct SupportEditRequest {
    callback: InteractionCallback,
    content: String,
}

async fn edit_support_response(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<SupportEditRequest>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    status_for(
        &state
            .transport
            .edit_deferred_support_response(&request.callback, &request.content)
            .await,
    )
}

fn transport_class(error: &TransportError) -> &'static str {
    match error {
        TransportError::RateLimited { .. } => "RateLimited",
        TransportError::Rejected { .. } => "Rejected",
        TransportError::Unavailable(_) => "Unavailable",
    }
}

fn transport_status(error: &TransportError) -> StatusCode {
    match error {
        TransportError::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
        TransportError::Rejected { status } => {
            StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY)
        }
        TransportError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

#[derive(serde::Deserialize)]
struct GuildInspectionRequest {
    provider_guild_id: String,
}

async fn inspect_guild(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<GuildInspectionRequest>,
) -> Result<Json<GuildPresenceInspection>, (StatusCode, String)> {
    if !authorized(&headers, &state.service_token) {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_owned()));
    }
    state
        .transport
        .inspect_guild_presence(&request.provider_guild_id)
        .await
        .map(Json)
        .map_err(|error| {
            error!(
                provider_guild_id = %request.provider_guild_id,
                error = %error,
                "guild presence inspection failed"
            );
            inspection_failure(&error)
        })
}

async fn run_relay(relay: EdgeOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(OffsetDateTime::now_utc(), 100).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed edge outbox facts"),
            Err(error) => {
                error!(error = %error, "outbox relay failed; leased work will be recovered");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn respond(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(callback): Json<InteractionCallback>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    status_for(&state.transport.respond_to_interaction(callback).await)
}

async fn defer(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(callback): Json<InteractionCallback>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    status_for(&state.transport.defer_interaction(callback).await)
}

fn authorized(headers: &HeaderMap, expected_token: &str) -> bool {
    let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return false;
    };
    token
        .as_bytes()
        .ct_eq(expected_token.as_bytes())
        .unwrap_u8()
        == 1
}

#[derive(serde::Deserialize)]
struct TextChannelsRequest {
    guild_id: String,
}

async fn text_channels(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<TextChannelsRequest>,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(guild_id) = request.guild_id.parse::<u64>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    match state.transport.list_text_channels(guild_id).await {
        Ok(channels) => Json(channels).into_response(),
        Err(error) => transport_status(&error).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct CreateMessageRequest {
    intent_id: uuid::Uuid,
}

#[derive(serde::Deserialize)]
struct RoleGuildRequest {
    guild_id: String,
}

#[derive(serde::Deserialize)]
struct RoleMemberRequest {
    guild_id: String,
    user_id: String,
}

#[derive(serde::Deserialize)]
struct AddRoleRequest {
    guild_id: String,
    user_id: String,
    role_id: String,
    reason: String,
}

async fn role_catalog(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<RoleGuildRequest>,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(guild_id) = request.guild_id.parse::<u64>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    match state.transport.role_catalog(guild_id).await {
        Ok(catalog) => Json(catalog).into_response(),
        Err(error) => transport_status(&error).into_response(),
    }
}

async fn member_roles(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<RoleMemberRequest>,
) -> Response {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let (Ok(guild_id), Ok(user_id)) = (
        request.guild_id.parse::<u64>(),
        request.user_id.parse::<u64>(),
    ) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    match state.transport.member_roles(guild_id, user_id).await {
        Ok(member) => Json(member).into_response(),
        Err(error) => transport_status(&error).into_response(),
    }
}

async fn add_member_role(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<AddRoleRequest>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    let (Ok(guild_id), Ok(user_id), Ok(role_id)) = (
        request.guild_id.parse::<u64>(),
        request.user_id.parse::<u64>(),
        request.role_id.parse::<u64>(),
    ) else {
        return StatusCode::BAD_REQUEST;
    };
    match state
        .transport
        .add_member_role(guild_id, user_id, role_id, &request.reason)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(error) => transport_status(&error),
    }
}

async fn create_message(
    State(state): State<Arc<DeliveryState>>,
    headers: HeaderMap,
    Json(request): Json<CreateMessageRequest>,
) -> StatusCode {
    if !authorized(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED;
    }
    let Some(store) = &state.message_store else {
        return StatusCode::SERVICE_UNAVAILABLE;
    };
    match store.status_by_id(request.intent_id).await {
        Ok(Some(_)) => state.message_notify.notify_one(),
        Ok(None) => return StatusCode::NOT_FOUND,
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE,
    }
    StatusCode::ACCEPTED
}

async fn run_message_relay(relay: MessagingOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(OffsetDateTime::now_utc()).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed delivery facts"),
            Err(error) => {
                error!(%error, "delivery outbox relay paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn run_message_claims(
    store: DeliveryIntentStore,
    state: Arc<DeliveryState>,
) -> anyhow::Result<()> {
    let mut last_tenant = None;
    loop {
        match store
            .claim_next_after(OffsetDateTime::now_utc(), last_tenant)
            .await
        {
            Ok(Some(intent)) => {
                last_tenant = Some(intent.tenant_id);
                if let Err(error) = send_message_intent(&store, &state, &intent).await {
                    error!(%error, intent_id=%intent.intent_id, "message create worker paused");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            }
            Ok(None) => tokio::select! {
                () = state.message_notify.notified() => {},
                () = tokio::time::sleep(std::time::Duration::from_millis(250)) => {},
            },
            Err(error) => {
                error!(%error, "message intent claim paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn send_message_intent(
    store: &DeliveryIntentStore,
    state: &DeliveryState,
    intent: &MessageIntent,
) -> anyhow::Result<()> {
    let now = OffsetDateTime::now_utc();
    if !store.mark_sending(intent, now).await? {
        return Ok(());
    }
    let (Ok(channel), Ok(member), Ok(nonce)) = (
        intent.channel_id.parse::<u64>(),
        intent.member_id.parse::<u64>(),
        intent.nonce.parse::<u64>(),
    ) else {
        store
            .finish(intent, "Blocked", None, OffsetDateTime::now_utc())
            .await?;
        return Ok(());
    };
    let outcome = state
        .transport
        .create_channel_message(channel, member, &intent.content, nonce)
        .await;
    match outcome {
        Ok(message_id) => {
            store
                .finish(intent, "Sent", Some(&message_id), OffsetDateTime::now_utc())
                .await?;
        }
        Err(TransportError::Rejected {
            status: 403 | 400 | 404,
        }) => {
            store
                .finish(intent, "Blocked", None, OffsetDateTime::now_utc())
                .await?;
        }
        Err(TransportError::RateLimited { retry_after_ms }) => {
            store
                .release_rate_limited(intent, OffsetDateTime::now_utc())
                .await?;
            tokio::time::sleep(std::time::Duration::from_millis(retry_after_ms)).await;
        }
        Err(error) => {
            warn!(intent_id=%intent.intent_id, class=transport_class(&error), "message create outcome uncertain");
            store
                .finish(intent, "OutcomeUncertain", None, OffsetDateTime::now_utc())
                .await?;
        }
    }
    Ok(())
}

async fn run_message_reconciliation(
    store: DeliveryIntentStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match reconcile_messages(&store, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error, "message nonce reconciliation paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn reconcile_messages(
    store: &DeliveryIntentStore,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        // Other owners publish on the same stream. An unknown leaf is not a
        // nonce failure and must not stall welcome reconciliation.
        let parsed = match tobot_envelope::EventEnvelope::parse_s0(&message.envelope) {
            Ok(parsed) => parsed,
            Err(tobot_envelope::EnvelopeError::UnsupportedSchemaName(_)) => {
                consumer.acknowledge(&message.stream_id).await?;
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        if parsed.event.schema_name == "GatewayEventAccepted"
            && parsed.event.payload["dispatch"] == "MessageCreate"
        {
            let payload = &parsed.event.payload;
            if let (Some(nonce), Some(message_id), Some(channel), Some(author)) = (
                payload["nonce"].as_str(),
                payload["message_id"].as_str(),
                payload["channel_id"].as_str(),
                payload["author_id"].as_str(),
            ) && let Some(intent) = store.by_nonce(nonce).await?
                && intent.channel_id == channel
                && intent.application_id == author
                && matches!(intent.status.as_str(), "Sending" | "OutcomeUncertain")
            {
                store
                    .finish(&intent, "Sent", Some(message_id), OffsetDateTime::now_utc())
                    .await?;
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    let now = OffsetDateTime::now_utc();
    for intent in store.needing_reconciliation(now).await? {
        if intent.status == "Sending" {
            store.finish(&intent, "OutcomeUncertain", None, now).await?;
        } else if intent
            .uncertain_at
            .is_some_and(|at| now - at > time::Duration::seconds(60))
        {
            store.finish(&intent, "DeadLetter", None, now).await?;
        }
    }
    Ok(())
}

fn status_for(result: &Result<(), TransportError>) -> StatusCode {
    let Err(error) = result else {
        return StatusCode::NO_CONTENT;
    };
    match error {
        TransportError::RateLimited { retry_after_ms } => {
            warn!(
                retry_after_ms,
                class = "RateLimited",
                "interaction callback failed"
            );
            StatusCode::TOO_MANY_REQUESTS
        }
        TransportError::Rejected { status } => {
            warn!(status, class = "Rejected", "interaction callback failed");
            StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY)
        }
        TransportError::Unavailable(_) => {
            warn!(class = "Unavailable", "interaction callback failed");
            StatusCode::SERVICE_UNAVAILABLE
        }
    }
}

fn inspection_failure(error: &TransportError) -> (StatusCode, String) {
    let status = match error {
        TransportError::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
        TransportError::Rejected { status } => {
            StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY)
        }
        TransportError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
    };
    (status, error.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{body::Body, http::Request};
    use tower::ServiceExt as _;

    use super::{
        DeliveryState, TwilightTransport, delivery_router, metrics_router, transport_readiness,
    };
    use axum::http::StatusCode;

    #[test]
    fn transport_is_ready_only_with_credentials_and_database() {
        assert_eq!(transport_readiness(true, true), StatusCode::NO_CONTENT);
        assert_eq!(
            transport_readiness(true, false),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            transport_readiness(false, true),
            StatusCode::SERVICE_UNAVAILABLE
        );
    }

    #[tokio::test]
    async fn private_listener_rejects_metrics_and_webhook_ingress() -> Result<(), String> {
        let state = Arc::new(DeliveryState {
            transport: TwilightTransport::new("token".to_owned()),
            service_token: "internal".to_owned(),
            credentials_present: true,
            store: None,
            message_store: None,
            message_notify: tokio::sync::Notify::new(),
        });
        let app = delivery_router(state);
        let metrics = app
            .clone()
            .oneshot(request("/metrics")?)
            .await
            .map_err(|_| "metrics request failed".to_owned())?;
        if metrics.status() != StatusCode::NOT_FOUND {
            return Err("metrics were exposed on the delivery listener".to_owned());
        }
        let webhook = app
            .clone()
            .oneshot(request("/interactions")?)
            .await
            .map_err(|_| "webhook request failed".to_owned())?;
        if webhook.status() != StatusCode::NOT_FOUND {
            return Err("delivery accepted an interaction webhook route".to_owned());
        }
        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/internal/v1/messages/create")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"intent_id":"019a3dc6-0989-7000-8000-000000000001"}"#,
                    ))
                    .map_err(|error| error.to_string())?,
            )
            .await
            .map_err(|_| "message create request failed".to_owned())?;
        if create.status() != StatusCode::UNAUTHORIZED {
            return Err("message create accepted an anonymous request".to_owned());
        }
        let live = app
            .oneshot(request("/health/live")?)
            .await
            .map_err(|_| "liveness request failed".to_owned())?;
        if live.status() != StatusCode::NO_CONTENT {
            return Err("delivery liveness did not answer".to_owned());
        }
        Ok(())
    }

    #[tokio::test]
    async fn metrics_listener_requires_the_service_token() -> Result<(), String> {
        let state = Arc::new(DeliveryState {
            transport: TwilightTransport::new("token".to_owned()),
            service_token: "internal".to_owned(),
            credentials_present: true,
            store: None,
            message_store: None,
            message_notify: tokio::sync::Notify::new(),
        });
        let app = metrics_router(state);
        let anonymous = app
            .clone()
            .oneshot(request("/metrics")?)
            .await
            .map_err(|_| "anonymous metrics request failed".to_owned())?;
        if anonymous.status() != StatusCode::UNAUTHORIZED {
            return Err("metrics scrape accepted an anonymous request".to_owned());
        }
        let authed = app
            .oneshot(authorized_request("/metrics", "internal")?)
            .await
            .map_err(|_| "authorized metrics request failed".to_owned())?;
        if authed.status() != StatusCode::SERVICE_UNAVAILABLE {
            return Err("metrics scrape ran without a database".to_owned());
        }
        Ok(())
    }

    fn authorized_request(path: &str, token: &str) -> Result<Request<Body>, String> {
        Request::builder()
            .uri(path)
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .map_err(|error| error.to_string())
    }

    fn request(path: &str) -> Result<Request<Body>, String> {
        Request::builder()
            .uri(path)
            .body(Body::empty())
            .map_err(|error| error.to_string())
    }
}
