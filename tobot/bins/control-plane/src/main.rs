//! Public Control Plane surface. OAuth and installation routes remain at the
//! app origin when the reverse proxy forwards these paths to this binary.

use std::{collections::HashMap, net::SocketAddr};

use anyhow::Context;
use axum::{
    Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use tobot_bus::{RedisStreamConsumer, RedisStreamPublisher};
use tobot_config::ControlPlaneConfig;
use tobot_core::{Clock, SystemClock};
use tobot_delivery_client::InstallationInspectionClient;
use tobot_discord_adapter::{DiscordGuildObservation, DiscordOAuthClient};
use tobot_identity::{
    AuthorizationSession, oauth_state_hash, opaque_secret_hash, opaque_secrets_match,
};
use tobot_identity_service::{OAuthService, OAuthServiceError};
use tobot_installation::{
    GuildInstallAuthorization, GuildRepairAuthorization, InstallPreset, S0Manifest,
    granted_install_scopes_match, has_live_guild_install_authority, is_existing_user_grant,
};
use tobot_outbox::InstallationOutboxRelay;
use tobot_persistence::{
    ActiveAuthorizationSession, GuildDiscoveryObservation, GuildShellSummary,
    NewDiscordAuthorization, NewInstallAuthorization, Store, VerifyingInstallation,
};
use tobot_secret_store::{SecretStore, VaultTransitStore};
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing::{error, info, warn};
use uuid::Uuid;

const REQUEST_ID: &str = "x-request-id";
const CSRF_HEADER: &str = "x-csrf-token";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BrowserFailure {
    Rejected,
    Expired,
    Mismatch,
    Unavailable,
}

const fn login_error_path(reason: BrowserFailure) -> &'static str {
    match reason {
        BrowserFailure::Rejected => "/login/error?reason=rejected",
        BrowserFailure::Expired => "/login/error?reason=expired",
        BrowserFailure::Mismatch => "/login/error?reason=mismatch",
        BrowserFailure::Unavailable => "/login/error?reason=unavailable",
    }
}

const fn install_error_path(reason: BrowserFailure) -> &'static str {
    match reason {
        BrowserFailure::Rejected => "/install/error?reason=rejected",
        BrowserFailure::Expired => "/install/error?reason=expired",
        BrowserFailure::Mismatch => "/install/error?reason=mismatch",
        BrowserFailure::Unavailable => "/install/error?reason=unavailable",
    }
}

fn oauth_consume_failure(error: &OAuthServiceError) -> BrowserFailure {
    match error {
        OAuthServiceError::InvalidTransaction => BrowserFailure::Expired,
        OAuthServiceError::InvalidVerifier => BrowserFailure::Mismatch,
        OAuthServiceError::Persistence | OAuthServiceError::SecretStore => {
            BrowserFailure::Unavailable
        }
    }
}

#[derive(Clone)]
struct AppState {
    store: Store,
    secret_store: VaultTransitStore,
    oauth: OAuthService<VaultTransitStore>,
    discord_oauth: DiscordOAuthClient,
    discord_client_id: String,
    discord_application_id: String,
    discord_redirect_uri: String,
    discord_install_redirect_uri: String,
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
    let inspection = InstallationInspectionClient::new(
        &config.delivery_url,
        config
            .internal_service_token
            .expose_for_adapter()
            .to_owned(),
    )
    .context("cannot construct Installation inspection client")?;
    let verification_store = store.clone();
    let installation_relay = InstallationOutboxRelay::new(
        store.clone(),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())
            .context("cannot construct Installation outbox publisher")?,
    );
    let query_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "query-status-s0",
        &format!("control-{}", Uuid::now_v7()),
    )
    .context("cannot construct Query/Status stream consumer")?;
    let query_store = store.clone();
    let app = router(AppState {
        oauth: OAuthService::new(store.clone(), secret_store.clone()),
        store,
        secret_store,
        discord_oauth,
        discord_client_id: config.discord_client_id,
        discord_application_id: config.discord_application_id,
        discord_redirect_uri: config.discord_oauth_redirect_uri,
        discord_install_redirect_uri: config.discord_install_redirect_uri,
        public_origin: config.public_origin.clone(),
        clock: SystemClock,
    });

    info!(bind = %address, origin = %config.public_origin, "control plane starting");
    let listener = tokio::net::TcpListener::bind(address).await?;
    tokio::select! {
        result = axum::serve(listener, app) => result.context("Control Plane listener failed"),
        result = run_installation_verifier(verification_store, inspection) => result,
        result = run_installation_relay(installation_relay) => result,
        result = run_query_projector(query_store, query_consumer) => result,
    }
}

async fn run_query_projector(store: Store, consumer: RedisStreamConsumer) -> anyhow::Result<()> {
    loop {
        for message in consumer.read().await? {
            let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
            if parsed.event.schema_name == "InstallationStateChanged" {
                store
                    .apply_installation_projection(
                        &parsed.event,
                        &message.envelope,
                        &message.stream_id,
                        time::OffsetDateTime::now_utc(),
                    )
                    .await?;
            }
            consumer.acknowledge(&message.stream_id).await?;
        }
    }
}

async fn run_installation_relay(relay: InstallationOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(time::OffsetDateTime::now_utc(), 100).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed installation outbox facts"),
            Err(cause) => {
                error!(error = %cause, "installation outbox relay failed");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn run_installation_verifier(
    store: Store,
    inspection: InstallationInspectionClient,
) -> anyhow::Result<()> {
    loop {
        let now = time::OffsetDateTime::now_utc();
        let Some(claim) = store.claim_installation_verification(now).await? else {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            continue;
        };
        match inspection
            .inspect_guild_presence(&claim.provider_guild_id)
            .await
        {
            Ok(observation) if observation.provider_guild_id == claim.provider_guild_id => {
                if let Err(cause) = store
                    .complete_installation_verification(&claim, observation.present, now)
                    .await
                {
                    error!(
                        installation_id = %claim.installation_id,
                        fencing_token = claim.fencing_token,
                        error = %cause,
                        "installation verification result was not applied"
                    );
                }
            }
            Ok(_) => {
                error!(
                    installation_id = %claim.installation_id,
                    "installation inspection identity mismatch"
                );
                store.release_installation_verification(&claim).await?;
            }
            Err(cause) => {
                error!(
                    installation_id = %claim.installation_id,
                    error = %cause,
                    "installation inspection unavailable; claim released"
                );
                store.release_installation_verification(&claim).await?;
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/auth/login", get(login))
        .route("/auth/discord/callback", get(discord_callback))
        .route("/install/discord/callback", get(guild_install_callback))
        .route(
            "/api/v1/install/guild/{guild_id}",
            post(start_guild_install),
        )
        .route(
            "/api/v1/install/repair/{tenant_id}",
            post(start_guild_repair),
        )
        .route("/api/v1/session/logout", post(logout))
        .route("/api/v1/csrf", get(csrf))
        .route("/api/v1/guilds", get(guilds))
        .route("/api/v1/guilds/{tenant_id}", get(guild_shell))
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

#[derive(serde::Deserialize)]
struct InstallCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    guild_id: Option<String>,
    permissions: Option<String>,
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
            Redirect::to("/"),
        )
            .into_response(),
        Err(reason) => (
            [(header::SET_COOKIE, clear_cookie)],
            Redirect::to(login_error_path(reason)),
        )
            .into_response(),
    }
}

async fn complete_discord_callback(
    state: &AppState,
    query: &DiscordCallbackQuery,
    headers: &HeaderMap,
) -> Result<Uuid, BrowserFailure> {
    if query.error.is_some() {
        return Err(BrowserFailure::Rejected);
    }
    let code = query.code.as_deref().ok_or(BrowserFailure::Mismatch)?;
    let query_state = query.state.as_deref().ok_or(BrowserFailure::Mismatch)?;
    let cookie_state =
        cookie_value(headers, "__Host-tobot_oauth_state").ok_or(BrowserFailure::Mismatch)?;
    if !opaque_secrets_match(query_state, cookie_state) {
        return Err(BrowserFailure::Mismatch);
    }
    let consumed = state
        .oauth
        .consume(query_state, state.clock.now())
        .await
        .map_err(|error| oauth_consume_failure(&error))?;
    let tokens = state
        .discord_oauth
        .exchange_code(code, &consumed.redirect_uri, &consumed.code_verifier)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let (user, authorization_scopes) = state
        .discord_oauth
        .current_user(&tokens.access_token)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let mut expected_scopes = consumed.scopes;
    expected_scopes.sort_unstable();
    expected_scopes.dedup();
    if tokens.scopes != expected_scopes || authorization_scopes != expected_scopes {
        return Err(BrowserFailure::Mismatch);
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
        .map_err(|_| BrowserFailure::Unavailable)?;
    let refresh_ciphertext = state
        .secret_store
        .encrypt(
            tokens.refresh_token.as_bytes(),
            credential_context.as_bytes(),
        )
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let csrf_ciphertext = state
        .secret_store
        .encrypt(session.csrf_proof.as_bytes(), session_context.as_bytes())
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let expires_at = now
        .checked_add(std::time::Duration::from_secs(tokens.expires_in_seconds))
        .ok_or(BrowserFailure::Unavailable)?;
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
        .map_err(|_| BrowserFailure::Unavailable)?;
    Ok(session.id)
}

async fn guild_install_callback(
    State(state): State<AppState>,
    Query(query): Query<InstallCallbackQuery>,
    headers: HeaderMap,
) -> Response {
    let result = complete_guild_install_callback(&state, &query, &headers).await;
    let clear_cookie =
        "__Host-tobot_install_state=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
    match result {
        Ok(tenant_id) => (
            [(header::SET_COOKIE, clear_cookie)],
            Redirect::to(&format!("/guild/{tenant_id}")),
        )
            .into_response(),
        Err(reason) => (
            [(header::SET_COOKIE, clear_cookie)],
            Redirect::to(install_error_path(reason)),
        )
            .into_response(),
    }
}

async fn complete_guild_install_callback(
    state: &AppState,
    query: &InstallCallbackQuery,
    headers: &HeaderMap,
) -> Result<Uuid, BrowserFailure> {
    if query.error.is_some() {
        return Err(BrowserFailure::Rejected);
    }
    let code = query.code.as_deref().ok_or(BrowserFailure::Mismatch)?;
    let callback_state = query.state.as_deref().ok_or(BrowserFailure::Mismatch)?;
    let cookie_state =
        cookie_value(headers, "__Host-tobot_install_state").ok_or(BrowserFailure::Mismatch)?;
    if !opaque_secrets_match(callback_state, cookie_state) {
        return Err(BrowserFailure::Mismatch);
    }
    let session_id = session_id(headers).ok_or(BrowserFailure::Rejected)?;
    let now = time::OffsetDateTime::from(state.clock.now());
    let session = state
        .store
        .authorize_session(session_id, now)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?
        .ok_or(BrowserFailure::Expired)?;
    let login_access_token = decrypt_access_token(state, &session)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let live_guilds = state
        .discord_oauth
        .current_user_guilds(&login_access_token)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let consumed = state
        .store
        .consume_install_authorization(
            &oauth_state_hash(callback_state),
            session.account_id,
            session_id,
            now,
        )
        .await
        .map_err(|_| BrowserFailure::Unavailable)?
        .ok_or(BrowserFailure::Expired)?;
    let live_guild = live_guilds
        .iter()
        .find(|guild| guild.id == consumed.provider_guild_id)
        .ok_or(BrowserFailure::Rejected)?;
    if !has_live_guild_install_authority(live_guild.owner, &live_guild.permissions) {
        return Err(BrowserFailure::Rejected);
    }
    let ciphertext = std::str::from_utf8(&consumed.verifier_ciphertext)
        .map_err(|_| BrowserFailure::Unavailable)?;
    let context = format!("tobot:guild-install-pkce:{}", consumed.transaction_id);
    let verifier = state
        .secret_store
        .decrypt(ciphertext, context.as_bytes())
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let verifier = String::from_utf8(verifier).map_err(|_| BrowserFailure::Unavailable)?;
    let tokens = state
        .discord_oauth
        .exchange_code(code, &consumed.redirect_uri, &verifier)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let mut expected_scopes = consumed.requested_scopes;
    expected_scopes.sort_unstable();
    expected_scopes.dedup();
    let observed_guild_id = observed_install_guild(
        &expected_scopes,
        &tokens.scopes,
        tokens.guild.as_ref().map(|guild| guild.id.as_str()),
        &consumed.provider_guild_id,
    )?;
    let tenant_id = state
        .store
        .record_verifying_installation(VerifyingInstallation {
            transaction_id: consumed.transaction_id,
            candidate_tenant_id: Uuid::now_v7(),
            provider_guild_id: &observed_guild_id,
            application_id: &state.discord_application_id,
            generation: consumed.generation,
            frozen_manifest: &consumed.frozen_manifest,
            provider_guild_hint: query.guild_id.as_deref(),
            permissions_hint: query.permissions.as_deref(),
            received_at: now,
        })
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    if let Err(cause) = state.discord_oauth.revoke_token(&tokens.access_token).await {
        warn!(
            transaction_id = %consumed.transaction_id,
            error = %cause,
            "temporary installation OAuth authorization could not be revoked"
        );
    }
    Ok(tenant_id)
}

fn observed_install_guild(
    expected_scopes: &[String],
    granted_scopes: &[String],
    granted_guild_id: Option<&str>,
    provider_guild_id: &str,
) -> Result<String, BrowserFailure> {
    if granted_install_scopes_match(expected_scopes, granted_scopes) {
        let Some(observed_guild_id) = granted_guild_id else {
            warn!(
                granted = ?granted_scopes,
                "installation grant omitted the guild"
            );
            return Err(BrowserFailure::Unavailable);
        };
        if observed_guild_id != provider_guild_id {
            warn!("installation grant guild mismatch");
            return Err(BrowserFailure::Mismatch);
        }
        return Ok(observed_guild_id.to_owned());
    }
    if is_existing_user_grant(granted_scopes) {
        info!(
            granted = ?granted_scopes,
            "bot install kept the existing user grant; presence is observed for the locked guild"
        );
        return Ok(provider_guild_id.to_owned());
    }
    warn!(
        requested = ?expected_scopes,
        granted = ?granted_scopes,
        "installation grant scope mismatch"
    );
    Err(BrowserFailure::Mismatch)
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

#[derive(Debug, Eq, PartialEq, serde::Serialize)]
struct GuildDiscoveryResponse {
    guilds: Vec<GuildDiscoveryItem>,
    observed_at_unix: i64,
    expires_at_unix: i64,
    authority: &'static str,
}

#[derive(Debug, Eq, PartialEq, serde::Serialize)]
struct GuildDiscoveryItem {
    provider_guild_id: String,
    name: String,
    icon_hash: Option<String>,
    owner_hint: bool,
    permissions_hint: String,
    shell: Option<GuildDiscoveryShell>,
}

#[derive(Debug, Eq, PartialEq, serde::Serialize)]
struct GuildDiscoveryShell {
    tenant_id: Uuid,
    installation_state: String,
    health_state: String,
    projection_watermark_unix: i64,
    projection_age_seconds: i64,
}

fn discovery_response_items(
    guilds: Vec<DiscordGuildObservation>,
    summaries: &[GuildShellSummary],
    now: time::OffsetDateTime,
) -> Vec<GuildDiscoveryItem> {
    let mut shells = HashMap::<&str, &GuildShellSummary>::new();
    for summary in summaries {
        let Some(provider_guild_id) = summary.provider_guild_id.as_deref() else {
            continue;
        };
        shells.insert(provider_guild_id, summary);
    }
    guilds
        .into_iter()
        .map(|guild| {
            let shell = shells
                .get(guild.id.as_str())
                .map(|summary| GuildDiscoveryShell {
                    tenant_id: summary.tenant_id,
                    installation_state: summary.installation_state.clone(),
                    health_state: summary.health_state.clone(),
                    projection_watermark_unix: summary.projection_watermark.unix_timestamp(),
                    projection_age_seconds: (now - summary.projection_watermark)
                        .whole_seconds()
                        .max(0),
                });
            GuildDiscoveryItem {
                provider_guild_id: guild.id,
                name: guild.name,
                icon_hash: guild.icon,
                owner_hint: guild.owner,
                permissions_hint: guild.permissions,
                shell,
            }
        })
        .collect()
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
    let provider_guild_ids = discovered
        .iter()
        .map(|guild| guild.id.clone())
        .collect::<Vec<_>>();
    let Ok(summaries) = state
        .store
        .guild_shell_summaries_for_provider_guilds(&provider_guild_ids)
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let guilds = discovery_response_items(discovered, &summaries, now);
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

#[derive(serde::Serialize)]
struct GuildShellResponse {
    tenant_id: Uuid,
    provider_guild_id: String,
    installation_state: String,
    health_state: String,
    installation_generation: i64,
    capabilities: serde_json::Value,
    projection_watermark_unix: i64,
    projection_age_seconds: i64,
    probe_state: String,
}

async fn guild_shell(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    let Some(session_id) = session_id(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(Some(session)) = state.store.authorize_session(session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    let Ok(provider_guild_ids) = state
        .store
        .fresh_discovered_guild_ids(session.account_id, now)
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(Some(shell)) = state
        .store
        .guild_shell_for_provider_guilds(tenant_id, &provider_guild_ids)
        .await
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let (Some(provider_guild_id), Some(installation_generation)) =
        (shell.provider_guild_id, shell.installation_generation)
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    (
        [(header::CACHE_CONTROL, "private, no-store")],
        axum::Json(GuildShellResponse {
            tenant_id: shell.tenant_id,
            provider_guild_id,
            installation_state: shell.installation_state,
            health_state: shell.health_state,
            installation_generation,
            capabilities: shell.capabilities,
            projection_watermark_unix: shell.projection_watermark.unix_timestamp(),
            projection_age_seconds: (now - shell.projection_watermark).whole_seconds().max(0),
            probe_state: shell.probe_state,
        }),
    )
        .into_response()
}

async fn start_guild_install(
    State(state): State<AppState>,
    Path(guild_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let (session_id, session) = match authorize_mutation(&state, &headers).await {
        Ok(authorization) => authorization,
        Err(status) => return status.into_response(),
    };
    let access_token = match decrypt_access_token(&state, &session).await {
        Ok(token) => token,
        Err(status) => return status.into_response(),
    };
    let Ok(guilds) = state.discord_oauth.current_user_guilds(&access_token).await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let Some(guild) = guilds.iter().find(|guild| guild.id == guild_id) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if !has_live_guild_install_authority(guild.owner, &guild.permissions) {
        return StatusCode::FORBIDDEN.into_response();
    }

    let authorization = GuildInstallAuthorization::new(
        guild_id,
        state.discord_install_redirect_uri.clone(),
        state.clock.now(),
    );
    let verifier_context = format!("tobot:guild-install-pkce:{}", authorization.id);
    let Ok(verifier_ciphertext) = state
        .secret_store
        .encrypt(
            authorization.code_verifier.as_bytes(),
            verifier_context.as_bytes(),
        )
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(frozen_manifest) = serde_json::to_value(S0Manifest::default()) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if state
        .store
        .create_guild_install_authorization(NewInstallAuthorization {
            transaction_id: authorization.id,
            state_hash: &oauth_state_hash(&authorization.state),
            verifier_ciphertext: verifier_ciphertext.as_bytes(),
            account_id: session.account_id,
            session_id,
            provider_guild_id: &authorization.provider_guild_id,
            redirect_uri: &authorization.redirect_uri,
            requested_scopes: &authorization.scopes,
            frozen_manifest: &frozen_manifest,
            expires_at: time::OffsetDateTime::from(authorization.expires_at),
            preset: InstallPreset::GuildInstall.as_str(),
        })
        .await
        .is_err()
    {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let Ok(authorize_url) = authorization.authorize_url(&state.discord_client_id) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let cookie = format!(
        "__Host-tobot_install_state={}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax",
        authorization.state
    );
    (
        [
            (header::CACHE_CONTROL, "no-store".to_owned()),
            (header::SET_COOKIE, cookie),
        ],
        axum::Json(GuildInstallStartResponse {
            authorize_url: authorize_url.to_string(),
        }),
    )
        .into_response()
}

#[derive(serde::Serialize)]
struct GuildInstallStartResponse {
    authorize_url: String,
}

async fn start_guild_repair(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    let (session_id, session) = match authorize_mutation(&state, &headers).await {
        Ok(authorization) => authorization,
        Err(status) => return status.into_response(),
    };
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(provider_guild_ids) = state
        .store
        .fresh_discovered_guild_ids(session.account_id, now)
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(Some(shell)) = state
        .store
        .guild_shell_for_provider_guilds(tenant_id, &provider_guild_ids)
        .await
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if shell.installation_state != "Degraded" {
        return StatusCode::CONFLICT.into_response();
    }
    let Some(provider_guild_id) = shell.provider_guild_id else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let access_token = match decrypt_access_token(&state, &session).await {
        Ok(token) => token,
        Err(status) => return status.into_response(),
    };
    let Ok(guilds) = state.discord_oauth.current_user_guilds(&access_token).await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let Some(guild) = guilds
        .into_iter()
        .find(|guild| guild.id == provider_guild_id)
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if !has_live_guild_install_authority(guild.owner, &guild.permissions) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let authorization = GuildRepairAuthorization::new(
        provider_guild_id,
        state.discord_install_redirect_uri.clone(),
        state.clock.now(),
    );
    let handoff = authorization.authorization();
    let verifier_context = format!("tobot:guild-install-pkce:{}", handoff.id);
    let Ok(verifier_ciphertext) = state
        .secret_store
        .encrypt(
            handoff.code_verifier.as_bytes(),
            verifier_context.as_bytes(),
        )
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(frozen_manifest) = serde_json::to_value(S0Manifest::default()) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if state
        .store
        .create_guild_install_authorization(NewInstallAuthorization {
            transaction_id: handoff.id,
            state_hash: &oauth_state_hash(&handoff.state),
            verifier_ciphertext: verifier_ciphertext.as_bytes(),
            account_id: session.account_id,
            session_id,
            provider_guild_id: &handoff.provider_guild_id,
            redirect_uri: &handoff.redirect_uri,
            requested_scopes: &handoff.scopes,
            frozen_manifest: &frozen_manifest,
            expires_at: time::OffsetDateTime::from(handoff.expires_at),
            preset: InstallPreset::GuildRepair.as_str(),
        })
        .await
        .is_err()
    {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let Ok(authorize_url) = authorization.authorize_url(&state.discord_client_id) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let cookie = format!(
        "__Host-tobot_install_state={}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax",
        handoff.state
    );
    (
        [
            (header::CACHE_CONTROL, "no-store".to_owned()),
            (header::SET_COOKIE, cookie),
        ],
        axum::Json(GuildInstallStartResponse {
            authorize_url: authorize_url.to_string(),
        }),
    )
        .into_response()
}

async fn authorize_mutation(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Uuid, ActiveAuthorizationSession), StatusCode> {
    let session_id = session_id(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::FORBIDDEN)?;
    let proof = headers
        .get(HeaderName::from_static(CSRF_HEADER))
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::FORBIDDEN)?;
    if !opaque_secrets_match(origin, &state.public_origin) {
        return Err(StatusCode::FORBIDDEN);
    }
    let now = time::OffsetDateTime::from(state.clock.now());
    let session = state
        .store
        .authorize_session(session_id, now)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let ciphertext = std::str::from_utf8(&session.csrf_secret_ciphertext)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let context = format!("tobot:session-csrf:{session_id}");
    let plaintext = state
        .secret_store
        .decrypt(ciphertext, context.as_bytes())
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let expected = String::from_utf8(plaintext).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !opaque_secrets_match(proof, &expected) {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok((session_id, session))
}

async fn decrypt_access_token(
    state: &AppState,
    session: &ActiveAuthorizationSession,
) -> Result<String, StatusCode> {
    let ciphertext = std::str::from_utf8(&session.access_token_ciphertext)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let context = format!("tobot:discord-oauth:{}", session.credential_id);
    let plaintext = state
        .secret_store
        .decrypt(ciphertext, context.as_bytes())
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    String::from_utf8(plaintext).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
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

use axum::http::HeaderName;

#[cfg(test)]
mod tests {
    use super::{
        BrowserFailure, DiscordGuildObservation, GuildShellSummary, discovery_response_items,
        install_error_path, login_error_path,
    };
    use uuid::Uuid;

    fn timestamp(seconds: i64) -> time::OffsetDateTime {
        time::OffsetDateTime::from_unix_timestamp(seconds)
            .unwrap_or_else(|error| panic!("timestamp {seconds} is invalid: {error}"))
    }

    fn guild(id: &str, name: &str) -> DiscordGuildObservation {
        DiscordGuildObservation {
            id: id.to_owned(),
            name: name.to_owned(),
            icon: None,
            owner: false,
            permissions: "0".to_owned(),
        }
    }

    #[test]
    fn discovery_attaches_shells_only_for_observed_guilds() {
        let now = timestamp(1_700_000_090);
        let tenant_id = Uuid::now_v7();
        let summaries = [
            GuildShellSummary {
                tenant_id,
                provider_guild_id: Some("111".to_owned()),
                installation_state: "Installed".to_owned(),
                health_state: "Healthy".to_owned(),
                projection_watermark: timestamp(1_700_000_000),
            },
            GuildShellSummary {
                tenant_id: Uuid::now_v7(),
                provider_guild_id: Some("999".to_owned()),
                installation_state: "Verifying".to_owned(),
                health_state: "Pending".to_owned(),
                projection_watermark: now,
            },
            GuildShellSummary {
                tenant_id: Uuid::now_v7(),
                provider_guild_id: None,
                installation_state: "Degraded".to_owned(),
                health_state: "Degraded".to_owned(),
                projection_watermark: now,
            },
        ];
        let mut items = discovery_response_items(
            vec![guild("111", "Observed"), guild("222", "Plain")],
            &summaries,
            now,
        )
        .into_iter();
        let installed = items
            .next()
            .unwrap_or_else(|| panic!("missing observed guild"));
        let plain = items
            .next()
            .unwrap_or_else(|| panic!("missing plain guild"));
        assert!(items.next().is_none());
        let shell = installed
            .shell
            .unwrap_or_else(|| panic!("observed guild has no shell"));
        assert_eq!(shell.tenant_id, tenant_id);
        assert_eq!(shell.installation_state, "Installed");
        assert_eq!(shell.projection_age_seconds, 90);
        assert!(plain.shell.is_none());
    }

    #[test]
    fn future_watermark_reports_zero_age() {
        let now = timestamp(1_700_000_000);
        let mut items = discovery_response_items(
            vec![guild("111", "Observed")],
            &[GuildShellSummary {
                tenant_id: Uuid::now_v7(),
                provider_guild_id: Some("111".to_owned()),
                installation_state: "Verifying".to_owned(),
                health_state: "Pending".to_owned(),
                projection_watermark: timestamp(1_700_000_050),
            }],
            now,
        )
        .into_iter();
        let item = items.next().unwrap_or_else(|| panic!("missing guild"));
        let shell = item.shell.unwrap_or_else(|| panic!("missing shell"));
        assert_eq!(shell.projection_age_seconds, 0);
    }

    #[test]
    fn browser_failure_paths_stay_closed() {
        for reason in [
            BrowserFailure::Rejected,
            BrowserFailure::Expired,
            BrowserFailure::Mismatch,
            BrowserFailure::Unavailable,
        ] {
            let login = login_error_path(reason);
            let install = install_error_path(reason);
            assert!(login.starts_with("/login/error?reason="));
            assert!(install.starts_with("/install/error?reason="));
            assert!(!login.contains('&'));
            assert!(!install.contains("code"));
            assert!(!install.contains("guild_id"));
        }
        assert_eq!(
            login_error_path(BrowserFailure::Expired),
            "/login/error?reason=expired"
        );
        assert_eq!(
            install_error_path(BrowserFailure::Mismatch),
            "/install/error?reason=mismatch"
        );
    }
}
