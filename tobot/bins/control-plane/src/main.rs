//! Public Control Plane surface. OAuth and installation routes remain at the
//! app origin when the reverse proxy forwards these paths to this binary.

use std::net::SocketAddr;

use anyhow::Context;
use axum::{
    Router,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use tobot_config::ControlPlaneConfig;
use tobot_core::{Clock, SystemClock};
use tobot_identity_service::OAuthService;
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
    secret_store: VaultTransitStore,
    oauth: OAuthService<VaultTransitStore>,
    discord_client_id: String,
    discord_redirect_uri: String,
    clock: SystemClock,
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
        oauth: OAuthService::new(store.clone(), secret_store.clone()),
        store,
        secret_store,
        discord_client_id: config.discord_client_id,
        discord_redirect_uri: config.discord_oauth_redirect_uri,
        clock: SystemClock,
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
        .route("/auth/login", get(login))
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
    let database_ready = sqlx::query("SELECT 1")
        .execute(state.store.pool())
        .await
        .is_ok();
    let vault_ready = state.secret_store.health().await.is_ok();
    if database_ready && vault_ready {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

async fn login(State(state): State<AppState>) -> Response {
    let scopes = vec!["identify".to_owned(), "guilds".to_owned()];
    let Ok(start) = state
        .oauth
        .begin(
            state.discord_redirect_uri.clone(),
            scopes,
            state.clock.now(),
        )
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(mut authorization_url) = url::Url::parse("https://discord.com/oauth2/authorize") else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    authorization_url
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &state.discord_client_id)
        .append_pair("redirect_uri", &start.redirect_uri)
        .append_pair("scope", &start.scopes.join(" "))
        .append_pair("state", &start.state)
        .append_pair("code_challenge", &start.code_challenge)
        .append_pair("code_challenge_method", "S256");
    let cookie = format!(
        "__Host-tobot_oauth_state={}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax",
        start.state
    );
    (
        [(header::SET_COOKIE, cookie)],
        Redirect::temporary(authorization_url.as_str()),
    )
        .into_response()
}

async fn not_implemented() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        "S0 control-plane route is not implemented yet",
    )
}

use axum::http::HeaderName;
