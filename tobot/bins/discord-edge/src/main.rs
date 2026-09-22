//! Gateway-only Discord Edge. It has no public interaction-webhook listener.

use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use subtle::ConstantTimeEq;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_core::render_gauges;
use tobot_delivery_client::InternalDeliveryTransport;
use tobot_discord_adapter::{InteractionCallback, ShardReadiness, shard_is_ready};
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_interaction_edge::{InteractionEdge, InteractionIngressRequest, ProbeAcknowledgement};
use tobot_persistence::Store;
use tracing::{info, warn};
use twilight_gateway::{Event, EventTypeFlags, Intents, Shard, ShardId, StreamExt as _};
use twilight_model::gateway::payload::incoming::InteractionCreate;
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
    let health = EdgeHealth::new(0);
    let health_bind: std::net::SocketAddr = std::env::var("TOBOT_EDGE_HEALTH_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8082".to_owned())
        .parse()
        .context("invalid TOBOT_EDGE_HEALTH_BIND")?;
    let mut shard = Shard::new(ShardId::ONE, bot_token, Intents::GUILDS);
    let app = health_router(health.clone()).merge(gateway_metrics_router(EdgeMetricsState {
        health: health.clone(),
        service_token: internal_service_token,
    }));

    info!(%application_id, ingress = "gateway", shard = 0, "discord edge starting");
    tokio::select! {
        result = axum::serve(tokio::net::TcpListener::bind(health_bind).await?, app) => {
            result.context("discord edge health listener failed")
        }
        result = run_gateway(&mut shard, &health, &interaction_edge, &store, &application_id) => result,
    }
}

async fn run_gateway(
    shard: &mut Shard,
    health: &EdgeHealth,
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &Store,
    application_id: &str,
) -> anyhow::Result<()> {
    while let Some(next_event) = shard.next_event(EventTypeFlags::all()).await {
        let event = match next_event {
            Ok(event) => event,
            Err(error) => {
                warn!(error = %error, shard = shard.id().number(), "gateway event error");
                continue;
            }
        };
        health.observe(&event);
        let Event::InteractionCreate(interaction) = event else {
            continue;
        };
        let Some(session) = shard.session() else {
            warn!(
                shard = shard.id().number(),
                "interaction received without a gateway session"
            );
            continue;
        };
        if let Err(error) = accept_interaction(
            interaction_edge,
            store,
            application_id,
            shard.id().number(),
            session.id(),
            session.sequence(),
            *interaction,
        )
        .await
        {
            warn!(error = %error, shard = shard.id().number(), "interaction ingress failed");
        }
    }
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
    let guild_id = interaction
        .guild_id
        .map(|id| id.to_string())
        .context("S0 diagnostic interaction must originate from a guild")?;
    let context = store
        .resolve_active_guild_tenant(&application_id, &guild_id)
        .await?
        .context("interaction belongs to no active installed guild")?;
    let now = OffsetDateTime::now_utc();
    let timestamp = now.format(&Rfc3339)?;
    let correlation_id = Uuid::now_v7();
    let gateway_event_id = Uuid::now_v7();
    let gateway_event = EventEnvelope {
        event_id: gateway_event_id,
        schema_name: "GatewayEventAccepted".to_owned(),
        schema_version: 1,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id,
        tenant_id: Some(context.tenant_id.as_uuid()),
        guild_id: Some(guild_id),
        shard_id: Some(shard_id),
        session_id: Some(session_id.to_owned()),
        gateway_sequence: Some(gateway_sequence),
        correlation_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        // Do not persist Discord's interaction token or the unbounded raw
        // Gateway payload. The provider identifiers are sufficient for S0.
        payload: serde_json::json!({
            "interaction_id": interaction.id.to_string(),
            "kind": "S0DiagnosticInteraction"
        }),
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
        payload: gateway_event.payload.clone(),
    };
    let gateway_raw = serde_json::to_vec(&gateway_event)?;
    let interaction_raw = serde_json::to_vec(&interaction_event)?;
    let callback = InteractionCallback {
        application_id: interaction.application_id.get(),
        interaction_id: interaction.id.get(),
        interaction_token: interaction.token,
        ephemeral: true,
    };
    let outcome = interaction_edge
        .accept_and_acknowledge(InteractionIngressRequest {
            context,
            callback,
            gateway_event: &gateway_event,
            gateway_raw: &gateway_raw,
            interaction_event: &interaction_event,
            interaction_raw: &interaction_raw,
            acknowledgement: ProbeAcknowledgement::Deferred,
            now,
        })
        .await?;
    info!(?outcome, event_id = %interaction_event.event_id, "interaction receipt processed");
    Ok(())
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
