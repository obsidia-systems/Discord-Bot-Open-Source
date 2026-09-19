//! Delivery hosts the governed Discord Transport boundary. Its listener is
//! private service-to-service ingress, never a public Discord webhook route.

use anyhow::Context;
use axum::{
    Router,
    extract::{Json, State},
    http::{HeaderMap, StatusCode, header},
    routing::post,
};
use std::{net::SocketAddr, sync::Arc};
use subtle::ConstantTimeEq;
use time::OffsetDateTime;
use tobot_bus::RedisStreamPublisher;
use tobot_discord_adapter::{
    DiscordTransport, InteractionCallback, TransportError, TwilightTransport,
};
use tobot_outbox::EdgeOutboxRelay;
use tobot_persistence::Store;
use tracing::{error, info};

struct DeliveryState {
    transport: TwilightTransport,
    service_token: String,
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
    let redis_url = std::env::var("TOBOT_REDIS_URL").context("missing TOBOT_REDIS_URL")?;
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let store = Store::connect(&database_url).await?;
    let publisher = RedisStreamPublisher::connect(&redis_url)?;
    let relay = EdgeOutboxRelay::new(store, publisher);
    let state = Arc::new(DeliveryState {
        transport: TwilightTransport::new(bot_token),
        service_token,
    });
    let app = Router::new()
        .route("/internal/v1/interactions/respond", post(respond))
        .route("/internal/v1/interactions/defer", post(defer))
        .with_state(state);
    info!(%bind, "delivery starting with private typed transport ingress");
    tokio::select! {
        result = run_relay(relay) => result,
        result = axum::serve(tokio::net::TcpListener::bind(bind).await?, app) => {
            result.context("Delivery private listener failed")
        },
    }
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

fn status_for(result: &Result<(), TransportError>) -> StatusCode {
    match result {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(TransportError::RateLimited { .. }) => StatusCode::TOO_MANY_REQUESTS,
        Err(TransportError::Rejected { .. }) => StatusCode::BAD_GATEWAY,
        Err(TransportError::Unavailable(_)) => StatusCode::SERVICE_UNAVAILABLE,
    }
}
