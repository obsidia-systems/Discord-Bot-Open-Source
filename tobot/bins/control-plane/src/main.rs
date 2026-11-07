//! Public Control Plane surface. OAuth and installation routes remain at the
//! app origin when the reverse proxy forwards these paths to this binary.

mod ai;
mod billing;
mod cases_http;
mod earnings;
mod ledger_client;
mod progression;
mod roles;
mod support;
mod welcome;

use std::{collections::HashMap, net::SocketAddr};

use anyhow::Context;
use axum::{
    Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use subtle::ConstantTimeEq;
use tobot_bus::{RedisStreamConsumer, RedisStreamPublisher};
use tobot_config::ControlPlaneConfig;
use tobot_core::{Clock, SystemClock, render_gauges};
use tobot_delivery_client::{
    CasesDeliveryClient, InstallationInspectionClient, WelcomeDeliveryClient,
};
use tobot_discord_adapter::{DiscordGuildObservation, DiscordOAuthClient, TransportError};
use tobot_identity::{
    AuthorizationSession, oauth_state_hash, opaque_secret_hash, opaque_secrets_match, pkce_s256,
};
use tobot_identity_service::{OAuthService, OAuthServiceError};
use tobot_installation::{
    GuildInstallAuthorization, GuildRepairAuthorization, InstallPreset, SafetyManifest,
    granted_install_scopes_match, has_live_guild_install_authority, is_existing_user_grant,
};
use tobot_outbox::{InstallationOutboxRelay, MessagingOutboxRelay, ModerationOutboxRelay};
use tobot_persistence::{
    ActiveAuthorizationSession, AuditFact, ConsumedInstallAuthorization, ControlPlaneDatabase,
    DeliveryIntentStore, GuildDiscoveryObservation, GuildShellSummary, IdentityStore,
    InstallationStore, LifecycleStore, MessagingOutbox, ModerationStore, NewDiscordAuthorization,
    NewInstallAuthorization, QueryStore, VerifyingInstallation,
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

async fn record_browser_audit(state: &AppState, outcome: &'static str, reason: BrowserFailure) {
    let reason_code = match reason {
        BrowserFailure::Rejected => "rejected",
        BrowserFailure::Expired => "expired",
        BrowserFailure::Mismatch => "mismatch",
        BrowserFailure::Unavailable => "unavailable",
    };
    if let Err(error) = state
        .identity
        .record_audit_event(AuditFact {
            outcome,
            reason_code,
            account_id: None,
            session_id: None,
            subject_ref: None,
            occurred_at: time::OffsetDateTime::from(state.clock.now()),
        })
        .await
    {
        error!(%error, outcome, "browser rejection was not audited");
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
    identity: IdentityStore,
    installation: InstallationStore,
    query: QueryStore,
    moderation: ModerationStore,
    lifecycle: LifecycleStore,
    assignment: tobot_persistence::AssignmentStore,
    progression: tobot_persistence::ProgressionStore,
    support: tobot_persistence::SupportStore,
    earnings: tobot_persistence::EarningsStore,
    entitlement: tobot_persistence::PlatformEntitlementStore,
    catalog: tobot_persistence::CommercialCatalogStore,
    billing: Option<billing::BillingClient>,
    catalog_admin_token: Option<String>,
    ledger: ledger_client::LedgerClient,
    ai: Option<ai::AiClient>,
    support_delivery: tobot_delivery_client::SupportDeliveryClient,
    welcome_delivery: WelcomeDeliveryClient,
    role_delivery: tobot_delivery_client::RoleDeliveryClient,
    cases_gateway: cases_http::DeliveryGateway,
    service_token: String,
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
#[allow(clippy::too_many_lines)]
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
    let database = ControlPlaneDatabase::connect(config.database_url.expose_for_adapter())
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
    let verification_store = database.installation.clone();
    let projector_inspection = inspection.clone();
    let installation_relay = InstallationOutboxRelay::new(
        database.installation.clone(),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())
            .context("cannot construct Installation outbox publisher")?,
    );
    // The name stays stable so a restarted process rereads its own pending entries.
    let query_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "query-status-s0",
        "control-plane",
    )
    .context("cannot construct Query/Status stream consumer")?;
    let query_store = database.query.clone();
    let installation_for_projection = database.installation.clone();
    let case_runtime = prepare_cases(&config, &database)?;
    let welcome_delivery = WelcomeDeliveryClient::new(
        &config.delivery_url,
        config
            .internal_service_token
            .expose_for_adapter()
            .to_owned(),
    )
    .context("cannot construct welcome delivery client")?;
    let welcome_dispatch = welcome_delivery.clone();
    let lifecycle_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "lifecycle-s2",
        "control-plane",
    )
    .context("cannot construct lifecycle consumer")?;
    let delivery_intents =
        DeliveryIntentStore::connect(config.database_url.expose_for_adapter()).await?;
    let lifecycle_relay = MessagingOutboxRelay::new(
        MessagingOutbox::Lifecycle(database.lifecycle.clone()),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())?,
    );
    let lifecycle_worker_store = database.lifecycle.clone();
    let lifecycle_api_store = database.lifecycle.clone();
    let welcome_query = database.query.clone();
    let welcome_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "welcome-status-s2",
        "control-plane",
    )?;
    let role_delivery = tobot_delivery_client::RoleDeliveryClient::new(
        &config.delivery_url,
        config
            .internal_service_token
            .expose_for_adapter()
            .to_owned(),
    )
    .context("cannot construct role delivery client")?;
    let role_worker_delivery = role_delivery.clone();
    let assignment_store = database.assignment.clone();
    let assignment_api = database.assignment.clone();
    let assignment_worker = database.assignment.clone();
    let assignment_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "assignment-s3",
        "control-plane",
    )
    .context("cannot construct assignment consumer")?;
    let assignment_relay = MessagingOutboxRelay::new(
        tobot_persistence::MessagingOutbox::Assignment(database.assignment.clone()),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())?,
    );
    let role_query = database.query.clone();
    let role_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "role-status-s3",
        "control-plane",
    )?;
    let progression_store = database.progression.clone();
    let progression_api = database.progression.clone();
    let progression_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "progression-s4",
        "control-plane",
    )
    .context("cannot construct progression consumer")?;
    let progression_relay = MessagingOutboxRelay::new(
        MessagingOutbox::Progression(database.progression.clone()),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())?,
    );
    let xp_query = database.query.clone();
    let xp_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "xp-status-s4",
        "control-plane",
    )?;
    let support_delivery = tobot_delivery_client::SupportDeliveryClient::new(
        &config.delivery_url,
        config
            .internal_service_token
            .expose_for_adapter()
            .to_owned(),
    )?;
    let support_worker_delivery = support_delivery.clone();
    let support_worker = database.support.clone();
    let support_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "support-s5",
        "control-plane",
    )?;
    let support_relay = MessagingOutboxRelay::new(
        MessagingOutbox::Support(database.support.clone()),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())?,
    );
    let support_query = database.query.clone();
    let support_status_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "support-status-s5",
        "control-plane",
    )?;
    let ledger =
        ledger_client::LedgerClient::from_env().context("invalid Monetary Ledger client")?;
    let earnings_worker = database.earnings.clone();
    let earnings_admission = database.earnings.clone();
    let earnings_delivery = support_delivery.clone();
    let earnings_settlement_delivery = support_delivery.clone();
    let earnings_ledger = ledger.clone();
    let earnings_admission_ledger = ledger.clone();
    let earnings_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "earnings-s6",
        "control-plane",
    )?;
    let earnings_relay = MessagingOutboxRelay::new(
        MessagingOutbox::Earnings(database.earnings.clone()),
        RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())?,
    );
    let wallet_query = database.query.clone();
    let wallet_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "wallet-status-s6",
        "control-plane",
    )?;
    let ask_client = ai::AiClient::from_env();
    let ask_entitlement = database.entitlement.clone();
    let ask_delivery_entitlement = database.entitlement.clone();
    let ask_receipts = database.earnings.clone();
    let ask_delivery = support_delivery.clone();
    let ask_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "ask-status-s8",
        "control-plane",
    )?;
    let plan_consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "plan-status-s7",
        "control-plane",
    )?;
    let plan_entitlement = database.entitlement.clone();
    let catalog_worker = database.catalog.clone();
    let catalog_billing = billing::BillingClient::from_env();
    let plan_receipts = database.earnings.clone();
    let plan_delivery = support_delivery.clone();
    let metrics_state = MetricsState {
        identity: database.identity.clone(),
        installation: database.installation.clone(),
        query: database.query.clone(),
        consumer: query_consumer.clone(),
        service_token: case_runtime.service_token.clone(),
        clock: SystemClock,
    };
    let metrics_address: SocketAddr = config
        .metrics_bind
        .parse()
        .context("invalid TOBOT_CONTROL_METRICS_BIND")?;
    let CaseRuntime {
        gateway,
        service_token,
        relay: moderation_relay,
        query: case_query,
        consumer: case_consumer,
        recovery_store,
    } = case_runtime;
    let recovery_gateway = gateway.clone();
    let app = router(AppState {
        oauth: OAuthService::new(database.identity.clone(), secret_store.clone()),
        identity: database.identity,
        installation: database.installation,
        query: database.query,
        moderation: database.moderation,
        lifecycle: lifecycle_api_store,
        assignment: assignment_api,
        progression: progression_api,
        support: database.support,
        earnings: database.earnings,
        entitlement: database.entitlement,
        catalog: database.catalog,
        billing: catalog_billing.clone(),
        catalog_admin_token: std::env::var("TOBOT_CATALOG_ADMIN_TOKEN")
            .ok()
            .filter(|value| value.len() >= 32),
        ledger,
        ai: ai::AiClient::from_env(),
        support_delivery,
        welcome_delivery,
        role_delivery,
        cases_gateway: gateway,
        service_token,
        secret_store,
        discord_oauth,
        discord_client_id: config.discord_client_id,
        discord_application_id: config.discord_application_id,
        discord_redirect_uri: config.discord_oauth_redirect_uri,
        discord_install_redirect_uri: config.discord_install_redirect_uri,
        public_origin: config.public_origin.clone(),
        clock: SystemClock,
    });

    info!(bind = %address, metrics = %metrics_address, origin = %config.public_origin, "control plane starting");
    let listener = tokio::net::TcpListener::bind(address).await?;
    let metrics_listener = tokio::net::TcpListener::bind(metrics_address).await?;
    tokio::select! {
        result = axum::serve(listener, app) => result.context("Control Plane listener failed"),
        result = axum::serve(metrics_listener, metrics_router(metrics_state)) => {
            result.context("Control Plane metrics listener failed")
        }
        result = run_installation_verifier(verification_store, inspection) => result,
        result = run_installation_relay(installation_relay) => result,
        result = run_query_projector(
            query_store,
            installation_for_projection,
            query_consumer,
            projector_inspection,
        ) => result,
        result = run_case_projector(case_query, case_consumer) => result,
        result = run_moderation_relay(moderation_relay) => result,
        result = run_case_recovery(recovery_store, recovery_gateway) => result,
        result = welcome::run_lifecycle(lifecycle_worker_store.clone(), delivery_intents, lifecycle_consumer, welcome_dispatch) => result,
        result = welcome::run_lifecycle_relay(lifecycle_relay) => result,
        result = run_welcome_projector(welcome_query, welcome_consumer) => result,
        result = roles::run_assignment(assignment_store, lifecycle_worker_store.clone(), assignment_consumer) => result,
        result = roles::run_assignment_worker(assignment_worker, role_worker_delivery) => result,
        result = roles::run_assignment_relay(assignment_relay) => result,
        result = run_role_projector(role_query, role_consumer) => result,
        result = progression::run_progression(progression_store, lifecycle_worker_store, progression_consumer) => result,
        result = progression::run_progression_relay(progression_relay) => result,
        result = run_xp_projector(xp_query, xp_consumer) => result,
        result = support::run_support(support_worker, support_worker_delivery, support_consumer) => result,
        result = support::run_support_relay(support_relay) => result,
        result = support::run_support_projector(support_query, support_status_consumer) => result,
        result = earnings::run_admission(earnings_admission,earnings_admission_ledger,earnings_delivery,earnings_consumer) => result,
        result = earnings::run_settlement(earnings_worker,earnings_ledger,earnings_settlement_delivery) => result,
        result = earnings::run_relay(earnings_relay) => result,
        result = earnings::run_projector(wallet_query,wallet_consumer) => result,
        result = billing::run_plan(plan_entitlement,plan_receipts,plan_delivery,plan_consumer) => result,
        result = billing::run_catalog_delivery(catalog_worker,catalog_billing) => result,
        result = ai::run_ask(ask_entitlement,ask_receipts,ask_delivery,ask_client.clone(),ask_consumer) => result,
        result = ai::deliver_pending(ask_delivery_entitlement,ask_client) => result,
    }
}

struct CaseRuntime {
    gateway: cases_http::DeliveryGateway,
    service_token: String,
    relay: ModerationOutboxRelay,
    query: QueryStore,
    consumer: RedisStreamConsumer,
    recovery_store: ModerationStore,
}

fn prepare_cases(
    config: &ControlPlaneConfig,
    database: &ControlPlaneDatabase,
) -> anyhow::Result<CaseRuntime> {
    let service_token = config
        .internal_service_token
        .expose_for_adapter()
        .to_owned();
    let gateway = cases_http::DeliveryGateway::new(
        CasesDeliveryClient::new(&config.delivery_url, service_token.clone())
            .context("cannot construct cases delivery client")?,
    );
    let publisher = RedisStreamPublisher::connect(config.redis_url.expose_for_adapter())
        .context("cannot construct moderation outbox publisher")?;
    let consumer = RedisStreamConsumer::connect(
        config.redis_url.expose_for_adapter(),
        "case-status-s1",
        "control-plane",
    )
    .context("cannot construct case projection consumer")?;
    Ok(CaseRuntime {
        gateway,
        service_token,
        relay: ModerationOutboxRelay::new(database.moderation.clone(), publisher),
        query: database.query.clone(),
        consumer,
        recovery_store: database.moderation.clone(),
    })
}

#[derive(Clone)]
struct MetricsState {
    identity: IdentityStore,
    installation: InstallationStore,
    query: QueryStore,
    consumer: RedisStreamConsumer,
    service_token: String,
    clock: SystemClock,
}

fn metrics_router(state: MetricsState) -> Router {
    Router::new()
        .route("/metrics", get(operational_metrics))
        .with_state(state)
}

async fn operational_metrics(State(state): State<MetricsState>, headers: HeaderMap) -> Response {
    if !bearer_matches(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match control_metrics_body(&state).await {
        Ok(body) => ([(header::CONTENT_TYPE, "text/plain; version=0.0.4")], body).into_response(),
        Err(cause) => {
            error!(error = %cause, "operational metrics unavailable");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn control_metrics_body(state: &MetricsState) -> anyhow::Result<String> {
    let now = time::OffsetDateTime::from(state.clock.now());
    let installation = state.installation.installation_relay_gauge(now).await?;
    let degraded = state.query.degraded_shell_count().await?;
    let rejections = state
        .identity
        .recent_auth_rejection_count(now - time::Duration::minutes(15))
        .await?;
    let pending = state.consumer.pending_entries().await?;
    render_gauges(&[
        (
            "tobot_installation_outbox_unpublished",
            installation.unpublished,
        ),
        (
            "tobot_installation_outbox_oldest_age_seconds",
            installation.oldest_age_seconds,
        ),
        (
            "tobot_installation_outbox_max_publish_attempts",
            installation.max_publish_attempts,
        ),
        (
            "tobot_installation_outbox_expired_leases",
            installation.expired_leases,
        ),
        ("tobot_degraded_installations", degraded),
        ("tobot_auth_rejections_15m", rejections),
        ("tobot_stream_pending", pending),
    ])
    .context("operational gauge name was rejected")
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

async fn run_query_projector(
    query: QueryStore,
    installation: InstallationStore,
    consumer: RedisStreamConsumer,
    inspection: InstallationInspectionClient,
) -> anyhow::Result<()> {
    loop {
        if let Err(cause) = project_available(&query, &installation, &consumer, &inspection).await {
            error!(error = %cause, "installation projection paused");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }
}

async fn project_available(
    query: &QueryStore,
    store: &InstallationStore,
    consumer: &RedisStreamConsumer,
    inspection: &InstallationInspectionClient,
) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        match parsed.event.schema_name.as_str() {
            "InstallationStateChanged" => {
                query
                    .apply_installation_projection(
                        &parsed.event,
                        &message.envelope,
                        &message.stream_id,
                        time::OffsetDateTime::now_utc(),
                    )
                    .await?;
            }
            "GatewayEventAccepted" => {
                apply_gateway_dispatch(store, inspection, &parsed.event).await?;
            }
            _ => {}
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

async fn run_case_projector(
    query: QueryStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        if let Err(cause) = project_cases(&query, &consumer).await {
            error!(error = %cause, "case projection paused");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }
}

async fn run_xp_projector(query: QueryStore, consumer: RedisStreamConsumer) -> anyhow::Result<()> {
    loop {
        match progression::project_xp(&query, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                tracing::error!(%error, "xp projection paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn run_role_projector(
    query: QueryStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match roles::project_roles(&query, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                tracing::error!(%error, "role projection paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn run_welcome_projector(
    query: QueryStore,
    consumer: RedisStreamConsumer,
) -> anyhow::Result<()> {
    loop {
        match project_welcome(&query, &consumer).await {
            Ok(()) => {}
            Err(error) => {
                error!(%error, "welcome projection paused");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn project_welcome(query: &QueryStore, consumer: &RedisStreamConsumer) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        if matches!(
            parsed.event.schema_name.as_str(),
            "DeliveryQueued"
                | "DeliveryAttempted"
                | "DeliverySucceeded"
                | "DeliveryBlocked"
                | "DeliveryOutcomeUncertain"
                | "DeliveryDeadLettered"
        ) {
            query
                .apply_welcome_delivery(
                    &parsed.event,
                    &message.envelope,
                    &message.stream_id,
                    time::OffsetDateTime::now_utc(),
                )
                .await?;
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

async fn project_cases(query: &QueryStore, consumer: &RedisStreamConsumer) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed = tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        if parsed.event.schema_name.starts_with("Moderation") {
            query
                .apply_case_projection(
                    &parsed.event,
                    &message.envelope,
                    &message.stream_id,
                    time::OffsetDateTime::now_utc(),
                )
                .await?;
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

async fn run_moderation_relay(relay: ModerationOutboxRelay) -> anyhow::Result<()> {
    loop {
        match relay.relay_once(time::OffsetDateTime::now_utc(), 100).await {
            Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count) => info!(count, "relayed moderation outbox facts"),
            Err(cause) => {
                error!(error = %cause, "moderation outbox relay failed");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn run_case_recovery(
    store: ModerationStore,
    gateway: cases_http::DeliveryGateway,
) -> anyhow::Result<()> {
    loop {
        match tobot_cases::resume_stale_cases(&store, &gateway, time::OffsetDateTime::now_utc())
            .await
        {
            Ok(0) => {}
            Ok(count) => info!(count, "resumed executing moderation cases"),
            Err(cause) => error!(error = %cause, "moderation recovery failed"),
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

async fn apply_gateway_dispatch(
    store: &InstallationStore,
    inspection: &InstallationInspectionClient,
    event: &tobot_envelope::EventEnvelope,
) -> anyhow::Result<()> {
    let Some(dispatch) = event.gateway_dispatch() else {
        return Ok(());
    };
    match dispatch {
        tobot_envelope::GatewayDispatch::Ready { present_guild_ids } => {
            depart_guilds_absent_from_ready(store, &event.application_id, &present_guild_ids)
                .await?;
        }
        tobot_envelope::GatewayDispatch::Resumed => {
            reconcile_resumed_presence(store, inspection, &event.application_id).await?;
        }
        tobot_envelope::GatewayDispatch::GuildDelete { guild_id, bot_left } if bot_left => {
            store
                .record_bot_departure(
                    &event.application_id,
                    &guild_id,
                    time::OffsetDateTime::now_utc(),
                )
                .await?;
        }
        tobot_envelope::GatewayDispatch::GuildDelete { guild_id, .. } => {
            info!(guild_id, "guild unavailable; installation unchanged");
        }
        tobot_envelope::GatewayDispatch::GuildCreate { .. } => {}
    }
    Ok(())
}

async fn depart_guilds_absent_from_ready(
    store: &InstallationStore,
    application_id: &str,
    present: &[String],
) -> anyhow::Result<()> {
    let installed = store.installed_provider_guild_ids(application_id).await?;
    for guild_id in guilds_absent_from_snapshot(&installed, present) {
        store
            .record_bot_departure(application_id, guild_id, time::OffsetDateTime::now_utc())
            .await?;
    }
    Ok(())
}

async fn reconcile_resumed_presence(
    store: &InstallationStore,
    inspection: &InstallationInspectionClient,
    application_id: &str,
) -> anyhow::Result<()> {
    let installed = store.installed_provider_guild_ids(application_id).await?;
    for guild_id in installed {
        match inspection.inspect_guild_presence(&guild_id).await {
            Ok(observation)
                if !observation.present && observation.provider_guild_id == guild_id =>
            {
                store
                    .record_bot_departure(
                        application_id,
                        &guild_id,
                        time::OffsetDateTime::now_utc(),
                    )
                    .await?;
            }
            Ok(_) => {}
            Err(TransportError::Unavailable(_) | TransportError::RateLimited { .. }) => {
                warn!(guild_id, "presence reconciliation paused");
                anyhow::bail!("presence reconciliation paused");
            }
            Err(TransportError::Rejected { status }) => {
                warn!(guild_id, status, "presence reconciliation skipped");
            }
        }
    }
    Ok(())
}

fn guilds_absent_from_snapshot<'a>(installed: &'a [String], present: &[String]) -> Vec<&'a str> {
    installed
        .iter()
        .filter(|guild_id| !present.iter().any(|present_id| present_id == *guild_id))
        .map(String::as_str)
        .collect()
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
    store: InstallationStore,
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
        .route("/auth/discord/start", get(login))
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
        .route(
            "/api/v1/guilds/{tenant_id}/welcome",
            get(welcome::get_welcome).post(welcome::publish),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/welcome/channels",
            get(welcome::channels),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/roles",
            get(roles::get_role).post(roles::publish),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/roles/catalog",
            get(roles::catalog),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/progression",
            get(progression::get_progression).post(progression::publish),
        )
        .route("/api/v1/guilds/{tenant_id}/support", get(support::inbox))
        .route(
            "/api/v1/guilds/{tenant_id}/economy",
            get(earnings::status).post(earnings::publish),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/economy/circuit",
            post(earnings::circuit),
        )
        .route("/api/v1/guilds/{tenant_id}/wallet", get(earnings::wallet))
        .route("/api/v1/guilds/{tenant_id}/billing", get(billing::status))
        .route("/api/v1/guilds/{tenant_id}/ai", get(ai::usage))
        .route("/internal/v1/ai/pricing", post(ai::publish_pricing))
        .route("/internal/v1/ai/compensation", post(ai::compensate))
        .route("/internal/v1/ai/reviews/{tenant_id}", get(ai::reviews))
        .route("/internal/v1/ai/reconciliation", post(ai::reconcile))
        .route(
            "/api/v1/guilds/{tenant_id}/billing/checkout",
            post(billing::checkout),
        )
        .route("/internal/v1/billing/grants", post(billing::grant))
        .route(
            "/internal/v1/catalog/provider/plans",
            get(billing::provider_plans).post(billing::provider_create_plan),
        )
        .route(
            "/internal/v1/catalog/provider/prices/{price_id}",
            get(billing::provider_price),
        )
        .route(
            "/internal/v1/catalog/provider/products/{product_id}/prices",
            post(billing::provider_create_price),
        )
        .route(
            "/internal/v1/catalog/provider/products/{product_id}",
            post(billing::provider_update_product),
        )
        .route(
            "/internal/v1/catalog/provider/products/{product_id}/archive",
            post(billing::provider_archive_product),
        )
        .route(
            "/internal/v1/catalog/provider/prices/{price_id}/archive",
            post(billing::provider_archive_price),
        )
        .route(
            "/internal/v1/catalog/revisions",
            post(billing::publish_catalog),
        )
        .route(
            "/internal/v1/catalog/revisions/active",
            get(billing::active_catalog),
        )
        .route(
            "/internal/v1/catalog/capabilities",
            get(billing::catalog_capabilities),
        )
        .route(
            "/internal/v1/catalog/revisions/latest",
            get(billing::latest_catalog),
        )
        .route(
            "/internal/v1/catalog/revisions/{revision_id}/retire",
            post(billing::retire_catalog),
        )
        .route(
            "/internal/v1/catalog/billing-owners",
            post(billing::enroll_owner),
        )
        .route("/api/v1/member/guilds", get(earnings::member_guilds))
        .route(
            "/api/v1/guilds/{tenant_id}/support/panel",
            get(support::panel_status).post(support::publish),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/support/{case_id}/claim",
            post(support::claim),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/support/{case_id}/close",
            post(support::close),
        )
        .route(
            "/internal/v1/moderation/actions",
            post(cases_http::submit_moderation_action),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/cases",
            get(cases_http::list_cases),
        )
        .route(
            "/api/v1/guilds/{tenant_id}/cases/{case_id}",
            get(cases_http::case_detail),
        )
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
        Err(reason) => {
            record_browser_audit(&state, "login_rejected", reason).await;
            (
                [(header::SET_COOKIE, clear_cookie)],
                Redirect::to(login_error_path(reason)),
            )
                .into_response()
        }
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
        .identity
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
    if let Err(error) = state
        .identity
        .record_audit_event(AuditFact {
            outcome: "login_succeeded",
            reason_code: "oauth_callback",
            account_id: None,
            session_id: Some(session.id),
            subject_ref: None,
            occurred_at: time::OffsetDateTime::from(now),
        })
        .await
    {
        warn!(error = %error, "login success was not audited");
    }
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
        Err(reason) => {
            record_browser_audit(&state, "install_rejected", reason).await;
            (
                [(header::SET_COOKIE, clear_cookie)],
                Redirect::to(install_error_path(reason)),
            )
                .into_response()
        }
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
    let session = authorize_browser_session(state, session_id, now)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?
        .ok_or(BrowserFailure::Expired)?;
    let live_guilds = match live_user_guilds(state, &session).await {
        Ok(guilds) => guilds,
        Err(StatusCode::UNAUTHORIZED) => return Err(BrowserFailure::Expired),
        Err(_) => return Err(BrowserFailure::Unavailable),
    };
    let consumed = state
        .installation
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
    let mut expected_scopes = consumed.requested_scopes.clone();
    expected_scopes.sort_unstable();
    expected_scopes.dedup();
    let observed_guild_id = observed_install_guild(
        &expected_scopes,
        &tokens.scopes,
        tokens.guild.as_ref().map(|guild| guild.id.as_str()),
        &consumed.provider_guild_id,
    )?;
    let tenant_id = record_callback_installation(
        state,
        &consumed,
        &observed_guild_id,
        query,
        now,
        session.account_id,
    )
    .await?;
    if let Err(cause) = state.discord_oauth.revoke_token(&tokens.access_token).await {
        warn!(
            transaction_id = %consumed.transaction_id,
            error = %cause,
            "temporary installation OAuth authorization could not be revoked"
        );
    }
    Ok(tenant_id)
}

async fn record_callback_installation(
    state: &AppState,
    consumed: &ConsumedInstallAuthorization,
    observed_guild_id: &str,
    query: &InstallCallbackQuery,
    now: time::OffsetDateTime,
    actor_account_id: Uuid,
) -> Result<Uuid, BrowserFailure> {
    let verifying = VerifyingInstallation {
        transaction_id: consumed.transaction_id,
        candidate_tenant_id: Uuid::now_v7(),
        provider_guild_id: observed_guild_id,
        application_id: &state.discord_application_id,
        generation: consumed.generation,
        frozen_manifest: &consumed.frozen_manifest,
        provider_guild_hint: query.guild_id.as_deref(),
        permissions_hint: query.permissions.as_deref(),
        received_at: now,
    };
    let repair = consumed.preset == InstallPreset::GuildRepair.as_str();
    let existing_tenant = state
        .installation
        .guild_tenant_id(&state.discord_application_id, observed_guild_id)
        .await
        .map_err(|_| BrowserFailure::Unavailable)?;
    let bound_tenant = match (repair, existing_tenant) {
        (true, Some(tenant_id)) => tenant_id,
        (true, None) => return Err(BrowserFailure::Rejected),
        (false, tenant_id) => tenant_id.unwrap_or(verifying.candidate_tenant_id),
    };
    let schema_name = if repair {
        "AdmitGuildRepair"
    } else {
        "AdmitGuildInstall"
    };
    if !admit_installation_command(schema_name, actor_account_id, bound_tenant) {
        return Err(BrowserFailure::Rejected);
    }
    if repair {
        state
            .installation
            .record_repair_installation(verifying)
            .await
            .map_err(|_| BrowserFailure::Unavailable)?
            .ok_or(BrowserFailure::Rejected)
    } else {
        state
            .installation
            .record_verifying_installation(verifying)
            .await
            .map_err(|_| BrowserFailure::Unavailable)
    }
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
    let Ok(Some(session)) = authorize_browser_session(&state, session_id, now).await else {
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
    let Ok(Some(session)) = authorize_browser_session(&state, session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    let proof_hash = opaque_secret_hash(proof);
    let Ok(csrf_matches) = state
        .identity
        .active_session_csrf_matches(session_id, &proof_hash, now)
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if !csrf_matches {
        return StatusCode::FORBIDDEN.into_response();
    }
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
    if state
        .identity
        .revoke_session(session_id, now)
        .await
        .is_err()
    {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    if let Err(error) = state
        .identity
        .record_audit_event(AuditFact {
            outcome: "session_revoked",
            reason_code: "logout",
            account_id: Some(session.account_id),
            session_id: Some(session_id),
            subject_ref: None,
            occurred_at: now,
        })
        .await
    {
        error!(%error, "session revocation was not audited");
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

fn presentation_guilds(guilds: Vec<DiscordGuildObservation>) -> Vec<DiscordGuildObservation> {
    guilds
        .into_iter()
        .filter(|guild| has_live_guild_install_authority(guild.owner, &guild.permissions))
        .collect()
}

async fn authorize_browser_session(
    state: &AppState,
    session_id: Uuid,
    now: time::OffsetDateTime,
) -> Result<Option<ActiveAuthorizationSession>, sqlx::Error> {
    let session = state.identity.authorize_session(session_id, now).await?;
    if session.is_none() {
        record_observed_session_expiry(state, session_id, now).await;
    }
    Ok(session)
}

async fn record_observed_session_expiry(
    state: &AppState,
    session_id: Uuid,
    now: time::OffsetDateTime,
) {
    let Ok(Some(outcome)) = state
        .identity
        .observed_session_expiry(session_id, now)
        .await
    else {
        return;
    };
    let outcome = match outcome.as_str() {
        "session_idle_expired" => "session_idle_expired",
        "session_absolute_expired" => "session_absolute_expired",
        _ => return,
    };
    if let Err(error) = state
        .identity
        .record_audit_event(AuditFact {
            outcome,
            reason_code: "session_deadline",
            account_id: None,
            session_id: Some(session_id),
            subject_ref: None,
            occurred_at: now,
        })
        .await
    {
        warn!(error = %error, "session expiry was not audited");
    }
}

fn session_status(status: StatusCode) -> Response {
    if status == StatusCode::UNAUTHORIZED {
        clear_session_response(status)
    } else {
        status.into_response()
    }
}

async fn guilds(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(session_id) = session_id(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(Some(session)) = authorize_browser_session(&state, session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    let discovered = match live_user_guilds(&state, &session).await {
        Ok(guilds) => presentation_guilds(guilds),
        Err(status) => return session_status(status),
    };
    let Ok(expires_at) = persist_discovery(&state, session.account_id, &discovered, now).await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let provider_guild_ids = discovered
        .iter()
        .map(|guild| guild.id.clone())
        .collect::<Vec<_>>();
    let Ok(summaries) = state
        .query
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
    let Ok(Some(session)) = authorize_browser_session(&state, session_id, now).await else {
        return clear_session_response(StatusCode::UNAUTHORIZED);
    };
    if let Err(status) = ensure_fresh_discovery(&state, &session, now).await {
        return session_status(status);
    }
    let Ok(provider_guild_ids) = state
        .identity
        .fresh_discovered_guild_ids(session.account_id, now)
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(Some(shell)) = state
        .query
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
    let guilds = match live_user_guilds(&state, &session).await {
        Ok(guilds) => guilds,
        Err(status) => return session_status(status),
    };
    let Some(guild) = guilds.iter().find(|guild| guild.id == guild_id) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if !has_live_guild_install_authority(guild.owner, &guild.permissions) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let bound_tenant = match state
        .installation
        .guild_tenant_id(&state.discord_application_id, &guild_id)
        .await
    {
        Ok(tenant_id) => tenant_id.unwrap_or_else(Uuid::now_v7),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    if !admit_installation_command("AdmitGuildInstall", session.account_id, bound_tenant) {
        return StatusCode::CONFLICT.into_response();
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
    let Ok(frozen_manifest) = serde_json::to_value(SafetyManifest::default()) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if state
        .installation
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
            occurred_at: time::OffsetDateTime::from(state.clock.now()),
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
    if let Err(status) = ensure_fresh_discovery(&state, &session, now).await {
        return session_status(status);
    }
    let Ok(provider_guild_ids) = state
        .identity
        .fresh_discovered_guild_ids(session.account_id, now)
        .await
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(Some(shell)) = state
        .query
        .guild_shell_for_provider_guilds(tenant_id, &provider_guild_ids)
        .await
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if shell.installation_state != "Degraded" && shell.installation_state != "Removed" {
        return StatusCode::CONFLICT.into_response();
    }
    if !admit_installation_command("AdmitGuildRepair", session.account_id, tenant_id) {
        return StatusCode::CONFLICT.into_response();
    }
    let Ok(missing) = state.installation.missing_capability_keys(tenant_id).await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if missing.is_empty() {
        return StatusCode::CONFLICT.into_response();
    }
    let Some(provider_guild_id) = shell.provider_guild_id else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let guilds = match live_user_guilds(&state, &session).await {
        Ok(guilds) => guilds,
        Err(status) => return session_status(status),
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
    if let Err(status) = persist_install_authorization(
        &state,
        handoff,
        session.account_id,
        session_id,
        now,
        InstallPreset::GuildRepair.as_str(),
    )
    .await
    {
        return status.into_response();
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

fn admit_installation_command(schema_name: &str, actor_account_id: Uuid, tenant_id: Uuid) -> bool {
    let now = time::OffsetDateTime::now_utc();
    let Some(deadline) = now.checked_add(time::Duration::minutes(10)) else {
        return false;
    };
    let Ok(deadline_at) = deadline.format(&time::format_description::well_known::Rfc3339) else {
        return false;
    };
    let correlation_id = Uuid::now_v7();
    let command = tobot_envelope::CommandEnvelope {
        command_id: Uuid::now_v7(),
        schema_name: schema_name.to_owned(),
        schema_version: 1,
        schema_family: None,
        actor_account_id,
        tenant_id,
        idempotency_key: Uuid::now_v7(),
        deadline_at,
        correlation_id,
        trace_context: tobot_envelope::TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: serde_json::json!({}),
    };
    let Ok(raw) = serde_json::to_vec(&command) else {
        return false;
    };
    let Ok(parsed) = tobot_envelope::CommandEnvelope::parse_s0(&raw) else {
        return false;
    };
    parsed.command.schema_name == schema_name
        && parsed.command.admit(tenant_id, false) == tobot_envelope::CommandAdmission::Admit
}

async fn persist_install_authorization(
    state: &AppState,
    handoff: &GuildInstallAuthorization,
    account_id: Uuid,
    session_id: Uuid,
    occurred_at: time::OffsetDateTime,
    preset: &str,
) -> Result<(), StatusCode> {
    let verifier_context = format!("tobot:guild-install-pkce:{}", handoff.id);
    let verifier_ciphertext = state
        .secret_store
        .encrypt(
            handoff.code_verifier.as_bytes(),
            verifier_context.as_bytes(),
        )
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let frozen_manifest = serde_json::to_value(SafetyManifest::default())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    state
        .installation
        .create_guild_install_authorization(NewInstallAuthorization {
            transaction_id: handoff.id,
            state_hash: &oauth_state_hash(&handoff.state),
            verifier_ciphertext: verifier_ciphertext.as_bytes(),
            account_id,
            session_id,
            provider_guild_id: &handoff.provider_guild_id,
            redirect_uri: &handoff.redirect_uri,
            requested_scopes: &handoff.scopes,
            frozen_manifest: &frozen_manifest,
            expires_at: time::OffsetDateTime::from(handoff.expires_at),
            occurred_at,
            preset,
        })
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(())
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
    let session = authorize_browser_session(state, session_id, now)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let proof_hash = opaque_secret_hash(proof);
    let csrf_matches = state
        .identity
        .active_session_csrf_matches(session_id, &proof_hash, now)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    if !csrf_matches {
        return Err(StatusCode::FORBIDDEN);
    }
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

async fn ensure_fresh_discovery(
    state: &AppState,
    session: &ActiveAuthorizationSession,
    now: time::OffsetDateTime,
) -> Result<(), StatusCode> {
    let fresh = state
        .identity
        .discovery_snapshot_fresh(session.account_id, now)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    if fresh {
        return Ok(());
    }
    let guilds = presentation_guilds(live_user_guilds(state, session).await?);
    persist_discovery(state, session.account_id, &guilds, now).await?;
    Ok(())
}

async fn persist_discovery(
    state: &AppState,
    account_id: Uuid,
    guilds: &[DiscordGuildObservation],
    now: time::OffsetDateTime,
) -> Result<time::OffsetDateTime, StatusCode> {
    let expires_at = now + time::Duration::minutes(15);
    let records = guilds
        .iter()
        .map(|guild| GuildDiscoveryObservation {
            provider_guild_id: &guild.id,
            guild_name: &guild.name,
            icon_hash: guild.icon.as_deref(),
            owner_hint: guild.owner,
            permissions_hint: &guild.permissions,
        })
        .collect::<Vec<_>>();
    state
        .identity
        .replace_guild_discovery(account_id, &records, now, expires_at)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(expires_at)
}

async fn live_user_guilds(
    state: &AppState,
    session: &ActiveAuthorizationSession,
) -> Result<Vec<DiscordGuildObservation>, StatusCode> {
    let now = time::OffsetDateTime::from(state.clock.now());
    let (access_token, refreshed) = if session.credential_expires_at <= now {
        (refresh_discord_credential(state, session).await?, true)
    } else {
        (decrypt_access_token(state, session).await?, false)
    };
    match state.discord_oauth.current_user_guilds(&access_token).await {
        Ok(guilds) => Ok(guilds),
        Err(TransportError::Rejected { status: 401 }) if !refreshed => {
            let access_token = refresh_discord_credential(state, session).await?;
            match state.discord_oauth.current_user_guilds(&access_token).await {
                Ok(guilds) => Ok(guilds),
                Err(TransportError::Rejected { status: 401 }) => Err(StatusCode::UNAUTHORIZED),
                Err(_) => Err(StatusCode::BAD_GATEWAY),
            }
        }
        Err(TransportError::Rejected { status: 401 }) => Err(StatusCode::UNAUTHORIZED),
        Err(_) => Err(StatusCode::BAD_GATEWAY),
    }
}

async fn refresh_discord_credential(
    state: &AppState,
    session: &ActiveAuthorizationSession,
) -> Result<String, StatusCode> {
    let context = format!("tobot:discord-oauth:{}", session.credential_id);
    let refresh_token = decrypt_secret(state, &session.refresh_token_ciphertext, &context).await?;
    let tokens = match state
        .discord_oauth
        .refresh_access_token(&refresh_token)
        .await
    {
        Ok(tokens) => tokens,
        Err(TransportError::Rejected { status: 400 | 401 }) => {
            return Err(StatusCode::UNAUTHORIZED);
        }
        Err(_) => return Err(StatusCode::BAD_GATEWAY),
    };
    let access_ciphertext = state
        .secret_store
        .encrypt(tokens.access_token.as_bytes(), context.as_bytes())
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let refresh_ciphertext = state
        .secret_store
        .encrypt(tokens.refresh_token.as_bytes(), context.as_bytes())
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let expires_in = i64::try_from(tokens.expires_in_seconds).unwrap_or(i64::MAX);
    let expires_at =
        time::OffsetDateTime::from(state.clock.now()) + time::Duration::seconds(expires_in);
    let updated = state
        .identity
        .refresh_oauth_credential(
            session.credential_id,
            access_ciphertext.as_bytes(),
            refresh_ciphertext.as_bytes(),
            expires_at,
        )
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    if updated {
        Ok(tokens.access_token)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

async fn decrypt_access_token(
    state: &AppState,
    session: &ActiveAuthorizationSession,
) -> Result<String, StatusCode> {
    let context = format!("tobot:discord-oauth:{}", session.credential_id);
    decrypt_secret(state, &session.access_token_ciphertext, &context).await
}

async fn decrypt_secret(
    state: &AppState,
    ciphertext: &[u8],
    context: &str,
) -> Result<String, StatusCode> {
    let ciphertext =
        std::str::from_utf8(ciphertext).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
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
    let database_ready = state.identity.ping().await.is_ok();
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
        .append_pair("code_challenge_method", pkce_s256());
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
        BrowserFailure, DiscordGuildObservation, GuildShellSummary, admit_installation_command,
        discovery_response_items, guilds_absent_from_snapshot, install_error_path,
        login_error_path, presentation_guilds,
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
    fn ready_snapshot_marks_only_missing_installed_guilds() {
        let installed = vec!["111".to_owned(), "222".to_owned()];
        let present = vec!["222".to_owned(), "333".to_owned()];
        assert_eq!(
            guilds_absent_from_snapshot(&installed, &present),
            vec!["111"]
        );
        assert!(guilds_absent_from_snapshot(&installed, &installed).is_empty());
    }

    #[test]
    fn installation_command_binds_the_actor_and_tenant() {
        let tenant = Uuid::now_v7();
        let actor = Uuid::now_v7();
        assert!(admit_installation_command(
            "AdmitGuildInstall",
            actor,
            tenant
        ));
        assert!(admit_installation_command(
            "AdmitGuildRepair",
            actor,
            tenant
        ));
        assert!(!admit_installation_command(
            "AdmitGuildInstall",
            Uuid::nil(),
            tenant
        ));
        assert!(!admit_installation_command(
            "GuildInstallRequested",
            actor,
            tenant
        ));
    }

    #[test]
    fn discovery_lists_only_guilds_that_can_add_the_application() {
        let mut manager = guild("2", "Manager");
        manager.permissions = "32".to_owned();
        let mut admin = guild("3", "Admin");
        admin.permissions = "8".to_owned();
        let mut owner = guild("4", "Owner");
        owner.owner = true;
        let listed = presentation_guilds(vec![guild("1", "Member"), manager, admin, owner]);
        let ids = listed
            .iter()
            .map(|guild| guild.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, ["2", "3", "4"]);
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
