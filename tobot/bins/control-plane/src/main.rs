//! Public Control Plane surface. OAuth and installation routes remain at the
//! app origin when the reverse proxy forwards these paths to this binary.

use std::net::SocketAddr;

use anyhow::Context;
use axum::{
    Router,
    http::{HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use tobot_config::ControlPlaneConfig;
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing::info;

const REQUEST_ID: &str = "x-request-id";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let config = ControlPlaneConfig::from_env().context("invalid control-plane configuration")?;
    let address: SocketAddr = config
        .bind_address
        .parse()
        .context("invalid TOBOT_CONTROL_BIND")?;
    let app = router();

    info!(bind = %address, origin = %config.public_origin, "control plane starting");
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn router() -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/auth/login", get(not_implemented))
        .route("/auth/discord/callback", get(not_implemented))
        .route("/install/discord/callback", get(not_implemented))
        .route("/api/v1/session/logout", post(not_implemented))
        .route("/api/v1/csrf", get(not_implemented))
        .route("/api/v1/guilds", get(not_implemented))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(PropagateRequestIdLayer::new(HeaderName::from_static(
            REQUEST_ID,
        )))
        .layer(SetRequestIdLayer::new(
            HeaderName::from_static(REQUEST_ID),
            MakeRequestUuid,
        ))
        .layer(TraceLayer::new_for_http())
}

async fn live() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ready() -> StatusCode {
    // Database, Redis and secret-store probes are wired before readiness is
    // promoted in the deployment manifest.
    StatusCode::SERVICE_UNAVAILABLE
}

async fn not_implemented() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        "S0 control-plane route is not implemented yet",
    )
}

use axum::http::HeaderName;
