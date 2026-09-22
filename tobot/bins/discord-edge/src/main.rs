//! Gateway-only Discord Edge. It has no public interaction-webhook listener.

use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
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
use tobot_delivery_client::InternalDeliveryTransport;
use tobot_discord_adapter::{
    DIAGNOSTIC_COMMAND_NAME, GatewayPhase, InteractionCallback, ShardReadiness, TwilightTransport,
    acknowledgement_deadline_open, interaction_created_ms, plan_gateway_session, shard_is_ready,
};
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_interaction_edge::{InteractionEdge, InteractionIngressRequest, ProbeAcknowledgement};
use tobot_persistence::Store;
use tracing::{info, warn};
use twilight_gateway::{
    ConfigBuilder, Event, EventTypeFlags, Intents, Session, Shard, ShardId, StreamExt as _,
};
use twilight_model::{
    application::interaction::InteractionData, gateway::payload::incoming::InteractionCreate,
};
use uuid::Uuid;

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
    let store = Store::connect(&database_url)
        .await
        .context("discord edge database unavailable")?;
    let delivery_transport =
        InternalDeliveryTransport::new(&delivery_url, internal_service_token.clone())
            .context("invalid Delivery transport configuration")?;
    let interaction_edge = InteractionEdge::new(store.clone(), delivery_transport);
    let discord = TwilightTransport::new(bot_token.clone());
    let health = EdgeHealth::new(0);
    let health_bind: std::net::SocketAddr = std::env::var("TOBOT_EDGE_HEALTH_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8082".to_owned())
        .parse()
        .context("invalid TOBOT_EDGE_HEALTH_BIND")?;
    let app = health_router(health.clone()).merge(gateway_metrics_router(EdgeMetricsState {
        health: health.clone(),
        service_token: internal_service_token,
    }));
    let application_snowflake: u64 = application_id
        .parse()
        .context("TOBOT_DISCORD_APPLICATION_ID is not a snowflake")?;

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
            application_snowflake,
        ) => result,
    }
}

async fn supervise_gateway(
    bot_token: &str,
    discord: &TwilightTransport,
    health: &EdgeHealth,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &Store,
    application_id: &str,
    application_snowflake: u64,
) -> anyhow::Result<()> {
    observe_rate_limit(discord, bot_token).await;
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
            discord,
            health,
            interaction_edge,
            store,
            application_id,
            application_snowflake,
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
    let mut builder = ConfigBuilder::new(bot_token.to_owned(), Intents::GUILDS);
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

async fn observe_rate_limit(discord: &TwilightTransport, bot_token: &str) {
    match discord.observe_gateway_bot_limit(bot_token).await {
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

async fn run_gateway(
    shard: &mut Shard,
    discord: &TwilightTransport,
    health: &EdgeHealth,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &Store,
    application_id: &str,
    application_snowflake: u64,
) -> anyhow::Result<()> {
    while let Some(next_event) = shard.next_event(EventTypeFlags::all()).await {
        let Ok(event) = next_event else {
            warn!(shard = shard.id().number(), "gateway event error");
            continue;
        };
        health.observe(&event);
        match &event {
            Event::Ready(_) => info!(shard = shard.id().number(), "gateway identify completed"),
            Event::Resumed => info!(shard = shard.id().number(), "gateway resume completed"),
            Event::GatewayInvalidateSession(_) => {
                store.delete_gateway_session(0).await?;
                warn!(shard = shard.id().number(), "gateway session invalidated");
            }
            Event::GuildCreate(guild) => {
                register_diagnostic(discord, application_snowflake, guild.id().get()).await;
            }
            _ => {}
        }
        if let Event::InteractionCreate(interaction) = event {
            dispatch_interaction(shard, interaction_edge, store, application_id, interaction).await;
        }
        persist_session(shard, store).await?;
    }
    Ok(())
}

async fn dispatch_interaction(
    shard: &Shard,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &Store,
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
        interaction_edge,
        store,
        application_id,
        shard_id,
        &session_id,
        sequence,
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

async fn register_diagnostic(discord: &TwilightTransport, application_id: u64, guild_id: u64) {
    match discord
        .register_diagnostic_command(application_id, guild_id)
        .await
    {
        Ok(()) => info!(
            guild_id,
            command = DIAGNOSTIC_COMMAND_NAME,
            "diagnostic command registered"
        ),
        Err(error) => warn!(
            guild_id,
            class = transport_class(&error),
            "diagnostic command registration failed"
        ),
    }
}

async fn persist_session(shard: &Shard, store: &Store) -> anyhow::Result<()> {
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
) -> anyhow::Result<(EventEnvelope, EventEnvelope)> {
    let timestamp = now.format(&Rfc3339)?;
    let correlation_id = Uuid::now_v7();
    let gateway_event_id = Uuid::now_v7();
    let payload = serde_json::json!({
        "interaction_id": interaction.id.to_string(),
        "kind": "S0DiagnosticInteraction"
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

async fn accept_interaction(
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &Store,
    configured_application_id: &str,
    shard_id: u32,
    session_id: &str,
    gateway_sequence: u64,
    interaction: InteractionCreate,
) -> anyhow::Result<()> {
    let interaction = interaction.0;
    let application_id = interaction.application_id.to_string();
    if application_id != configured_application_id {
        anyhow::bail!("received interaction for an unexpected application");
    }
    if !matches!(
        interaction.data,
        Some(InteractionData::ApplicationCommand(ref data)) if data.name == DIAGNOSTIC_COMMAND_NAME
    ) {
        return Ok(());
    }
    let guild_id = interaction
        .guild_id
        .map(|id| id.to_string())
        .context("S0 diagnostic interaction must originate from a guild")?;
    let context = store
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
            shard_id,
            session_id,
            gateway_sequence,
        },
        &now,
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
    let result = interaction_edge
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

fn unix_millis(now: OffsetDateTime) -> u64 {
    u64::try_from(now.unix_timestamp_nanos() / 1_000_000).unwrap_or(u64::MAX)
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::{EdgeHealth, EdgeMetricsState, gateway_metrics_router};
    use axum::{body::Body, http::Request};
    use tobot_discord_adapter::shard_is_ready;
    use tower::ServiceExt as _;
    use twilight_gateway::Event;

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
