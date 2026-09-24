//! S4 text XP publish surface and award consumer. No Discord mutation.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_envelope::{CommandEnvelope, TraceContext};
use tobot_outbox::MessagingOutboxRelay;
use tobot_persistence::{LifecycleStore, NewTextMessage, ProgressionStore, XpDecision};
use tracing::{error, info};
use uuid::Uuid;

use super::{AppState, authorize_mutation};
use crate::welcome::access;

#[derive(serde::Serialize)]
struct ProgressionResponse {
    revision_id: Option<Uuid>,
    revision: Option<i64>,
    channel_id: Option<String>,
    award: Option<i32>,
    last_member: Option<MemberResponse>,
}

#[derive(serde::Serialize)]
struct MemberResponse {
    member_id: String,
    balance: i64,
    level: i64,
    source_message_id: String,
    projection_watermark_unix: i64,
}

#[derive(serde::Deserialize)]
pub(super) struct PublishProgressionRequest {
    channel_id: String,
    award: i64,
}

pub(super) async fn get_progression(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant_id).await {
        return status.into_response();
    }
    let Ok(revision) = state.progression.published_progression(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(last) = state.query.xp_member(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(ProgressionResponse {
            revision_id: revision.as_ref().map(|row| row.revision_id),
            revision: revision.as_ref().map(|row| row.revision),
            channel_id: revision.as_ref().map(|row| row.channel_id.clone()),
            award: revision.as_ref().map(|row| row.award),
            last_member: last.map(|row| MemberResponse {
                member_id: row.member_id,
                balance: row.balance,
                level: row.level,
                source_message_id: row.source_message_id,
                projection_watermark_unix: row.projection_watermark.unix_timestamp(),
            }),
        }),
    )
        .into_response()
}

pub(super) async fn publish(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<PublishProgressionRequest>,
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
    let payload = serde_json::json!({
        "guild_id": guild_id,
        "channel_id": request.channel_id,
        "award": request.award,
        "cooldown_seconds": 0,
        "multiplier": 1
    });
    let command = CommandEnvelope {
        command_id: Uuid::now_v7(),
        schema_name: "PublishProgressionRevision".to_owned(),
        schema_version: 1,
        actor_account_id: session.account_id,
        tenant_id,
        idempotency_key: Uuid::now_v7(),
        deadline_at: timestamp,
        correlation_id,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload,
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if CommandEnvelope::parse_s0(&raw).is_err() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match state
        .progression
        .publish_progression(
            tenant_id,
            &guild_id,
            &request.channel_id,
            &command.payload,
            &state.discord_application_id,
            now,
        )
        .await
    {
        Ok(revision) => (
            StatusCode::CREATED,
            Json(serde_json::json!({"revision_id": revision.revision_id, "revision": revision.revision})),
        )
            .into_response(),
        Err(error) => {
            error!(%error, "progression publish failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn run_progression(
    store: ProgressionStore,
    lifecycle: LifecycleStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match consume(&store, &lifecycle, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error, "progression consumer paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn consume(
    store: &ProgressionStore,
    lifecycle: &LifecycleStore,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event = parsed.event;
        if event.schema_name == "GatewayEventAccepted"
            && event.payload["dispatch"] == "MessageCreate"
            && let (
                Some(guild_id),
                Some(channel_id),
                Some(message_id),
                Some(author_id),
                Some(author_bot),
            ) = (
                event.guild_id.as_deref(),
                event.payload["channel_id"].as_str(),
                event.payload["message_id"].as_str(),
                event.payload["author_id"].as_str(),
                event.payload["author_bot"].as_bool(),
            )
            && let Some(tenant_id) = lifecycle
                .installed_tenant_for_guild(guild_id, &event.application_id)
                .await?
        {
            let decision = store
                .record_message(
                    &NewTextMessage {
                        tenant_id,
                        guild_id,
                        channel_id,
                        message_id,
                        author_id,
                        author_bot,
                        webhook: event.payload["webhook"].as_bool().unwrap_or(false),
                        application_id: &event.application_id,
                    },
                    OffsetDateTime::now_utc(),
                )
                .await?;
            if let XpDecision::Awarded(entry) = decision {
                info!(entry_id = %entry.entry_id, "xp award recorded");
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

pub(super) async fn run_progression_relay(relay: MessagingOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(OffsetDateTime::now_utc()).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed progression facts"),
            Err(error) => {
                error!(%error, "progression relay paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

pub(super) async fn project_xp(
    query: &tobot_persistence::QueryStore,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        if matches!(
            parsed.event.schema_name.as_str(),
            "XpAwardRecorded" | "LevelChanged"
        ) {
            query
                .apply_xp_member(
                    &parsed.event,
                    &message.envelope,
                    &message.stream_id,
                    OffsetDateTime::now_utc(),
                )
                .await?;
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}
