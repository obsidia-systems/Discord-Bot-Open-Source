//! Publicación del panel S5, bandeja de tickets y admisión de clics.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use sqlx::Row;
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

#[path = "support_channel.rs"]
mod channel;

#[derive(serde::Deserialize)]
struct QuestionBody {
    title: String,
    required: bool,
}

#[derive(serde::Deserialize)]
struct WindowBody {
    weekday: u8,
    start_minute: u16,
    end_minute: u16,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PublishRequest {
    #[serde(default)]
    name: String,
    channel_id: String,
    button_label: String,
    category_id: String,
    overflow_category_id: Option<String>,
    staff_role_id: String,
    #[serde(default)]
    questions: Vec<QuestionBody>,
    #[serde(default)]
    timezone_offset_minutes: i32,
    #[serde(default)]
    weekly_hours: Vec<WindowBody>,
    #[serde(default = "open_hours")]
    closed_hours: String,
    #[serde(default)]
    confirm_close: bool,
    inactivity_minutes: Option<i32>,
    #[serde(default)]
    transcript_enabled: bool,
    log_channel_id: Option<String>,
}

fn open_hours() -> String {
    "open".to_owned()
}

fn panel_name(raw: &str, fallback: &str) -> Option<String> {
    let name = if raw.trim().is_empty() {
        fallback.trim()
    } else {
        raw.trim()
    };
    if name.is_empty()
        || name.chars().count() > 80
        || name.contains("@everyone")
        || name.contains("@here")
    {
        None
    } else {
        Some(name.to_owned())
    }
}

fn panel_payload(
    guild: &str,
    channel: &str,
    label: &str,
    request: &PublishRequest,
) -> serde_json::Value {
    serde_json::json!({
        "guild_id": guild,
        "channel_id": channel,
        "button_label": label,
        "cooldown_seconds": 0,
        "category_id": request.category_id,
        "overflow_category_id": request.overflow_category_id,
        "staff_role_id": request.staff_role_id,
        "questions": request.questions.iter().map(|question| serde_json::json!({"title": question.title, "required": question.required})).collect::<Vec<_>>(),
        "timezone_offset_minutes": request.timezone_offset_minutes,
        "weekly_hours": request.weekly_hours.iter().map(|window| serde_json::json!({"weekday": window.weekday, "start_minute": window.start_minute, "end_minute": window.end_minute})).collect::<Vec<_>>(),
        "closed_hours": request.closed_hours,
        "confirm_close": request.confirm_close,
        "inactivity_minutes": request.inactivity_minutes,
        "transcript_enabled": request.transcript_enabled,
        "log_channel_id": request.log_channel_id,
    })
}

fn desk_config(request: &PublishRequest) -> tobot_persistence::DeskConfig {
    tobot_persistence::DeskConfig {
        category_id: request.category_id.clone(),
        overflow_category_id: request.overflow_category_id.clone(),
        staff_role_id: request.staff_role_id.clone(),
        questions: request
            .questions
            .iter()
            .map(|question| tobot_persistence::SupportQuestion {
                title: question.title.clone(),
                required: question.required,
            })
            .collect(),
        timezone_offset_minutes: request.timezone_offset_minutes,
        weekly_hours: request
            .weekly_hours
            .iter()
            .map(|window| tobot_persistence::WeeklyWindow {
                weekday: window.weekday,
                start_minute: window.start_minute,
                end_minute: window.end_minute,
            })
            .collect(),
        closed_hours: request.closed_hours.clone(),
        confirm_close: request.confirm_close,
        inactivity_minutes: request.inactivity_minutes,
        transcript_enabled: request.transcript_enabled,
        log_channel_id: request.log_channel_id.clone(),
    }
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
                "channel_id":row.channel_id,"rating":row.rating,"outside_hours":row.outside_hours,
                "answers":row.answers,"transcript_ready":row.transcript_ready,
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

pub(super) async fn panels(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant).await {
        return status.into_response();
    }
    let limits = match state.support.server_limits(tenant).await {
        Ok(limits) => limits,
        Err(error) => {
            error!(%error, "support limits could not be read");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    match state.support.panel_choices(tenant).await {
        Ok(panels) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(serde_json::json!({"panels":panels,"limits":limits})),
        )
            .into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn save_panel(
    State(state): State<AppState>,
    Path((tenant, revision_id)): Path<(Uuid, Uuid)>,
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
    let choice = match state.support.published_choice(tenant, revision_id).await {
        Ok(Some(choice)) => choice,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            error!(%error, "support panel could not be read");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    let now = OffsetDateTime::from(state.clock.now());
    let correlation = Uuid::now_v7();
    let Ok(deadline) = (now + time::Duration::seconds(30)).format(&Rfc3339) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    // El canal y la etiqueta ya enviados a Discord se conservan. Guardar solo cambia este tipo.
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
        payload: panel_payload(&guild, &choice.channel_id, &choice.button_label, &request),
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if let Err(error) = CommandEnvelope::parse_s0(&raw) {
        warn!(%error, "support panel validation failed");
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Some(name) = panel_name(&request.name, &choice.button_label) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    match state
        .support
        .save_published_panel(tenant, revision_id, &name, &desk_config(&request))
        .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            error!(%error, "support panel could not be saved");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub(super) async fn ticket(
    State(state): State<AppState>,
    Path((tenant, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant).await {
        return status.into_response();
    }
    let row = match state.query.support_ticket(tenant, case_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let Ok(lines) = state.support.transcript_lines(case_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let lines: Vec<_> = lines
        .into_iter()
        .map(|line| {
            serde_json::json!({
                "message_id":line.message_id,"author_id":line.author_id,"body":line.body,
                "observed_at_unix":line.observed_at.unix_timestamp(),
            })
        })
        .collect();
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(serde_json::json!({
            "ticket":{
                "case_id":row.case_id,"support_number":row.support_number,"member_id":row.member_id,
                "state":row.state,"version":row.version,
                "channel_id":row.channel_id,"rating":row.rating,"outside_hours":row.outside_hours,
                "answers":row.answers,"transcript_ready":row.transcript_ready,
                "projection_watermark_unix":row.projection_watermark.unix_timestamp(),
            },
            "lines":lines,
        })),
    )
        .into_response()
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
        payload: panel_payload(&guild, &request.channel_id, &request.button_label, &request),
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if let Err(error) = CommandEnvelope::parse_s0(&raw) {
        warn!(%error, "support panel validation failed");
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Some(name) = panel_name(&request.name, &request.button_label) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let panel = match state
        .support
        .prepare_panel(
            tenant,
            &guild,
            &request.channel_id,
            &request.button_label,
            &name,
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
    let desk = desk_config(&request);
    if let Err(error) = state
        .support
        .attach_desk(tenant, panel.template_revision_id, &desk)
        .await
    {
        error!(%error, "support desk was not attached");
        let _ = state.support.fail_panel(tenant, panel.revision_id).await;
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
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
        Ok(Some(row)) => {
            if close {
                channel::finish_closed(
                    &state.support,
                    &state.support_delivery,
                    tenant,
                    &guild,
                    &state.discord_application_id,
                    case_id,
                )
                .await;
            } else if let Ok(Some(member)) = state.identity.discord_user_id(session.account_id).await
            {
                let _ = state.support.note_claimer(tenant, case_id, &member).await;
                channel::sync_access(
                    &state.support,
                    &state.support_delivery,
                    tenant,
                    case_id,
                    "claimed",
                    Some(&member),
                )
                .await;
            }
            Json(row).into_response()
        }
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
    if let Err(status) = authorize_mutation(&state, &headers).await {
        return status.into_response();
    }
    if let Err(status) = access(&state, &headers, tenant).await {
        return status.into_response();
    }
    if let Ok(Some(row)) = state.support.case_desk(tenant, case_id).await {
        let confirm = row.try_get::<bool, _>("confirm_close").unwrap_or(false);
        let requested = row.try_get::<bool, _>("close_requested").unwrap_or(false);
        let channel = row
            .try_get::<Option<String>, _>("resource_channel_id")
            .ok()
            .flatten();
        if confirm && !requested {
            if state
                .support
                .request_close(tenant, case_id, request.version)
                .await
                .ok()
                != Some(true)
            {
                return StatusCode::CONFLICT.into_response();
            }
            if let Some(channel) = channel {
                let id = case_id.to_string();
                let accept = format!("support-close:accept:{id}");
                let deny = format!("support-close:deny:{id}");
                let _ = state
                    .support_delivery
                    .post_message(
                        &channel,
                        "Close this ticket?",
                        &[(accept.as_str(), "Accept"), (deny.as_str(), "Deny")],
                    )
                    .await;
            }
            return StatusCode::ACCEPTED.into_response();
        }
    }
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
            if let (Some(channel), Some(message_id), Some(author)) = (
                payload["channel_id"].as_str(),
                payload["message_id"].as_str(),
                payload["author_id"].as_str(),
            ) {
                let _ = store
                    .observe_message(channel, message_id, author, None, OffsetDateTime::now_utc())
                    .await;
            }
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
                        answers: &[],
                    },
                    OffsetDateTime::now_utc(),
                )
                .await?;
            let content = match &decision {
                SupportDecision::Opened(case) if case.state == "Provisioning" => {
                    let opened = channel::provision_case(
                        store,
                        delivery,
                        tenant,
                        guild,
                        &event.application_id,
                        case.case_id,
                        member,
                        case.support_number,
                    )
                    .await?;
                    channel::opened_text(case, opened.as_deref())
                }
                SupportDecision::Opened(case) => channel::opened_text(case, None),
                SupportDecision::AlreadyOpen(case) => {
                    let place = case
                        .resource_channel_id
                        .as_deref()
                        .map(|id| format!(" in <#{id}>"))
                        .unwrap_or_default();
                    format!("Ticket #{} is already open{place}.", case.support_number)
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
                SupportDecision::OutsideHours => "Support is closed right now.".to_owned(),
                SupportDecision::MissingAnswers => {
                    "Answer the support form to open a ticket.".to_owned()
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
        if event.schema_name == "GatewayEventAccepted" {
            dispatch_ticket_control(store, delivery, &event).await?;
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

async fn dispatch_ticket_control(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    event: &tobot_envelope::EventEnvelope,
) -> anyhow::Result<()> {
    let kind = event.payload["kind"].as_str().unwrap_or("");
    if !matches!(
        kind,
        "SupportFormSubmit" | "SupportStaff" | "SupportClose" | "SupportRating"
    ) {
        return Ok(());
    }
    let Some(tenant) = event.tenant_id else {
        return Ok(());
    };
    let Some(guild) = event.guild_id.as_deref() else {
        return Ok(());
    };
    let Some(member) = event.payload["member_id"].as_str() else {
        return Ok(());
    };
    let interaction_id = event.payload["interaction_id"].as_str().unwrap_or("");
    let content = match kind {
        "SupportFormSubmit" => admit_form(store, delivery, event, tenant, guild, member).await?,
        "SupportStaff" => staff_action(store, delivery, event, tenant, guild, member).await?,
        "SupportClose" => close_answer(store, delivery, event, tenant, guild).await?,
        "SupportRating" => rate_case(store, event, tenant, guild, member).await?,
        _ => String::new(),
    };
    if content.is_empty() {
        return Ok(());
    }
    if let Some(token) = store.interaction_token(tenant, interaction_id).await? {
        let Ok(application_id) = event.application_id.parse::<u64>() else {
            return Ok(());
        };
        let Ok(interaction_id) = interaction_id.parse::<u64>() else {
            return Ok(());
        };
        let _ = delivery
            .edit_deferred(
                InteractionCallback {
                    application_id,
                    interaction_id,
                    interaction_token: token,
                    ephemeral: true,
                },
                &content,
            )
            .await;
    }
    Ok(())
}

async fn admit_form(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    event: &tobot_envelope::EventEnvelope,
    tenant: Uuid,
    guild: &str,
    member: &str,
) -> anyhow::Result<String> {
    let Some(custom_id) = event.payload["custom_id"].as_str() else {
        return Ok("This support form is no longer active.".to_owned());
    };
    let Some(channel) = event.payload["channel_id"].as_str() else {
        return Ok("This support form is no longer active.".to_owned());
    };
    let Some(message_id) = event.payload["message_id"].as_str() else {
        return Ok("This support form is no longer active.".to_owned());
    };
    let Some(interaction_id) = event.payload["interaction_id"].as_str() else {
        return Ok("This support form is no longer active.".to_owned());
    };
    let Some(desk) = store.button_desk(custom_id).await? else {
        return Ok("This support form is no longer active.".to_owned());
    };
    let answers = channel::form_answers(&event.payload, &desk.questions);
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
                answers: &answers,
            },
            OffsetDateTime::now_utc(),
        )
        .await?;
    let text = match &decision {
        SupportDecision::Opened(case) if case.state == "Provisioning" => {
            let opened = channel::provision_case(
                store,
                delivery,
                tenant,
                guild,
                &event.application_id,
                case.case_id,
                member,
                case.support_number,
            )
            .await?;
            channel::opened_text(case, opened.as_deref())
        }
        SupportDecision::Opened(case) => channel::opened_text(case, None),
        SupportDecision::AlreadyOpen(case) => {
            format!("Ticket #{} is already open.", case.support_number)
        }
        SupportDecision::AtCapacity => {
            "This server has reached its active ticket limit.".to_owned()
        }
        SupportDecision::NotIncluded => {
            "Support tickets are not included in this server's plan.".to_owned()
        }
        SupportDecision::UnknownButton | SupportDecision::MissingAnswers => {
            "This support form is no longer active.".to_owned()
        }
        SupportDecision::OutsideHours => "Support is closed right now.".to_owned(),
    };
    Ok(text)
}

#[allow(clippy::too_many_lines)]
async fn staff_action(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    event: &tobot_envelope::EventEnvelope,
    tenant: Uuid,
    guild: &str,
    member: &str,
) -> anyhow::Result<String> {
    let Some(case_id) = event.payload["case_id"]
        .as_str()
        .and_then(|value| Uuid::parse_str(value).ok())
    else {
        return Ok("This ticket action is no longer active.".to_owned());
    };
    let Some(row) = store.case_desk(tenant, case_id).await? else {
        return Ok("This ticket action is no longer active.".to_owned());
    };
    let opener: String = row.try_get("member_id")?;
    let staff: Option<String> = row.try_get("staff_role_id")?;
    let allowed = match staff.as_deref() {
        Some(role) => delivery
            .member_has_role(guild, member, role)
            .await
            .unwrap_or(false),
        None => false,
    };
    if !allowed || member == opener {
        return Ok("Only staff can use this ticket action.".to_owned());
    }
    let version: i64 = row.try_get("version")?;
    let action = event.payload["action"].as_str().unwrap_or("");
    let now = OffsetDateTime::now_utc();
    let text = match action {
        "claim" => {
            let claimed = store
                .transition(
                    tenant,
                    guild,
                    &event.application_id,
                    case_id,
                    version,
                    Uuid::nil(),
                    false,
                    now,
                )
                .await?;
            if let Some(case) = claimed {
                let _ = store.note_claimer(tenant, case_id, member).await;
                channel::sync_access(store, delivery, tenant, case_id, "claimed", Some(member))
                    .await;
                if let Ok(Some(channel)) = row.try_get::<Option<String>, _>("resource_channel_id") {
                    let id = case_id.to_string();
                    let unclaim = format!("support-staff:unclaim:{id}");
                    let _ = delivery
                        .post_message(
                            &channel,
                            "This ticket is claimed.",
                            &[(unclaim.as_str(), "Unclaim")],
                        )
                        .await;
                }
                format!("You claimed ticket #{}.", case.support_number)
            } else {
                "This ticket was already claimed.".to_owned()
            }
        }
        "unclaim" => {
            if store
                .unclaim(tenant, guild, &event.application_id, case_id, version, now)
                .await?
                .is_some()
            {
                channel::sync_access(store, delivery, tenant, case_id, "open", None).await;
                "The ticket is unclaimed.".to_owned()
            } else {
                "This ticket is not claimed.".to_owned()
            }
        }
        "close" => {
            close_from_staff(
                store,
                delivery,
                &row,
                tenant,
                guild,
                &event.application_id,
                case_id,
                version,
            )
            .await
        }
        "transcript" => {
            let number: i64 = row.try_get("support_number")?;
            let channel: Option<String> = row.try_get("resource_channel_id")?;
            if let (Some(channel), Some(log_channel)) =
                (channel, row.try_get::<Option<String>, _>("log_channel_id")?)
            {
                let _ = delivery
                    .post_message(
                        &log_channel,
                        &format!("Transcript requested for ticket #{number} in <#{channel}>."),
                        &[],
                    )
                    .await;
            }
            format!("Transcript requested for ticket #{number}.")
        }
        _ => "This ticket action is no longer active.".to_owned(),
    };
    Ok(text)
}

#[allow(clippy::too_many_arguments)]
async fn close_from_staff(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    row: &sqlx::postgres::PgRow,
    tenant: Uuid,
    guild: &str,
    application: &str,
    case_id: Uuid,
    version: i64,
) -> String {
    let confirm = row.try_get::<bool, _>("confirm_close").unwrap_or(false);
    let requested = row.try_get::<bool, _>("close_requested").unwrap_or(false);
    let number: i64 = row.try_get("support_number").unwrap_or(0);
    if confirm && !requested {
        if store.request_close(tenant, case_id, version).await.ok() == Some(true) {
            if let Ok(Some(channel)) = row.try_get::<Option<String>, _>("resource_channel_id") {
                let id = case_id.to_string();
                let accept = format!("support-close:accept:{id}");
                let deny = format!("support-close:deny:{id}");
                let _ = delivery
                    .post_message(
                        &channel,
                        "Close this ticket?",
                        &[(accept.as_str(), "Accept"), (deny.as_str(), "Deny")],
                    )
                    .await;
            }
            return format!("Asked the member to confirm closing ticket #{number}.");
        }
        return "This ticket could not be closed.".to_owned();
    }
    match store
        .transition(
            tenant,
            guild,
            application,
            case_id,
            version,
            Uuid::nil(),
            true,
            OffsetDateTime::now_utc(),
        )
        .await
    {
        Ok(Some(_)) => {
            channel::finish_closed(store, delivery, tenant, guild, application, case_id).await;
            format!("Ticket #{number} is closed.")
        }
        _ => "This ticket could not be closed.".to_owned(),
    }
}

async fn close_answer(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    event: &tobot_envelope::EventEnvelope,
    tenant: Uuid,
    guild: &str,
) -> anyhow::Result<String> {
    let Some(case_id) = event.payload["case_id"]
        .as_str()
        .and_then(|value| Uuid::parse_str(value).ok())
    else {
        return Ok("This ticket action is no longer active.".to_owned());
    };
    let Some(member) = event.payload["member_id"].as_str() else {
        return Ok("This ticket action is no longer active.".to_owned());
    };
    let Some(row) = store.case_desk(tenant, case_id).await? else {
        return Ok("This ticket action is no longer active.".to_owned());
    };
    let opener: String = row.try_get("member_id")?;
    if member != opener {
        return Ok("Only the member who opened this ticket can answer.".to_owned());
    }
    let number: i64 = row.try_get("support_number")?;
    if event.payload["action"] == "deny" {
        let _ = store.deny_close(tenant, case_id).await?;
        return Ok(format!("Ticket #{number} stays open."));
    }
    let version: i64 = row.try_get("version")?;
    if store
        .transition(
            tenant,
            guild,
            &event.application_id,
            case_id,
            version,
            Uuid::nil(),
            true,
            OffsetDateTime::now_utc(),
        )
        .await?
        .is_some()
    {
        channel::finish_closed(
            store,
            delivery,
            tenant,
            guild,
            &event.application_id,
            case_id,
        )
        .await;
        Ok(format!("Ticket #{number} is closed."))
    } else {
        Ok("This ticket could not be closed.".to_owned())
    }
}

async fn rate_case(
    store: &SupportStore,
    event: &tobot_envelope::EventEnvelope,
    tenant: Uuid,
    guild: &str,
    member: &str,
) -> anyhow::Result<String> {
    let Some(case_id) = event.payload["case_id"]
        .as_str()
        .and_then(|value| Uuid::parse_str(value).ok())
    else {
        return Ok("This rating is no longer active.".to_owned());
    };
    let Some(rating) = event.payload["score"]
        .as_i64()
        .and_then(|value| i16::try_from(value).ok())
    else {
        return Ok("Choose a rating from 1 to 5.".to_owned());
    };
    let saved = store
        .record_rating(
            tenant,
            guild,
            &event.application_id,
            case_id,
            member,
            rating,
            OffsetDateTime::now_utc(),
        )
        .await?;
    Ok(if saved {
        format!("You rated this ticket {rating}.")
    } else {
        "This ticket already has a rating.".to_owned()
    })
}

pub(super) async fn transcript(
    State(state): State<AppState>,
    Path((tenant, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = access(&state, &headers, tenant).await {
        return status.into_response();
    }
    match state.support.transcript_html(tenant, case_id).await {
        Ok(Some(html)) => (
            [
                (header::CACHE_CONTROL, "private, no-store"),
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            ],
            html,
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn categories(
    State(state): State<AppState>,
    Path(tenant): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    let guild = match access(&state, &headers, tenant).await {
        Ok(value) => value,
        Err(status) => return status.into_response(),
    };
    match channel::categories(&state, &guild).await {
        Ok(categories) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(serde_json::json!({"categories":categories})),
        )
            .into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn unclaim(
    State(state): State<AppState>,
    Path((tenant, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(request): Json<VersionRequest>,
) -> Response {
    if authorize_mutation(&state, &headers).await.is_err() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let guild = match access(&state, &headers, tenant).await {
        Ok(value) => value,
        Err(status) => return status.into_response(),
    };
    match state
        .support
        .unclaim(
            tenant,
            &guild,
            &state.discord_application_id,
            case_id,
            request.version,
            OffsetDateTime::now_utc(),
        )
        .await
    {
        Ok(Some(row)) => {
            channel::sync_access(
                &state.support,
                &state.support_delivery,
                tenant,
                case_id,
                "open",
                None,
            )
            .await;
            Json(row).into_response()
        }
        Ok(None) => StatusCode::CONFLICT.into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub(super) async fn run_support_maintenance(
    store: SupportStore,
    delivery: SupportDeliveryClient,
) -> anyhow::Result<()> {
    loop {
        if let Err(error) = channel::maintain(&store, &delivery).await {
            error!(%error, "support maintenance paused");
        }
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
    }
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
