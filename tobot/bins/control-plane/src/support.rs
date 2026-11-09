//! Publicación del panel S5, bandeja de tickets y admisión de clics.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_delivery_client::SupportDeliveryClient;
use tobot_discord_adapter::{
    InteractionCallback, SUPPORT_PANEL_CONTENT, SupportPanelMessage, TransportError,
};
use tobot_envelope::{CommandEnvelope, TraceContext};
use tobot_outbox::MessagingOutboxRelay;
use tobot_persistence::{QueryStore, SupportClick, SupportDecision, SupportStore};
use tracing::{error, info, warn};
use uuid::Uuid;

use super::{AppState, authorize_mutation};
use crate::welcome::access;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PublishRequest {
    channel_id: String,
    button_label: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct VersionRequest {
    version: i64,
}

pub(super) async fn inbox(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant).await {
        return status.into_response();
    }
    let Ok(tickets) = state.query.support_tickets(tenant).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let tickets: Vec<_> = tickets
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "case_id":row.case_id,"support_number":row.support_number,"member_id":row.member_id,
                "state":row.state,"version":row.version,
                "projection_watermark_unix":row.projection_watermark.unix_timestamp(),
            })
        })
        .collect();
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(serde_json::json!({"tickets":tickets})),
    )
        .into_response()
}

pub(super) async fn panel_status(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant).await {
        return status.into_response();
    }
    match state.support.published_panel(tenant).await {
        Ok(panel) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(serde_json::json!({"panel":panel})),
        )
            .into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

#[allow(clippy::too_many_lines)]
pub(super) async fn publish(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<PublishRequest>,
) -> Response {
    let (_, session) = match authorize_mutation(&state, &headers).await {
        Ok(value) => value,
        Err(status) => return status.into_response(),
    };
    let guild = match access(&state, &headers, tenant).await {
        Ok(value) => value,
        Err(status) => return status.into_response(),
    };
    let now = OffsetDateTime::from(state.clock.now());
    let correlation = Uuid::now_v7();
    let Ok(deadline) = (now + time::Duration::seconds(30)).format(&Rfc3339) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let command = CommandEnvelope {
        command_id: Uuid::now_v7(),
        schema_name: "PublishSupportPanel".to_owned(),
        schema_version: 1,
        schema_family: None,
        actor_account_id: session.account_id,
        tenant_id: tenant,
        idempotency_key: Uuid::now_v7(),
        deadline_at: deadline,
        correlation_id: correlation,
        trace_context: TraceContext {
            trace_id: correlation.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: serde_json::json!({"guild_id":guild,"channel_id":request.channel_id,
            "button_label":request.button_label,"cooldown_seconds":0}),
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if let Err(error) = CommandEnvelope::parse_s0(&raw) {
        warn!(%error, "support panel validation failed");
        return StatusCode::BAD_REQUEST.into_response();
    }
    let panel = match state
        .support
        .prepare_panel(
            tenant,
            &guild,
            &request.channel_id,
            &request.button_label,
            now,
        )
        .await
    {
        Ok(panel) => panel,
        Err(error) => {
            error!(%error,"support panel prepare failed");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    let custom_id = format!("support:{}", panel.revision_id);
    let Ok(nonce) = panel.nonce.parse::<u64>() else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let message = SupportPanelMessage {
        application_id: state.discord_application_id.clone(),
        channel_id: request.channel_id,
        content: SUPPORT_PANEL_CONTENT.to_owned(),
        button_label: request.button_label,
        custom_id: custom_id.clone(),
        nonce,
    };
    let message_id = match state.support_delivery.create_panel(&message).await {
        Ok(message_id) => message_id,
        Err(TransportError::Rejected { status }) if matches!(status, 400 | 403 | 404) => {
            if let Err(error) = state.support.fail_panel(tenant, panel.revision_id).await {
                error!(%error,revision_id=%panel.revision_id,"support panel rejection could not be recorded");
            }
            warn!(status, revision_id=%panel.revision_id, "Discord rejected support panel creation");
            let code = match status {
                403 => "discord_missing_permissions",
                404 => "discord_channel_unavailable",
                _ => "discord_invalid_request",
            };
            return (
                StatusCode::FAILED_DEPENDENCY,
                Json(serde_json::json!({"code":code})),
            )
                .into_response();
        }
        Err(error) => {
            if let Err(record_error) = state.support.degrade_panel(tenant, panel.revision_id).await
            {
                error!(%record_error,revision_id=%panel.revision_id,"support panel uncertainty could not be recorded");
            }
            error!(%error,revision_id=%panel.revision_id,"support panel create did not confirm");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    match state
        .support
        .publish_panel(
            tenant,
            &guild,
            &state.discord_application_id,
            panel.revision_id,
            &message_id,
            &custom_id,
            OffsetDateTime::now_utc(),
        )
        .await
    {
        Ok(published) if published.state == "Published" => {
            (StatusCode::CREATED, Json(published)).into_response()
        }
        Ok(_) => StatusCode::CONFLICT.into_response(),
        Err(error) => {
            error!(%error,revision_id=%panel.revision_id,"support panel binding failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn transition(
    state: AppState,
    tenant: Uuid,
    case_id: Uuid,
    headers: HeaderMap,
    request: VersionRequest,
    close: bool,
) -> Response {
    let (_, session) = match authorize_mutation(&state, &headers).await {
        Ok(value) => value,
        Err(status) => return status.into_response(),
    };
    let guild = match access(&state, &headers, tenant).await {
        Ok(value) => value,
        Err(status) => return status.into_response(),
    };
    match state
        .support
        .transition(
            tenant,
            &guild,
            &state.discord_application_id,
            case_id,
            request.version,
            session.account_id,
            close,
            OffsetDateTime::now_utc(),
        )
        .await
    {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => StatusCode::CONFLICT.into_response(),
        Err(error) => {
            error!(%error,"support case transition failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn claim(
    State(state): State<AppState>,
    Path((tenant, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(request): Json<VersionRequest>,
) -> Response {
    transition(state, tenant, case_id, headers, request, false).await
}

pub(super) async fn close(
    State(state): State<AppState>,
    Path((tenant, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(request): Json<VersionRequest>,
) -> Response {
    transition(state, tenant, case_id, headers, request, true).await
}

pub(super) async fn run_support(
    store: SupportStore,
    delivery: SupportDeliveryClient,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match consume(&store, &delivery, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error,"support admission paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

#[allow(clippy::too_many_lines)]
async fn consume(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    consumer: &RedisStreamConsumer,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event = parsed.event;
        if event.schema_name == "GatewayEventAccepted"
            && event.payload["dispatch"] == "MessageCreate"
        {
            let payload = &event.payload;
            if let (
                Some(nonce),
                Some(channel),
                Some(message_id),
                Some(author),
                Some(custom_id),
                Some(label),
            ) = (
                payload["nonce"].as_str(),
                payload["channel_id"].as_str(),
                payload["message_id"].as_str(),
                payload["author_id"].as_str(),
                payload["support_custom_id"].as_str(),
                payload["support_button_label"].as_str(),
            ) {
                store
                    .reconcile_panel_nonce(
                        nonce,
                        channel,
                        message_id,
                        &event.application_id,
                        author,
                        custom_id,
                        label,
                        OffsetDateTime::now_utc(),
                    )
                    .await?;
            }
        }
        if event.schema_name == "GatewayEventAccepted"
            && event.payload["kind"] == "SupportPanelButton"
        {
            let Some(tenant) = event.tenant_id else {
                anyhow::bail!("support click has no tenant");
            };
            let Some(guild) = event.guild_id.as_deref() else {
                anyhow::bail!("support click has no guild");
            };
            let payload = &event.payload;
            let Some(interaction_id) = payload["interaction_id"].as_str() else {
                anyhow::bail!("support click has no interaction");
            };
            let Some(channel) = payload["channel_id"].as_str() else {
                anyhow::bail!("support click has no channel");
            };
            let Some(message_id) = payload["message_id"].as_str() else {
                anyhow::bail!("support click has no message");
            };
            let Some(custom_id) = payload["custom_id"].as_str() else {
                anyhow::bail!("support click has no button");
            };
            let Some(member) = payload["member_id"].as_str() else {
                anyhow::bail!("support click has no member");
            };
            let decision = store
                .admit_click(
                    &SupportClick {
                        tenant_id: tenant,
                        guild_id: guild,
                        application_id: &event.application_id,
                        channel_id: channel,
                        message_id,
                        custom_id,
                        interaction_id,
                        member_id: member,
                    },
                    OffsetDateTime::now_utc(),
                )
                .await?;
            let content = match decision {
                SupportDecision::Opened(case) => {
                    format!("Ticket #{} is open.", case.support_number)
                }
                SupportDecision::AlreadyOpen(case) => {
                    format!("Ticket #{} is already open.", case.support_number)
                }
                SupportDecision::AtCapacity => {
                    "This server has reached its active ticket limit.".to_owned()
                }
                SupportDecision::NotIncluded => {
                    "Support tickets are not included in this server's plan.".to_owned()
                }
                SupportDecision::UnknownButton => {
                    "This support button is no longer active.".to_owned()
                }
            };
            if let Some(token) = store.interaction_token(tenant, interaction_id).await? {
                let application_id = event.application_id.parse::<u64>()?;
                let interaction_id = interaction_id.parse::<u64>()?;
                match delivery
                    .edit_deferred(
                        InteractionCallback {
                            application_id,
                            interaction_id,
                            interaction_token: token,
                            ephemeral: true,
                        },
                        &content,
                    )
                    .await
                {
                    Ok(()) => {}
                    Err(TransportError::Rejected { status: 400 | 404 }) => {
                        warn!(
                            interaction_id,
                            "expired support response could not be edited"
                        );
                    }
                    Err(error) => return Err(error.into()),
                }
            } else {
                warn!(interaction_id, "support response token expired before edit");
            }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

pub(super) async fn run_support_relay(relay: MessagingOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(OffsetDateTime::now_utc()).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed support facts"),
            Err(error) => {
                error!(%error,"support relay paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

pub(super) async fn run_support_projector(
    query: QueryStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match project(&query, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error,"support projection paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn project(query: &QueryStore, consumer: &RedisStreamConsumer) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        if matches!(
            parsed.event.schema_name.as_str(),
            "SupportCaseOpened" | "SupportCaseClaimed" | "SupportCaseClosed"
        ) {
            query
                .apply_support_ticket(
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
