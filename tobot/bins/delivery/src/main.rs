//! Delivery hosts the governed Discord Transport boundary. Its listener is
//! private service-to-service ingress, never a public Discord webhook route.

use anyhow::Context;
use axum::{
    Router,
    extract::{Json, State},
    http::{HeaderMap, StatusCode, header},
    routing::{get, post},
};
use std::{net::SocketAddr, sync::Arc};
use subtle::ConstantTimeEq;
use time::OffsetDateTime;
use tobot_bus::RedisStreamPublisher;
use tobot_discord_adapter::{
    DiscordTransport, GuildPresenceInspection, InteractionCallback, TransportError,
    TwilightTransport,
};
use tobot_outbox::EdgeOutboxRelay;
use tobot_persistence::Store;
use tracing::{error, info};

struct DeliveryState {
    transport: TwilightTransport,
    service_token: String,
    credentials_present: bool,
    store: Option<Store>,
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
    let relay = EdgeOutboxRelay::new(store.clone(), publisher);
    let state = Arc::new(DeliveryState {
        transport: TwilightTransport::new(bot_token),
        service_token,
        credentials_present: true,
        store: Some(store),
    });
    let app = delivery_router(state);
    info!(%bind, "delivery starting with private typed transport ingress");
    tokio::select! {
        result = run_relay(relay) => result,
        result = axum::serve(tokio::net::TcpListener::bind(bind).await?, app) => {
            result.context("Delivery private listener failed")
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
        .with_state(state)
}

async fn live() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ready(State(state): State<Arc<DeliveryState>>) -> StatusCode {
    let database_ready = match &state.store {
        Some(store) => sqlx::query("SELECT 1").execute(store.pool()).await.is_ok(),
        None => false,
    };
    transport_readiness(state.credentials_present, database_ready)
}

async fn metrics() -> StatusCode {
    StatusCode::NOT_FOUND
}

const fn transport_readiness(credentials_present: bool, database_ready: bool) -> StatusCode {
    if credentials_present && database_ready {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
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

fn status_for(result: &Result<(), TransportError>) -> StatusCode {
    match result {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(TransportError::RateLimited { .. }) => StatusCode::TOO_MANY_REQUESTS,
        Err(TransportError::Rejected { .. }) => StatusCode::BAD_GATEWAY,
        Err(TransportError::Unavailable(_)) => StatusCode::SERVICE_UNAVAILABLE,
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

    use super::{DeliveryState, TwilightTransport, delivery_router, transport_readiness};
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
        let live = app
            .oneshot(request("/health/live")?)
            .await
            .map_err(|_| "liveness request failed".to_owned())?;
        if live.status() != StatusCode::NO_CONTENT {
            return Err("delivery liveness did not answer".to_owned());
        }
        Ok(())
    }

    fn request(path: &str) -> Result<Request<Body>, String> {
        Request::builder()
            .uri(path)
            .body(Body::empty())
            .map_err(|error| error.to_string())
    }
}
