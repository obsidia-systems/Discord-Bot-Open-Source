//! Public Control Plane surface. OAuth and installation routes remain at the
//! app origin when the reverse proxy forwards these paths to this binary.

use std::net::SocketAddr;

use anyhow::Context;
use axum::{
    Router,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use tobot_config::ControlPlaneConfig;
use tobot_core::{Clock, SystemClock};
use tobot_discord_adapter::DiscordOAuthClient;
use tobot_identity::{AuthorizationSession, opaque_secret_hash, opaque_secrets_match};
use tobot_identity_service::OAuthService;
use tobot_persistence::{GuildDiscoveryObservation, NewDiscordAuthorization, Store};
use tobot_secret_store::{SecretStore, VaultTransitStore};
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing::info;
use uuid::Uuid;

const REQUEST_ID: &str = "x-request-id";
const CSRF_HEADER: &str = "x-csrf-token";

#[derive(Clone)]
struct AppState {
    store: Store,
    secret_store: VaultTransitStore,
    oauth: OAuthService<VaultTransitStore>,
    discord_oauth: DiscordOAuthClient,
    discord_client_id: String,
    discord_redirect_uri: String,
    public_origin: String,
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
    let discord_oauth = DiscordOAuthClient::new(
        config.discord_client_id.clone(),
        config.discord_client_secret.expose_for_adapter().to_owned(),
    )
    .context("cannot construct Discord OAuth client")?;
    let app = router(AppState {
        oauth: OAuthService::new(store.clone(), secret_store.clone()),
        store,
        secret_store,
        discord_oauth,
        discord_client_id: config.discord_client_id,
        discord_redirect_uri: config.discord_oauth_redirect_uri,
        public_origin: config.public_origin.clone(),
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
        .route("/auth/discord/callback", get(discord_callback))
        .route("/install/discord/callback", get(not_implemented))
        .route("/api/v1/session/logout", post(logout))
        .route("/api/v1/csrf", get(csrf))
        .route("/api/v1/guilds", get(guilds))
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

#[derive(serde::Deserialize)]
struct DiscordCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

async fn discord_callback(
    State(state): State<AppState>,
    Query(query): Query<DiscordCallbackQuery>,
    headers: HeaderMap,
) -> Response {
    let response = complete_discord_callback(&state, &query, &headers).await;
    let clear_cookie =
        "__Host-tobot_oauth_state=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
    match response {
        Ok(session_id) => (
            [
                (header::SET_COOKIE, clear_cookie.to_owned()),
                (
                    header::SET_COOKIE,
                    format!(
                        "__Host-tobot_session={session_id}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Lax"
                    ),
                ),
            ],
            Redirect::to("/dashboard"),
        )
            .into_response(),
        Err(status) => ([(header::SET_COOKIE, clear_cookie)], status).into_response(),
    }
}

async fn complete_discord_callback(
    state: &AppState,
    query: &DiscordCallbackQuery,
    headers: &HeaderMap,
) -> Result<Uuid, StatusCode> {
    if query.error.is_some() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let code = query.code.as_deref().ok_or(StatusCode::BAD_REQUEST)?;
    let query_state = query.state.as_deref().ok_or(StatusCode::BAD_REQUEST)?;
    let cookie_state =
        cookie_value(headers, "__Host-tobot_oauth_state").ok_or(StatusCode::BAD_REQUEST)?;
    if !opaque_secrets_match(query_state, cookie_state) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let consumed = state
        .oauth
        .consume(query_state, state.clock.now())
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let tokens = state
        .discord_oauth
        .exchange_code(code, &consumed.redirect_uri, &consumed.code_verifier)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let (user, authorization_scopes) = state
        .discord_oauth
        .current_user(&tokens.access_token)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let mut expected_scopes = consumed.scopes;
    expected_scopes.sort_unstable();
    expected_scopes.dedup();
    if tokens.scopes != expected_scopes || authorization_scopes != expected_scopes {
        return Err(StatusCode::FORBIDDEN);
    }

    let now = state.clock.now();
    let session = AuthorizationSession::new(now);
    let credential_id = Uuid::now_v7();
    let credential_context = format!("tobot:discord-oauth:{credential_id}");
    let session_context = format!("tobot:session-csrf:{}", session.id);
    let access_ciphertext = state
        .secret_store
        .encrypt(
            tokens.access_token.as_bytes(),
            credential_context.as_bytes(),
        )
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let refresh_ciphertext = state
        .secret_store
        .encrypt(
            tokens.refresh_token.as_bytes(),
            credential_context.as_bytes(),
        )
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let csrf_ciphertext = state
        .secret_store
        .encrypt(session.csrf_proof.as_bytes(), session_context.as_bytes())
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let expires_at = now
        .checked_add(std::time::Duration::from_secs(tokens.expires_in_seconds))
        .ok_or(StatusCode::BAD_GATEWAY)?;
    state
        .store
        .create_discord_authorization(NewDiscordAuthorization {
            candidate_account_id: Uuid::now_v7(),
            provider_user_id: &user.id,
            username: &user.username,
            display_name: user.global_name.as_deref(),
            credential_id,
            access_token_ciphertext: access_ciphertext.as_bytes(),
            refresh_token_ciphertext: refresh_ciphertext.as_bytes(),
            scopes: &expected_scopes,
            credential_expires_at: time::OffsetDateTime::from(expires_at),
            session_id: session.id,
            csrf_secret_hash: &opaque_secret_hash(&session.csrf_proof),
            csrf_secret_ciphertext: csrf_ciphertext.as_bytes(),
            idle_expires_at: time::OffsetDateTime::from(session.idle_expires_at),
            absolute_expires_at: time::OffsetDateTime::from(session.absolute_expires_at),
        })
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(session.id)
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|cookie| cookie.strip_prefix(name)?.strip_prefix('='))
}

#[derive(serde::Serialize)]
struct CsrfResponse {
    csrf_token: String,
}

async fn csrf(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(session_id) = session_id(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(Some(session)) = state.store.authorize_session(session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    let Ok(ciphertext) = std::str::from_utf8(&session.csrf_secret_ciphertext) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let context = format!("tobot:session-csrf:{session_id}");
    let Ok(plaintext) = state
        .secret_store
        .decrypt(ciphertext, context.as_bytes())
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(csrf_token) = String::from_utf8(plaintext) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let remaining_idle = (session.idle_expires_at - now)
        .whole_seconds()
        .clamp(0, 43_200);
    let remaining_absolute = (session.absolute_expires_at - now).whole_seconds().max(0);
    let max_age = remaining_idle.min(remaining_absolute);
    (
        [
            (header::CACHE_CONTROL, "no-store".to_owned()),
            (
                header::SET_COOKIE,
                format!(
                    "__Host-tobot_session={session_id}; Path=/; Max-Age={max_age}; Secure; HttpOnly; SameSite=Lax"
                ),
            ),
        ],
        axum::Json(CsrfResponse { csrf_token }),
    )
        .into_response()
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(session_id) = session_id(&headers) else {
        return clear_session_response(StatusCode::NO_CONTENT);
    };
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let Some(proof) = headers
        .get(HeaderName::from_static(CSRF_HEADER))
        .and_then(|value| value.to_str().ok())
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if !opaque_secrets_match(origin, &state.public_origin) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(Some(session)) = state.store.authorize_session(session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    let Ok(ciphertext) = std::str::from_utf8(&session.csrf_secret_ciphertext) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let context = format!("tobot:session-csrf:{session_id}");
    let Ok(plaintext) = state
        .secret_store
        .decrypt(ciphertext, context.as_bytes())
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(expected_proof) = String::from_utf8(plaintext) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if !opaque_secrets_match(proof, &expected_proof) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if state.store.revoke_session(session_id, now).await.is_err() {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    clear_session_response(StatusCode::NO_CONTENT)
}

fn session_id(headers: &HeaderMap) -> Option<Uuid> {
    cookie_value(headers, "__Host-tobot_session")?.parse().ok()
}

fn clear_session_response(status: StatusCode) -> Response {
    (
        [(
            header::SET_COOKIE,
            "__Host-tobot_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
        )],
        status,
    )
        .into_response()
}

#[derive(serde::Serialize)]
struct GuildDiscoveryResponse {
    guilds: Vec<GuildDiscoveryItem>,
    observed_at_unix: i64,
    expires_at_unix: i64,
    authority: &'static str,
}

#[derive(serde::Serialize)]
struct GuildDiscoveryItem {
    provider_guild_id: String,
    name: String,
    icon_hash: Option<String>,
    owner_hint: bool,
    permissions_hint: String,
}

async fn guilds(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(session_id) = session_id(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(Some(session)) = state.store.authorize_session(session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    let Ok(ciphertext) = std::str::from_utf8(&session.access_token_ciphertext) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let credential_context = format!("tobot:discord-oauth:{}", session.credential_id);
    let Ok(plaintext) = state
        .secret_store
        .decrypt(ciphertext, credential_context.as_bytes())
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(access_token) = String::from_utf8(plaintext) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let Ok(discovered) = state.discord_oauth.current_user_guilds(&access_token).await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let expires_at = now + time::Duration::minutes(15);
    let records = discovered
        .iter()
        .map(|guild| GuildDiscoveryObservation {
            provider_guild_id: &guild.id,
            guild_name: &guild.name,
            icon_hash: guild.icon.as_deref(),
            owner_hint: guild.owner,
            permissions_hint: &guild.permissions,
        })
        .collect::<Vec<_>>();
    if state
        .store
        .replace_guild_discovery(session.account_id, &records, now, expires_at)
        .await
        .is_err()
    {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let guilds = discovered
        .into_iter()
        .map(|guild| GuildDiscoveryItem {
            provider_guild_id: guild.id,
            name: guild.name,
            icon_hash: guild.icon,
            owner_hint: guild.owner,
            permissions_hint: guild.permissions,
        })
        .collect();
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        axum::Json(GuildDiscoveryResponse {
            guilds,
            observed_at_unix: now.unix_timestamp(),
            expires_at_unix: expires_at.unix_timestamp(),
            authority: "presentation_only",
        }),
    )
        .into_response()
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
