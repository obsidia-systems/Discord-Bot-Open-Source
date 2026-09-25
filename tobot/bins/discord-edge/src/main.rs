//! Gateway-only Discord Edge. It has no public interaction-webhook listener.

use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use futures_util::StreamExt as _;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_core::render_gauges;
use tobot_delivery_client::{InternalDeliveryTransport, ModerationCommandClient};
use tobot_discord_adapter::{
    DIAGNOSTIC_COMMAND_NAME, DiscordTransport, GatewayPhase, GatewaySessionStart,
    InteractionCallback, SUPPORT_PANEL_CONTENT, ShardReadiness, TIMEOUT_COMMAND_NAME,
    acknowledgement_deadline_open, interaction_created_ms, plan_gateway_session, shard_is_ready,
};
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_interaction_edge::{
    IngressOutcome, InteractionEdge, InteractionIngressRequest, ProbeAcknowledgement,
};
use tobot_persistence::EdgeStore;
use tracing::{info, warn};
use twilight_gateway::{
    CloseFrame, ConfigBuilder, Event, EventTypeFlags, Intents, Message, Session, Shard, ShardId,
};
use twilight_model::{
    application::interaction::{
        InteractionData,
        application_command::{CommandData, CommandOptionValue},
    },
    channel::{
        Message as DiscordMessage,
        message::component::{ButtonStyle, Component},
    },
    gateway::payload::incoming::InteractionCreate,
};
use uuid::Uuid;

struct EdgeClients {
    delivery: InternalDeliveryTransport,
    cases: ModerationCommandClient,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let application_id = std::env::var("TOBOT_DISCORD_APPLICATION_ID")
        .context("missing TOBOT_DISCORD_APPLICATION_ID")?;
    let bot_token =
        std::env::var("TOBOT_DISCORD_BOT_TOKEN").context("missing TOBOT_DISCORD_BOT_TOKEN")?;
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let delivery_url = std::env::var("TOBOT_DELIVERY_URL").context("missing TOBOT_DELIVERY_URL")?;
    let internal_service_token = std::env::var("TOBOT_INTERNAL_SERVICE_TOKEN")
        .context("missing TOBOT_INTERNAL_SERVICE_TOKEN")?;
    let store = EdgeStore::connect(&database_url)
        .await
        .context("discord edge database unavailable")?;
    let delivery_transport =
        InternalDeliveryTransport::new(&delivery_url, internal_service_token.clone())
            .context("invalid Delivery transport configuration")?;
    let control_url = std::env::var("TOBOT_CONTROL_URL")
        .unwrap_or_else(|_| "http://control-plane:8080".to_owned());
    let cases = ModerationCommandClient::new(&control_url, internal_service_token.clone())
        .context("invalid Control Plane command client")?;
    let clients = EdgeClients {
        delivery: delivery_transport.clone(),
        cases,
    };
    let interaction_edge = InteractionEdge::new(store.clone(), delivery_transport);
    let discord = GatewaySessionStart::new(bot_token.clone());
    let health = EdgeHealth::new(0);
    let health_bind: std::net::SocketAddr = std::env::var("TOBOT_EDGE_HEALTH_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8082".to_owned())
        .parse()
        .context("invalid TOBOT_EDGE_HEALTH_BIND")?;
    let app = health_router(health.clone()).merge(gateway_metrics_router(EdgeMetricsState {
        health: health.clone(),
        service_token: internal_service_token,
    }));
    info!(%application_id, ingress = "gateway", shard = 0, "discord edge starting");
    tokio::select! {
        result = axum::serve(tokio::net::TcpListener::bind(health_bind).await?, app) => {
            result.context("discord edge health listener failed")
        }
        result = supervise_gateway(
            &bot_token,
            &discord,
            &health,
            &interaction_edge,
            &store,
            &application_id,
            &clients,
        ) => result,
    }
}

async fn supervise_gateway(
    bot_token: &str,
    discord: &GatewaySessionStart,
    health: &EdgeHealth,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &EdgeStore,
    application_id: &str,
    clients: &EdgeClients,
) -> anyhow::Result<()> {
    observe_rate_limit(discord).await;
    loop {
        let budget = discord.session_start_budget().await?;
        let stored = store.load_gateway_session(0).await?;
        let resumable = stored.as_ref().is_some_and(session_can_resume);
        let phase = plan_gateway_session(resumable, budget.remaining);
        info!(
            ?phase,
            remaining = budget.remaining,
            reset_after_ms = budget.reset_after_ms,
            max_concurrency = budget.max_concurrency,
            "gateway session plan"
        );
        if phase == GatewayPhase::IdentifyDeferred {
            warn!("identify deferred; session start budget is empty");
            tokio::time::sleep(Duration::from_secs(60)).await;
            continue;
        }
        let mut shard = connect_shard(bot_token, phase, stored)?;
        run_gateway(
            &mut shard,
            health,
            interaction_edge,
            store,
            application_id,
            clients,
        )
        .await?;
        health.disconnected();
        warn!("gateway stream ended; planning the next session");
    }
}

fn session_can_resume(record: &tobot_persistence::GatewaySessionRecord) -> bool {
    !record.session_id.is_empty()
        && !record.resume_gateway_url.is_empty()
        && u64::try_from(record.sequence).is_ok()
}

fn connect_shard(
    bot_token: &str,
    phase: GatewayPhase,
    stored: Option<tobot_persistence::GatewaySessionRecord>,
) -> anyhow::Result<Shard> {
    // The privileged intent is enabled only after the portal toggle is confirmed.
    let intents = if std::env::var("TOBOT_GUILD_MEMBERS_INTENT_CONFIRMED").as_deref() == Ok("true")
    {
        Intents::GUILDS | Intents::GUILD_MEMBERS | Intents::GUILD_MESSAGES
    } else {
        Intents::GUILDS
    };
    let mut builder = ConfigBuilder::new(bot_token.to_owned(), intents);
    if phase == GatewayPhase::Resume {
        let stored = stored.context("resume planned without a stored session")?;
        let sequence =
            u64::try_from(stored.sequence).context("stored gateway sequence is negative")?;
        builder = builder
            .session(Session::new(sequence, stored.session_id))
            .resume_url(stored.resume_gateway_url);
    }
    Ok(Shard::with_config(ShardId::ONE, builder.build()))
}

async fn observe_rate_limit(discord: &GatewaySessionStart) {
    match discord.observe_gateway_bot_limit().await {
        Ok(Some(limit)) => {
            info!(
                retry_after_ms = limit.retry_after_ms,
                global = limit.global,
                "discord returned HTTP 429"
            );
            tokio::time::sleep(Duration::from_millis(limit.retry_after_ms.min(65_000))).await;
        }
        Ok(None) => {
            info!("discord gateway bot route did not return HTTP 429 within the bounded probe");
        }
        Err(error) => warn!(
            class = transport_class(&error),
            "discord rate-limit probe failed"
        ),
    }
}

fn transport_class(error: &tobot_discord_adapter::TransportError) -> &'static str {
    match error {
        tobot_discord_adapter::TransportError::RateLimited { .. } => "RateLimited",
        tobot_discord_adapter::TransportError::Rejected { .. } => "Rejected",
        tobot_discord_adapter::TransportError::Unavailable(_) => "Unavailable",
    }
}

#[allow(clippy::too_many_lines)]
async fn run_gateway(
    shard: &mut Shard,
    health: &EdgeHealth,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &EdgeStore,
    application_id: &str,
    clients: &EdgeClients,
) -> anyhow::Result<()> {
    let application_snowflake: u64 = application_id
        .parse()
        .context("TOBOT_DISCORD_APPLICATION_ID is not a snowflake")?;
    while let Some(next_message) = shard.next().await {
        let (event, raw_nonce) = match next_message {
            Ok(Message::Close(frame)) => (Event::GatewayClose(frame), None),
            Ok(Message::Text(raw)) => {
                // Twilight's Message model omits nonce. Preserve that one raw
                // gateway field before deserializing the typed event.
                let raw_nonce = message_create_nonce(&raw);
                match twilight_gateway::parse(raw, EventTypeFlags::all()) {
                    Ok(Some(event)) => (event.into(), raw_nonce),
                    Ok(None) => continue,
                    Err(error) => {
                        warn!(%error, "gateway event parse failed");
                        continue;
                    }
                }
            }
            Err(error) => {
                warn!(%error, "gateway event receive failed");
                continue;
            }
        };
        if gateway_close_requires_stop(&event) {
            anyhow::bail!(
                "gateway closed 4014; Guild Members intent must be enabled in the developer portal"
            );
        }
        health.observe(&event);
        match &event {
            Event::Ready(ready) => {
                info!(shard = shard.id().number(), "gateway identify completed");
                let present: Vec<String> = ready
                    .guilds
                    .iter()
                    .map(|guild| guild.id.to_string())
                    .collect();
                persist_gateway_dispatch(
                    shard,
                    store,
                    application_id,
                    None,
                    serde_json::json!({
                        "dispatch": "Ready",
                        "present_guild_ids": present
                    }),
                )
                .await;
            }
            Event::Resumed => {
                info!(shard = shard.id().number(), "gateway resume completed");
                persist_gateway_dispatch(
                    shard,
                    store,
                    application_id,
                    None,
                    serde_json::json!({"dispatch": "Resumed"}),
                )
                .await;
                // Resume does not repeat GuildCreate, so the command list would
                // stay on the previous registration until the next identify.
                publish_installed_commands(clients, store, application_id, application_snowflake)
                    .await;
            }
            Event::GatewayInvalidateSession(_) => {
                store.delete_gateway_session(0).await?;
                warn!(shard = shard.id().number(), "gateway session invalidated");
            }
            Event::GuildCreate(guild) => {
                let guild_id = guild.id().get();
                let guild_text = guild_id.to_string();
                persist_gateway_dispatch(
                    shard,
                    store,
                    application_id,
                    Some(&guild_text),
                    serde_json::json!({"dispatch": "GuildCreate"}),
                )
                .await;
                register_diagnostic(clients, application_snowflake, guild_id).await;
            }
            Event::GuildDelete(deletion) => {
                let guild_id = deletion.id.to_string();
                let bot_left = bot_left_guild(deletion.unavailable);
                if !bot_left {
                    info!(
                        guild_id = %guild_id,
                        "guild unavailable; installation unchanged"
                    );
                }
                persist_gateway_dispatch(
                    shard,
                    store,
                    application_id,
                    Some(&guild_id),
                    serde_json::json!({
                        "dispatch": "GuildDelete",
                        "bot_left": bot_left
                    }),
                )
                .await;
            }
            Event::MemberAdd(member) => {
                if let Some(joined_at) = member.joined_at {
                    let guild_id = member.guild_id.to_string();
                    persist_gateway_dispatch(
                        shard,
                        store,
                        application_id,
                        Some(&guild_id),
                        serde_json::json!({"dispatch":"GuildMemberAdd",
                            "member_id":member.user.id.to_string(),"is_bot":member.user.bot,
                            "joined_at":joined_at}),
                    )
                    .await;
                }
            }
            Event::MessageCreate(message) => {
                if let Some(guild_id) = message.guild_id {
                    let guild_id = guild_id.to_string();
                    persist_gateway_dispatch(
                        shard,
                        store,
                        application_id,
                        Some(&guild_id),
                        message_create_observation(
                            &message.channel_id.to_string(),
                            &message.id.to_string(),
                            &message.author.id.to_string(),
                            message.author.bot,
                            message.webhook_id.is_some(),
                            raw_nonce.as_deref(),
                            confirmed_support_button(message),
                        ),
                    )
                    .await;
                }
            }
            _ => {}
        }
        if let Event::InteractionCreate(interaction) = event {
            dispatch_interaction(
                shard,
                interaction_edge,
                clients,
                store,
                application_id,
                interaction,
            )
            .await;
        }
        persist_session(shard, store).await?;
    }
    Ok(())
}

/// Identity of a guild message. Content, embeds, and attachments stay off the bus.
fn message_create_observation(
    channel_id: &str,
    message_id: &str,
    author_id: &str,
    author_bot: bool,
    webhook: bool,
    nonce: Option<&str>,
    support_button: Option<(&str, &str)>,
) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "dispatch": "MessageCreate",
        "channel_id": channel_id,
        "message_id": message_id,
        "author_id": author_id,
        "author_bot": author_bot,
        "webhook": webhook,
    });
    if let Some(nonce) = nonce {
        payload["nonce"] = serde_json::Value::String(nonce.to_owned());
    }
    if let Some((custom_id, label)) = support_button {
        payload["support_custom_id"] = serde_json::Value::String(custom_id.to_owned());
        payload["support_button_label"] = serde_json::Value::String(label.to_owned());
    }
    payload
}

fn confirmed_support_button(message: &DiscordMessage) -> Option<(&str, &str)> {
    if message.content != SUPPORT_PANEL_CONTENT {
        return None;
    }
    let [Component::ActionRow(row)] = message.components.as_slice() else {
        return None;
    };
    let [Component::Button(button)] = row.components.as_slice() else {
        return None;
    };
    if button.style != ButtonStyle::Primary || button.disabled {
        return None;
    }
    let custom_id = button.custom_id.as_deref()?;
    let label = button.label.as_deref()?;
    custom_id
        .starts_with("support:")
        .then_some((custom_id, label))
}

fn message_create_nonce(raw: &str) -> Option<String> {
    if !raw.contains("\"MESSAGE_CREATE\"") {
        return None;
    }
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .filter(|value| value["t"] == "MESSAGE_CREATE")
        .and_then(|value| {
            value["d"]["nonce"]
                .as_str()
                .map(ToOwned::to_owned)
                .or_else(|| value["d"]["nonce"].as_u64().map(|n| n.to_string()))
        })
}

fn gateway_close_requires_stop(event: &Event) -> bool {
    matches!(
        event,
        Event::GatewayClose(Some(CloseFrame { code: 4014, .. }))
    )
}

async fn dispatch_interaction(
    shard: &Shard,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    clients: &EdgeClients,
    store: &EdgeStore,
    application_id: &str,
    interaction: Box<InteractionCreate>,
) {
    let Some(session) = shard.session() else {
        warn!(
            shard = shard.id().number(),
            "interaction received without a gateway session"
        );
        return;
    };
    let session_id = session.id().to_owned();
    let sequence = session.sequence();
    let shard_id = shard.id().number();
    if let Err(error) = accept_interaction(
        &InteractionDispatch {
            edge: interaction_edge,
            clients,
            store,
            application_id,
            shard_id,
            session_id: &session_id,
            gateway_sequence: sequence,
        },
        *interaction,
    )
    .await
    {
        warn!(
            shard = shard_id,
            class = ingress_failure_class(&error),
            "interaction ingress failed"
        );
    }
}

fn ingress_failure_class(error: &anyhow::Error) -> String {
    let message = error.to_string();
    let message = message
        .strip_prefix("initial Discord callback failed: ")
        .unwrap_or(&message);
    let safe = if message.contains("http") || message.len() > 120 {
        message.split(':').next().unwrap_or(message)
    } else {
        message
    };
    safe.trim().to_owned()
}

/// Discord omits `unavailable` when the bot is removed. `true` is an outage
/// and must leave the installation alone.
fn bot_left_guild(unavailable: Option<bool>) -> bool {
    unavailable.is_none()
}

async fn persist_gateway_dispatch(
    shard: &Shard,
    store: &EdgeStore,
    application_id: &str,
    guild_id: Option<&str>,
    payload: serde_json::Value,
) {
    let Some(session) = shard.session() else {
        warn!("gateway dispatch has no session; fact was not stored");
        return;
    };
    let now = OffsetDateTime::now_utc();
    let Ok(timestamp) = now.format(&Rfc3339) else {
        warn!("gateway dispatch clock could not be formatted");
        return;
    };
    let correlation_id = Uuid::now_v7();
    let event = EventEnvelope {
        event_id: Uuid::now_v7(),
        schema_name: "GatewayEventAccepted".to_owned(),
        schema_version: 1,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id: application_id.to_owned(),
        tenant_id: None,
        guild_id: guild_id.map(ToOwned::to_owned),
        shard_id: Some(shard.id().number()),
        session_id: Some(session.id().to_owned()),
        gateway_sequence: Some(session.sequence()),
        correlation_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload,
    };
    let Ok(raw) = serde_json::to_vec(&event) else {
        warn!("gateway dispatch envelope could not be encoded");
        return;
    };
    match store.accept_gateway_dispatch(&event, &raw).await {
        Ok(true) => info!(
            schema_name = %event.schema_name,
            event_id = %event.event_id,
            "gateway dispatch stored"
        ),
        Ok(false) => info!(event_id = %event.event_id, "gateway dispatch duplicate"),
        Err(_) => warn!("gateway dispatch was not stored"),
    }
}

async fn publish_installed_commands(
    clients: &EdgeClients,
    store: &EdgeStore,
    application_id: &str,
    application_snowflake: u64,
) {
    let guilds = match store.installed_provider_guild_ids(application_id).await {
        Ok(guilds) => guilds,
        Err(error) => {
            warn!(%error, "installed command publish failed");
            return;
        }
    };
    let mut published = 0_u32;
    for guild_id in guilds {
        let Ok(guild_id) = guild_id.parse() else {
            continue;
        };
        if register_diagnostic(clients, application_snowflake, guild_id).await {
            published += 1;
        }
    }
    info!(published, "installed guild command lists published");
}

async fn register_diagnostic(clients: &EdgeClients, application_id: u64, guild_id: u64) -> bool {
    match clients
        .delivery
        .register_diagnostic_command(application_id, guild_id)
        .await
    {
        Ok(()) => {
            info!(guild_id, "guild command list registered");
            true
        }
        Err(error) => {
            warn!(
                guild_id,
                class = transport_class(&error),
                "diagnostic command registration failed"
            );
            false
        }
    }
}

async fn persist_session(shard: &Shard, store: &EdgeStore) -> anyhow::Result<()> {
    let (Some(session), Some(resume_url)) = (shard.session(), shard.resume_url()) else {
        return Ok(());
    };
    let Ok(sequence) = i64::try_from(session.sequence()) else {
        return Ok(());
    };
    let Ok(shard_id) = i32::try_from(shard.id().number()) else {
        return Ok(());
    };
    store
        .save_gateway_session(shard_id, session.id(), sequence, resume_url)
        .await?;
    Ok(())
}

#[derive(Clone)]
struct EdgeHealth {
    shard_id: u32,
    session_established: Arc<AtomicBool>,
    heartbeat_alive: Arc<AtomicBool>,
}

impl EdgeHealth {
    fn new(shard_id: u32) -> Self {
        Self {
            shard_id,
            session_established: Arc::new(AtomicBool::new(false)),
            heartbeat_alive: Arc::new(AtomicBool::new(false)),
        }
    }

    fn observe(&self, event: &Event) {
        match event {
            Event::Ready(_) | Event::Resumed => {
                self.session_established.store(true, Ordering::Relaxed);
            }
            Event::GatewayHeartbeatAck => {
                self.heartbeat_alive.store(true, Ordering::Relaxed);
            }
            Event::GatewayClose(_)
            | Event::GatewayReconnect
            | Event::GatewayInvalidateSession(_) => {
                self.session_established.store(false, Ordering::Relaxed);
                self.heartbeat_alive.store(false, Ordering::Relaxed);
            }
            _ => {}
        }
    }

    fn disconnected(&self) {
        self.session_established.store(false, Ordering::Relaxed);
        self.heartbeat_alive.store(false, Ordering::Relaxed);
    }

    fn readiness(&self) -> ShardReadiness {
        ShardReadiness {
            session_established: self.session_established.load(Ordering::Relaxed),
            heartbeat_alive: self.heartbeat_alive.load(Ordering::Relaxed),
        }
    }
}

#[derive(serde::Serialize)]
struct ShardHealthBody {
    shard_id: u32,
    session_established: bool,
    heartbeat_alive: bool,
}

fn health_router(health: EdgeHealth) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/metrics", get(metrics))
        .with_state(health)
}

async fn live() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ready(State(health): State<EdgeHealth>) -> (StatusCode, Json<ShardHealthBody>) {
    let readiness = health.readiness();
    let status = if shard_is_ready(readiness) {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(ShardHealthBody {
            shard_id: health.shard_id,
            session_established: readiness.session_established,
            heartbeat_alive: readiness.heartbeat_alive,
        }),
    )
}

async fn metrics() -> StatusCode {
    StatusCode::NOT_FOUND
}

#[derive(Clone)]
struct EdgeMetricsState {
    health: EdgeHealth,
    service_token: String,
}

fn gateway_metrics_router(state: EdgeMetricsState) -> Router {
    Router::new()
        .route("/internal/v1/metrics", get(gateway_metrics))
        .with_state(state)
}

async fn gateway_metrics(State(state): State<EdgeMetricsState>, headers: HeaderMap) -> Response {
    if !bearer_matches(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let readiness = state.health.readiness();
    let Some(body) = render_gauges(&[
        (
            "tobot_gateway_session_established",
            i64::from(u8::from(readiness.session_established)),
        ),
        (
            "tobot_gateway_heartbeat_alive",
            i64::from(u8::from(readiness.heartbeat_alive)),
        ),
    ]) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    ([(header::CONTENT_TYPE, "text/plain; version=0.0.4")], body).into_response()
}

fn bearer_matches(headers: &HeaderMap, expected_token: &str) -> bool {
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

#[derive(Clone, Copy)]
struct DiagnosticIdentity<'a> {
    application_id: &'a str,
    guild_id: &'a str,
    tenant_id: Uuid,
    shard_id: u32,
    session_id: &'a str,
    gateway_sequence: u64,
}

fn diagnostic_envelopes(
    interaction: &twilight_model::application::interaction::Interaction,
    identity: DiagnosticIdentity<'_>,
    now: &OffsetDateTime,
    kind: &str,
) -> anyhow::Result<(EventEnvelope, EventEnvelope)> {
    let timestamp = now.format(&Rfc3339)?;
    let correlation_id = Uuid::now_v7();
    let gateway_event_id = Uuid::now_v7();
    let payload = serde_json::json!({
        "interaction_id": interaction.id.to_string(),
        "kind": kind
    });
    let gateway_event = EventEnvelope {
        event_id: gateway_event_id,
        schema_name: "GatewayEventAccepted".to_owned(),
        schema_version: 1,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id: identity.application_id.to_owned(),
        tenant_id: Some(identity.tenant_id),
        guild_id: Some(identity.guild_id.to_owned()),
        shard_id: Some(identity.shard_id),
        session_id: Some(identity.session_id.to_owned()),
        gateway_sequence: Some(identity.gateway_sequence),
        correlation_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: payload.clone(),
    };
    let interaction_event = EventEnvelope {
        event_id: Uuid::now_v7(),
        schema_name: "InteractionAccepted".to_owned(),
        schema_version: 1,
        occurred_at: gateway_event.occurred_at.clone(),
        received_at: gateway_event.received_at.clone(),
        application_id: gateway_event.application_id.clone(),
        tenant_id: gateway_event.tenant_id,
        guild_id: gateway_event.guild_id.clone(),
        shard_id: gateway_event.shard_id,
        session_id: gateway_event.session_id.clone(),
        gateway_sequence: gateway_event.gateway_sequence,
        correlation_id,
        causation_id: Some(gateway_event_id),
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload,
    };
    Ok((gateway_event, interaction_event))
}

struct InteractionDispatch<'a> {
    edge: &'a InteractionEdge<InternalDeliveryTransport>,
    clients: &'a EdgeClients,
    store: &'a EdgeStore,
    application_id: &'a str,
    shard_id: u32,
    session_id: &'a str,
    gateway_sequence: u64,
}

async fn accept_interaction(
    ingress: &InteractionDispatch<'_>,
    interaction: InteractionCreate,
) -> anyhow::Result<()> {
    let interaction = interaction.0;
    let application_id = interaction.application_id.to_string();
    if application_id != ingress.application_id {
        anyhow::bail!("received interaction for an unexpected application");
    }
    if let Some(InteractionData::MessageComponent(data)) = &interaction.data {
        if data.component_type == twilight_model::channel::message::component::ComponentType::Button
            && data.custom_id.starts_with("support:")
        {
            return accept_support_button(ingress, &interaction, &data.custom_id).await;
        }
        return Ok(());
    }
    let Some(InteractionData::ApplicationCommand(data)) = &interaction.data else {
        return Ok(());
    };
    if data.name == TIMEOUT_COMMAND_NAME {
        return accept_timeout(ingress, &interaction, data).await;
    }
    if data.name != DIAGNOSTIC_COMMAND_NAME {
        return Ok(());
    }
    let guild_id = interaction
        .guild_id
        .map(|id| id.to_string())
        .context("S0 diagnostic interaction must originate from a guild")?;
    let context = ingress
        .store
        .resolve_active_guild_tenant(&application_id, &guild_id)
        .await?
        .context("interaction belongs to no active installed guild")?;
    let now = OffsetDateTime::now_utc();
    let (gateway_event, interaction_event) = diagnostic_envelopes(
        &interaction,
        DiagnosticIdentity {
            application_id: &application_id,
            guild_id: &guild_id,
            tenant_id: context.tenant_id.as_uuid(),
            shard_id: ingress.shard_id,
            session_id: ingress.session_id,
            gateway_sequence: ingress.gateway_sequence,
        },
        &now,
        "S0DiagnosticInteraction",
    )?;
    let gateway_raw = serde_json::to_vec(&gateway_event)?;
    let interaction_raw = serde_json::to_vec(&interaction_event)?;
    let interaction_id = interaction.id.get();
    let age_ms = unix_millis(now).saturating_sub(interaction_created_ms(interaction_id));
    let callback = InteractionCallback {
        application_id: interaction.application_id.get(),
        interaction_id,
        interaction_token: interaction.token,
        ephemeral: true,
    };
    let started = Instant::now();
    let result = ingress
        .edge
        .accept_and_acknowledge(InteractionIngressRequest {
            context,
            callback,
            gateway_event: &gateway_event,
            gateway_raw: &gateway_raw,
            interaction_event: &interaction_event,
            interaction_raw: &interaction_raw,
            acknowledgement: ProbeAcknowledgement::Immediate,
            now,
        })
        .await?;
    info!(
        outcome = ?result.outcome,
        callback_ms = result.callback_ms,
        age_ms,
        ingress_ms = elapsed_ms(started),
        deadline_open = acknowledgement_deadline_open(interaction_id, unix_millis(now)),
        event_id = %interaction_event.event_id,
        "interaction receipt processed"
    );
    Ok(())
}

async fn accept_support_button(
    ingress: &InteractionDispatch<'_>,
    interaction: &twilight_model::application::interaction::Interaction,
    custom_id: &str,
) -> anyhow::Result<()> {
    let Some(guild_id) = interaction.guild_id.map(|id| id.to_string()) else {
        return Ok(());
    };
    let Some(channel_id) = interaction
        .channel
        .as_ref()
        .map(|channel| channel.id.to_string())
    else {
        return Ok(());
    };
    let Some(message_id) = interaction
        .message
        .as_ref()
        .map(|message| message.id.to_string())
    else {
        return Ok(());
    };
    let Some(member_id) = interaction.author_id().map(|id| id.to_string()) else {
        return Ok(());
    };
    let application_id = interaction.application_id.to_string();
    let Some(context) = ingress
        .store
        .resolve_active_guild_tenant(&application_id, &guild_id)
        .await?
    else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let (mut gateway_event, mut interaction_event) = diagnostic_envelopes(
        interaction,
        DiagnosticIdentity {
            application_id: &application_id,
            guild_id: &guild_id,
            tenant_id: context.tenant_id.as_uuid(),
            shard_id: ingress.shard_id,
            session_id: ingress.session_id,
            gateway_sequence: ingress.gateway_sequence,
        },
        &now,
        "SupportPanelButton",
    )?;
    let payload = serde_json::json!({
        "kind":"SupportPanelButton", "interaction_id":interaction.id.to_string(),
        "channel_id":channel_id, "message_id":message_id,
        "custom_id":custom_id, "member_id":member_id,
    });
    gateway_event.payload = payload.clone();
    interaction_event.payload = payload;
    let gateway_raw = serde_json::to_vec(&gateway_event)?;
    let interaction_raw = serde_json::to_vec(&interaction_event)?;
    ingress
        .edge
        .accept_and_acknowledge(InteractionIngressRequest {
            context,
            callback: interaction_callback(interaction),
            gateway_event: &gateway_event,
            gateway_raw: &gateway_raw,
            interaction_event: &interaction_event,
            interaction_raw: &interaction_raw,
            acknowledgement: ProbeAcknowledgement::Deferred,
            now,
        })
        .await?;
    Ok(())
}

async fn accept_timeout(
    ingress: &InteractionDispatch<'_>,
    interaction: &twilight_model::application::interaction::Interaction,
    data: &CommandData,
) -> anyhow::Result<()> {
    let Some(guild_id) = interaction.guild_id.map(|id| id.to_string()) else {
        return Ok(());
    };
    let application_id = interaction.application_id.to_string();
    let tenant = ingress
        .store
        .resolve_active_guild_tenant(&application_id, &guild_id)
        .await?;
    if timeout_ingress(tenant.is_some()) == TimeoutIngress::RejectBeforeTimeout {
        let callback = interaction_callback(interaction);
        let _sent = ingress
            .clients
            .delivery
            .respond_to_interaction(callback)
            .await;
        return Ok(());
    }
    let Some(fields) = timeout_fields(data) else {
        return Ok(());
    };
    let context = tenant.context("timeout tenant disappeared")?;
    let now = OffsetDateTime::now_utc();
    let (gateway_event, interaction_event) = diagnostic_envelopes(
        interaction,
        DiagnosticIdentity {
            application_id: &application_id,
            guild_id: &guild_id,
            tenant_id: context.tenant_id.as_uuid(),
            shard_id: ingress.shard_id,
            session_id: ingress.session_id,
            gateway_sequence: ingress.gateway_sequence,
        },
        &now,
        "ModerationCommand",
    )?;
    let gateway_raw = serde_json::to_vec(&gateway_event)?;
    let interaction_raw = serde_json::to_vec(&interaction_event)?;
    let callback = interaction_callback(interaction);
    let acknowledged = ingress
        .edge
        .accept_and_acknowledge(InteractionIngressRequest {
            context,
            callback: callback.clone(),
            gateway_event: &gateway_event,
            gateway_raw: &gateway_raw,
            interaction_event: &interaction_event,
            interaction_raw: &interaction_raw,
            acknowledgement: ProbeAcknowledgement::Deferred,
            now,
        })
        .await?;
    if acknowledged.outcome != IngressOutcome::Deferred {
        return Ok(());
    }
    let deadline = (now + time::Duration::minutes(2)).format(&Rfc3339)?;
    let response = ingress
        .clients
        .cases
        .submit(&serde_json::json!({
            "guild_id": guild_id,
            "actor_provider_user_id": interaction.author_id().map(|id| id.to_string()).unwrap_or_default(),
            "target_user_id": fields.target_user_id,
            "action_type": fields.action_type,
            "duration_text": fields.duration,
            "reason": fields.reason,
            "interaction_id": interaction.id.to_string(),
            "correlation_id": interaction_event.correlation_id,
            "deadline_at": deadline,
        }))
        .await;
    let follow_up = match response {
        Ok(body) => body.follow_up,
        Err(_) => "The action is Uncertain.".to_owned(),
    };
    if let Err(error) = ingress
        .clients
        .delivery
        .follow_up(callback, &follow_up)
        .await
    {
        warn!(
            class = transport_class(&error),
            "timeout follow-up was not delivered"
        );
    }
    Ok(())
}

fn interaction_callback(
    interaction: &twilight_model::application::interaction::Interaction,
) -> InteractionCallback {
    InteractionCallback {
        application_id: interaction.application_id.get(),
        interaction_id: interaction.id.get(),
        interaction_token: interaction.token.clone(),
        ephemeral: true,
    }
}

struct TimeoutFields {
    action_type: String,
    target_user_id: String,
    duration: Option<String>,
    reason: String,
}

fn timeout_fields(data: &CommandData) -> Option<TimeoutFields> {
    let sub = data.options.first()?;
    let CommandOptionValue::SubCommand(options) = &sub.value else {
        return None;
    };
    let action_type = match sub.name.as_str() {
        "set" => "timeout",
        "clear" => "remove_timeout",
        _ => return None,
    };
    let mut target_user_id = None;
    let mut duration = None;
    let mut reason = String::new();
    for option in options {
        match (option.name.as_str(), &option.value) {
            ("user", CommandOptionValue::User(id)) => target_user_id = Some(id.to_string()),
            ("duration", CommandOptionValue::String(value)) => duration = Some(value.clone()),
            ("reason", CommandOptionValue::String(value)) => reason.clone_from(value),
            _ => {}
        }
    }
    Some(TimeoutFields {
        action_type: action_type.to_owned(),
        target_user_id: target_user_id?,
        duration,
        reason,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TimeoutIngress {
    RejectBeforeTimeout,
    DeferThenCommand,
}

fn timeout_ingress(has_active_tenant: bool) -> TimeoutIngress {
    if has_active_tenant {
        TimeoutIngress::DeferThenCommand
    } else {
        TimeoutIngress::RejectBeforeTimeout
    }
}

fn unix_millis(now: OffsetDateTime) -> u64 {
    u64::try_from(now.unix_timestamp_nanos() / 1_000_000).unwrap_or(u64::MAX)
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::{
        EdgeHealth, EdgeMetricsState, gateway_close_requires_stop, gateway_metrics_router,
        message_create_nonce, message_create_observation,
    };
    use axum::{body::Body, http::Request};
    use tobot_discord_adapter::shard_is_ready;
    use tower::ServiceExt as _;
    use twilight_gateway::{CloseFrame, Event};

    #[test]
    fn nonce_is_kept_from_raw_message_create_and_4014_stops_identify() {
        let raw = r#"{"t":"MESSAGE_CREATE","d":{"nonce":"123456","id":"999"}}"#;
        assert_eq!(message_create_nonce(raw).as_deref(), Some("123456"));
        let member = message_create_observation("10", "20", "30", false, false, None, None);
        assert!(member.get("content").is_none());
        assert_eq!(member["author_bot"].as_bool(), Some(false));
        assert!(member.get("nonce").is_none());
        let own = message_create_observation("10", "20", "30", true, false, Some("123456"), None);
        assert_eq!(own["nonce"], "123456");
        assert!(own.get("content").is_none());
        let panel = message_create_observation("10","20","30",true,false,Some("123456"),
            Some(("support:revision","Open ticket")));
        assert_eq!(panel["support_custom_id"],"support:revision");
        assert_eq!(panel["support_button_label"],"Open ticket");
        assert_eq!(
            message_create_nonce(r#"{"t":"GUILD_MEMBER_ADD","d":{"nonce":"123456"}}"#),
            None
        );
        assert!(gateway_close_requires_stop(&Event::GatewayClose(Some(
            CloseFrame::new(4014, "privileged intent")
        ))));
        assert!(!gateway_close_requires_stop(&Event::GatewayClose(Some(
            CloseFrame::new(1000, "normal")
        ))));
    }

    #[test]
    fn timeout_without_a_tenant_is_rejected_before_the_command() {
        assert_eq!(
            super::timeout_ingress(false),
            super::TimeoutIngress::RejectBeforeTimeout
        );
        assert_eq!(
            super::timeout_ingress(true),
            super::TimeoutIngress::DeferThenCommand
        );
    }

    #[test]
    fn guild_delete_without_unavailable_means_the_bot_left() {
        assert!(super::bot_left_guild(None));
        assert!(!super::bot_left_guild(Some(true)));
        assert!(!super::bot_left_guild(Some(false)));
    }

    #[test]
    fn shard_becomes_ready_only_after_session_and_heartbeat_ack() {
        let health = EdgeHealth::new(0);
        assert!(!shard_is_ready(health.readiness()));
        health.observe(&Event::GatewayHeartbeatAck);
        assert!(!shard_is_ready(health.readiness()));
        health.observe(&Event::Resumed);
        assert!(shard_is_ready(health.readiness()));
        health.observe(&Event::GatewayReconnect);
        assert!(!shard_is_ready(health.readiness()));
    }

    #[tokio::test]
    async fn gateway_metrics_require_the_service_token_and_omit_identifiers() -> Result<(), String>
    {
        let health = EdgeHealth::new(0);
        health.observe(&Event::Resumed);
        let app = gateway_metrics_router(EdgeMetricsState {
            health,
            service_token: "internal".to_owned(),
        });
        let anonymous = app
            .clone()
            .oneshot(metrics_request(None)?)
            .await
            .map_err(|_| "anonymous gateway metrics request failed".to_owned())?;
        if anonymous.status() != axum::http::StatusCode::UNAUTHORIZED {
            return Err("gateway metrics accepted an anonymous request".to_owned());
        }
        let authed = app
            .oneshot(metrics_request(Some("internal"))?)
            .await
            .map_err(|_| "authorized gateway metrics request failed".to_owned())?;
        if authed.status() != axum::http::StatusCode::OK {
            return Err("authorized gateway metrics were rejected".to_owned());
        }
        let body = axum::body::to_bytes(authed.into_body(), 1024)
            .await
            .map_err(|error| error.to_string())?;
        let text = String::from_utf8(body.to_vec()).map_err(|error| error.to_string())?;
        if !text.contains("tobot_gateway_session_established 1\n") || text.contains("internal") {
            return Err(text);
        }
        Ok(())
    }

    fn metrics_request(token: Option<&str>) -> Result<Request<Body>, String> {
        let mut builder = Request::builder().uri("/internal/v1/metrics");
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        builder
            .body(Body::empty())
            .map_err(|error| error.to_string())
    }
}
