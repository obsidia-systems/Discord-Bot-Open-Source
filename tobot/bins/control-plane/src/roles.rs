//! S3 automatic-role HTTP surface and assignment worker.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_delivery_client::RoleDeliveryClient;
use tobot_discord_adapter::{AssignmentStep, RolePreflight, assignment_step, classify_target_role};
use tobot_envelope::{CommandEnvelope, TraceContext};
use tobot_outbox::MessagingOutboxRelay;
use tobot_persistence::{AssignmentStore, LifecycleStore, NewRoleJoin, RoleIntent, RoleJoin};
use tracing::{error, info};
use uuid::Uuid;

use super::{AppState, authorize_mutation};
use crate::welcome::access;

#[derive(serde::Serialize)]
struct RoleResponse {
    revision_id: Option<Uuid>,
    revision: Option<i64>,
    role_id: Option<String>,
    last_assignment: Option<AssignmentResponse>,
}

#[derive(serde::Serialize)]
struct AssignmentResponse {
    intent_id: Uuid,
    role_id: String,
    member_id: String,
    status: String,
    projection_watermark_unix: i64,
}

#[derive(serde::Deserialize)]
pub(super) struct PublishRoleRequest {
    role_id: String,
}

pub(super) async fn get_role(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant_id).await {
        return status.into_response();
    }
    let Ok(revision) = state.assignment.published_role(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(last) = state.query.role_assignment(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(RoleResponse {
            revision_id: revision.as_ref().map(|row| row.revision_id),
            revision: revision.as_ref().map(|row| row.revision),
            role_id: revision.as_ref().map(|row| row.role_id.clone()),
            last_assignment: last.map(|row| AssignmentResponse {
                intent_id: row.intent_id,
                role_id: row.role_id,
                member_id: row.member_id,
                status: row.status,
                projection_watermark_unix: row.projection_watermark.unix_timestamp(),
            }),
        }),
    )
        .into_response()
}

pub(super) async fn catalog(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    let guild_id = match access(&state, &headers, tenant_id).await {
        Ok(id) => id,
        Err(status) => return status.into_response(),
    };
    match state.role_delivery.list_roles(&guild_id).await {
        Ok(catalog) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(catalog),
        )
            .into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn publish(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<PublishRoleRequest>,
) -> Response {
    let (_, session) = match authorize_mutation(&state, &headers).await {
        Ok(authorized) => authorized,
        Err(status) => return status.into_response(),
    };
    let guild_id = match access(&state, &headers, tenant_id).await {
        Ok(id) => id,
        Err(status) => return status.into_response(),
    };
    let Ok(catalog) = state.role_delivery.list_roles(&guild_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(role) = catalog.roles.iter().find(|role| role.id == request.role_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let now = OffsetDateTime::from(state.clock.now());
    let correlation_id = Uuid::now_v7();
    let Ok(timestamp) = (now + time::Duration::seconds(30)).format(&Rfc3339) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let payload = serde_json::json!({
        "guild_id": guild_id,
        "role_id": role.id,
        "managed": role.managed,
        "position": role.position,
        "bot_highest_position": catalog.bot_highest_position,
        "permissions": role.permissions,
        "delay_seconds": 0
    });
    let command = CommandEnvelope {
        command_id: Uuid::now_v7(),
        schema_name: "PublishAutomaticRoleRevision".to_owned(),
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
        payload,
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if CommandEnvelope::parse_s0(&raw).is_err() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match state
        .assignment
        .publish_role(
            tenant_id,
            &guild_id,
            &role.id,
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
            error!(%error, "automatic role publish failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn run_assignment(
    store: AssignmentStore,
    lifecycle: LifecycleStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match consume(&store, &lifecycle, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error, "assignment consumer paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn consume(
    store: &AssignmentStore,
    lifecycle: &LifecycleStore,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event = parsed.event;
        if event.schema_name == "GatewayEventAccepted"
            && event.payload["dispatch"] == "GuildMemberAdd"
            && let (Some(guild_id), Some(member_id), Some(joined_at), Some(is_bot)) = (
                event.guild_id.as_deref(),
                event.payload["member_id"].as_str(),
                event.payload["joined_at"].as_str(),
                event.payload["is_bot"].as_bool(),
            )
            && let Some(tenant_id) = lifecycle
                .installed_tenant_for_guild(guild_id, &event.application_id)
                .await?
        {
            let joined = OffsetDateTime::parse(joined_at, &Rfc3339)?;
            let decision = store
                .reserve_join(
                    &NewRoleJoin {
                        tenant_id,
                        guild_id,
                        member_id,
                        joined_at: joined,
                        joined_at_token: joined_at,
                        is_bot,
                        application_id: &event.application_id,
                    },
                    OffsetDateTime::now_utc(),
                )
                .await?;
            if let RoleJoin::Planned { intent } = decision {
                info!(intent_id = %intent.intent_id, "automatic role intent reserved");
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

pub(super) async fn run_assignment_worker(
    store: AssignmentStore,
    delivery: RoleDeliveryClient,
) -> anyhow::Result<()> {
    loop {
        match execute_one(&store, &delivery).await {
            Ok(true) => {}
            Ok(false) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Err(error) => {
                error!(%error, "assignment worker paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn execute_one(
    store: &AssignmentStore,
    delivery: &RoleDeliveryClient,
) -> anyhow::Result<bool> {
    let Some(intent) = store.claim_next(OffsetDateTime::now_utc()).await? else {
        return Ok(false);
    };
    let now = OffsetDateTime::now_utc();
    if now > intent.deadline_at {
        store.finish(&intent, "Skipped", "Deadline", now).await?;
        return Ok(true);
    }
    let catalog = match delivery.list_roles(&intent.guild_id).await {
        Ok(catalog) => catalog,
        Err(tobot_discord_adapter::TransportError::RateLimited { retry_after_ms }) => {
            wait_rate_limit(store, &intent, retry_after_ms).await?;
            return Ok(true);
        }
        Err(error) => return Err(anyhow::anyhow!(error.to_string())),
    };
    let member = match delivery
        .read_member(&intent.guild_id, &intent.member_id)
        .await
    {
        Ok(member) => Some(member),
        Err(tobot_discord_adapter::TransportError::Rejected { status: 404 }) => None,
        Err(tobot_discord_adapter::TransportError::RateLimited { retry_after_ms }) => {
            wait_rate_limit(store, &intent, retry_after_ms).await?;
            return Ok(true);
        }
        Err(error) => return Err(anyhow::anyhow!(error.to_string())),
    };
    let Some(member) = member else {
        store.finish(&intent, "Skipped", "MemberGone", now).await?;
        return Ok(true);
    };
    if member.pending || member.bot {
        store.finish(&intent, "Skipped", "Ineligible", now).await?;
        return Ok(true);
    }
    let bot_permissions = catalog.bot_permissions.parse::<u64>().unwrap_or(0);
    let preflight = catalog
        .roles
        .iter()
        .find(|role| role.id == intent.role_id)
        .map_or(RolePreflight::Fail, |role| {
            classify_target_role(
                &intent.guild_id,
                role,
                catalog.bot_highest_position,
                bot_permissions,
            )
        });
    let present = member.role_ids.iter().any(|role| role == &intent.role_id);
    match assignment_step(intent.put_count, present, preflight, false) {
        AssignmentStep::Skip => {
            store.finish(&intent, "Skipped", "Ineligible", now).await?;
        }
        AssignmentStep::Fail => {
            store.finish(&intent, "Failed", "Blocked", now).await?;
        }
        AssignmentStep::Unchanged => {
            store
                .finish(&intent, "Unchanged", "AlreadyPresent", now)
                .await?;
        }
        AssignmentStep::AppliedFromRead => {
            store.finish(&intent, "Applied", "MemberRead", now).await?;
        }
        AssignmentStep::Put => {
            if !store.mark_transmitted(&intent, now).await? {
                return Ok(true);
            }
            put_role(store, delivery, &intent).await?;
        }
    }
    Ok(true)
}

async fn put_role(
    store: &AssignmentStore,
    delivery: &RoleDeliveryClient,
    intent: &RoleIntent,
) -> anyhow::Result<()> {
    let now = OffsetDateTime::now_utc();
    let reason = format!("automatic-role:{}", intent.revision_id);
    match delivery
        .add_member_role(
            &intent.guild_id,
            &intent.member_id,
            &intent.role_id,
            &reason,
        )
        .await
    {
        Ok(()) => {
            store.finish(intent, "Applied", "Put", now).await?;
        }
        Err(tobot_discord_adapter::TransportError::Rejected { status: 404 }) => {
            store.finish(intent, "Skipped", "MemberGone", now).await?;
        }
        Err(tobot_discord_adapter::TransportError::Rejected { status: 403 | 400 }) => {
            store.finish(intent, "Failed", "Blocked", now).await?;
        }
        Err(tobot_discord_adapter::TransportError::RateLimited { retry_after_ms }) => {
            wait_rate_limit(store, intent, retry_after_ms).await?;
        }
        Err(_) => reconcile_uncertain(store, delivery, intent).await?,
    }
    Ok(())
}

async fn reconcile_uncertain(
    store: &AssignmentStore,
    delivery: &RoleDeliveryClient,
    intent: &RoleIntent,
) -> anyhow::Result<()> {
    let now = OffsetDateTime::now_utc();
    store
        .finish(intent, "OutcomeUncertain", "LostResponse", now)
        .await?;
    let present = delivery
        .read_member(&intent.guild_id, &intent.member_id)
        .await
        .is_ok_and(|member| member.role_ids.iter().any(|role| role == &intent.role_id));
    if present {
        store.finish(intent, "Applied", "MemberRead", now).await?;
    }
    Ok(())
}

async fn wait_rate_limit(
    store: &AssignmentStore,
    intent: &RoleIntent,
    retry_after_ms: u64,
) -> anyhow::Result<()> {
    let until = OffsetDateTime::now_utc()
        + time::Duration::milliseconds(i64::try_from(retry_after_ms).unwrap_or(1_000));
    store.defer_lease(intent, until).await?;
    tokio::time::sleep(std::time::Duration::from_millis(retry_after_ms)).await;
    Ok(())
}

pub(super) async fn run_assignment_relay(relay: MessagingOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(OffsetDateTime::now_utc()).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed assignment facts"),
            Err(error) => {
                error!(%error, "assignment relay paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

pub(super) async fn project_roles(
    query: &tobot_persistence::QueryStore,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        if matches!(
            parsed.event.schema_name.as_str(),
            "RoleAssignmentPlanned"
                | "RoleAssignmentApplied"
                | "RoleAssignmentUnchanged"
                | "RoleAssignmentSkipped"
                | "RoleAssignmentFailed"
        ) {
            query
                .apply_role_assignment(
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
