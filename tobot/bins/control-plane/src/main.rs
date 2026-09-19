//! Public Control Plane surface. OAuth and installation routes remain at the
//! app origin when the reverse proxy forwards these paths to this binary.

use std::net::SocketAddr;

use anyhow::Context;
use axum::{
    Router,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use tobot_config::ControlPlaneConfig;
use tobot_persistence::Store;
use tobot_secret_store::VaultTransitStore;
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing::info;

const REQUEST_ID: &str = "x-request-id";

#[derive(Clone)]
struct AppState {
    store: Store,
    _secret_store: VaultTransitStore,
}

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
    let store = Store::connect(config.database_url.expose_for_adapter())
        .await
        .context("control-plane database is unavailable")?;
    let secret_store = VaultTransitStore::new(
        &config.vault_addr,
        config.vault_token.expose_for_adapter().to_owned(),
        config.vault_transit_key.clone(),
    )
    .context("invalid Vault Transit configuration")?;
    let app = router(AppState {
        store,
        _secret_store: secret_store,
    });

    info!(bind = %address, origin = %config.public_origin, "control plane starting");
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn router(state: AppState) -> Router {
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
        .with_state(state)
}

async fn live() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ready(State(state): State<AppState>) -> StatusCode {
    let database_ready = sqlx::query("SELECT 1").execute(state.store.pool()).await.is_ok();
    let vault_ready = state._secret_store.health().await.is_ok();
    if database_ready && vault_ready {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

async fn not_implemented() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        "S0 control-plane route is not implemented yet",
    )
}

use axum::http::HeaderName;
