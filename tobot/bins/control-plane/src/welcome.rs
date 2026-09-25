//! S2 welcome HTTP surface and lifecycle consumer.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_delivery_client::WelcomeDeliveryClient;
use tobot_envelope::{CommandEnvelope, TraceContext};
use tobot_outbox::MessagingOutboxRelay;
use tobot_persistence::{DeliveryIntentStore, JoinDecision, LifecycleStore, NewJoin};
use tracing::{error, info};
use uuid::Uuid;

use super::{
    AppState, authorize_browser_session, authorize_mutation, ensure_fresh_discovery, session_id,
};

#[derive(Serialize)]
struct WelcomeResponse {
    revision_id: Option<Uuid>,
    revision: Option<i64>,
    channel_id: Option<String>,
    body: Option<String>,
    last_delivery: Option<DeliveryResponse>,
}

#[derive(Serialize)]
struct DeliveryResponse {
    intent_id: Uuid,
    status: String,
    provider_message_id: Option<String>,
    projection_watermark_unix: i64,
}

#[derive(Deserialize)]
pub(super) struct PublishRequest {
    channel_id: String,
    body: String,
}

pub(super) async fn access(
    state: &AppState,
    headers: &HeaderMap,
    tenant_id: Uuid,
) -> Result<String, StatusCode> {
    let session_id = session_id(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let now = OffsetDateTime::from(state.clock.now());
    let session = authorize_browser_session(state, session_id, now)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    ensure_fresh_discovery(state, &session, now).await?;
    let guilds = state
        .identity
        .fresh_discovered_guild_ids(session.account_id, now)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    state
        .query
        .guild_shell_for_provider_guilds(tenant_id, &guilds)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .and_then(|shell| shell.provider_guild_id)
        .ok_or(StatusCode::NOT_FOUND)
}

pub(super) async fn get_welcome(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant_id).await {
        return status.into_response();
    }
    let Ok(revision) = state.lifecycle.published_welcome(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(last) = state.query.welcome_delivery(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(WelcomeResponse {
            revision_id: revision.as_ref().map(|r| r.revision_id),
            revision: revision.as_ref().map(|r| r.revision),
            channel_id: revision.as_ref().map(|r| r.channel_id.clone()),
            body: revision.as_ref().map(|r| r.body.clone()),
            last_delivery: last.map(|row| DeliveryResponse {
                intent_id: row.intent_id,
                status: row.status,
                provider_message_id: row.provider_message_id,
                projection_watermark_unix: row.projection_watermark.unix_timestamp(),
            }),
        }),
    )
        .into_response()
}

pub(super) async fn channels(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    let guild_id = match access(&state, &headers, tenant_id).await {
        Ok(id) => id,
        Err(status) => return status.into_response(),
    };
    match state.welcome_delivery.text_channels(&guild_id).await {
        Ok(channels) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(channels),
        )
            .into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn publish(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<PublishRequest>,
) -> Response {
    let (_, session) = match authorize_mutation(&state, &headers).await {
        Ok(authorized) => authorized,
        Err(status) => return status.into_response(),
    };
    let guild_id = match access(&state, &headers, tenant_id).await {
        Ok(id) => id,
        Err(status) => return status.into_response(),
    };
    let now = OffsetDateTime::from(state.clock.now());
    let correlation_id = Uuid::now_v7();
    let Ok(timestamp) = (now + time::Duration::seconds(30)).format(&Rfc3339) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let command = CommandEnvelope {
        command_id: Uuid::now_v7(),
        schema_name: "PublishWelcomeRevision".to_owned(),
        schema_version: 1,
        schema_family: None,
        actor_account_id: session.account_id,
        tenant_id,
        idempotency_key: Uuid::now_v7(),
        deadline_at: timestamp,
        correlation_id,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: serde_json::json!({"guild_id":guild_id, "channel_id":request.channel_id, "body":request.body}),
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if CommandEnvelope::parse_s0(&raw).is_err() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let channel_id = command.payload["channel_id"].as_str().unwrap_or_default();
    let body = command.payload["body"].as_str().unwrap_or_default();
    let Ok(channels) = state.welcome_delivery.text_channels(&guild_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if !channels.iter().any(|channel| channel.id == channel_id) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match state
        .lifecycle
        .publish_welcome(
            tenant_id,
            &guild_id,
            channel_id,
            body,
            &state.discord_application_id,
            now,
        )
        .await
    {
        Ok(revision) => (
            StatusCode::CREATED,
            Json(serde_json::json!({
                "revision_id":revision.revision_id,"revision":revision.revision
            })),
        )
            .into_response(),
        Err(error) => {
            error!(%error, "welcome publish failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn run_lifecycle(
    store: LifecycleStore,
    intents: DeliveryIntentStore,
    consumer: RedisStreamConsumer,
    delivery: WelcomeDeliveryClient,
) -> anyhow::Result<()> {
    loop {
        match consume(&store, &intents, &consumer, &delivery).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error, "lifecycle consumer paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

#[allow(clippy::collapsible_if)]
async fn consume(
    store: &LifecycleStore,
    intents: &DeliveryIntentStore,
    consumer: &RedisStreamConsumer,
    delivery: &WelcomeDeliveryClient,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event = parsed.event;
        if event.schema_name == "GatewayEventAccepted"
            && event.payload["dispatch"] == "GuildMemberAdd"
        {
            if let (Some(guild_id), Some(member_id), Some(joined_at), Some(is_bot)) = (
                event.guild_id.as_deref(),
                event.payload["member_id"].as_str(),
                event.payload["joined_at"].as_str(),
                event.payload["is_bot"].as_bool(),
            ) {
                if let Some(tenant_id) = store
                    .installed_tenant_for_guild(guild_id, &event.application_id)
                    .await?
                {
                    let joined_at = OffsetDateTime::parse(joined_at, &Rfc3339)?;
                    let decision = store
                        .reserve_join(
                            &NewJoin {
                                tenant_id,
                                guild_id,
                                member_id,
                                joined_at,
                                is_bot,
                                application_id: &event.application_id,
                            },
                            OffsetDateTime::now_utc(),
                        )
                        .await?;
                    if let JoinDecision::Requested { revision, key } = decision {
                        let intent = intents
                            .create_intent(
                                &revision,
                                member_id,
                                &key,
                                &event.application_id,
                                OffsetDateTime::now_utc(),
                            )
                            .await?;
                        store
                            .mark_requested(
                                tenant_id,
                                guild_id,
                                &key,
                                intent.intent_id,
                                &event.application_id,
                                OffsetDateTime::now_utc(),
                            )
                            .await?;
                        if let Err(error) = delivery.create_channel_message(intent.intent_id).await
                        {
                            // The durable Delivery sweep will claim this intent.
                            error!(%error, intent_id=%intent.intent_id, "immediate delivery dispatch failed");
                        }
                        info!(intent_id=%intent.intent_id, "welcome intent admitted");
                    }
                }
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

pub(super) async fn run_lifecycle_relay(relay: MessagingOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(OffsetDateTime::now_utc()).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed lifecycle facts"),
            Err(error) => {
                error!(%error, "lifecycle relay paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}
