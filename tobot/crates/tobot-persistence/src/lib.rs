//! Owner facades over one PostgreSQL database. Each facade exposes only the
//! SQL of its module. Application binaries never auto-migrate production databases.

use sqlx::PgPool;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_core::{TenantContext, TenantId};
use tobot_envelope::{EventEnvelope, TraceContext};
use uuid::Uuid;

mod edge;
mod edge_relay;
mod identity;
mod installation;
mod owners;
mod query;

pub use owners::{
    ControlPlaneDatabase, EdgeRelayStore, EdgeStore, IdentityStore, InstallationStore, Migrations,
    QueryStore,
};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Debug, sqlx::FromRow)]
pub struct RelayGauge {
    pub unpublished: i64,
    pub oldest_age_seconds: i64,
    pub max_publish_attempts: i64,
    pub expired_leases: i64,
}

pub(crate) const INSTALLATION_RELAY_GAUGE: &str = "SELECT \
     count(*) FILTER (WHERE published_at IS NULL)::bigint AS unpublished, \
     COALESCE(FLOOR(EXTRACT(EPOCH FROM ($1 - min(available_at) FILTER (WHERE published_at IS NULL)))), 0)::bigint AS oldest_age_seconds, \
     COALESCE(max(publish_attempts) FILTER (WHERE published_at IS NULL), 0)::bigint AS max_publish_attempts, \
     count(*) FILTER (WHERE published_at IS NULL AND lease_expires_at IS NOT NULL AND lease_expires_at < $1)::bigint AS expired_leases \
     FROM installation.event_outbox";

pub(crate) const EDGE_RELAY_GAUGE: &str = "SELECT \
     count(*) FILTER (WHERE published_at IS NULL)::bigint AS unpublished, \
     COALESCE(FLOOR(EXTRACT(EPOCH FROM ($1 - min(available_at) FILTER (WHERE published_at IS NULL)))), 0)::bigint AS oldest_age_seconds, \
     COALESCE(max(publish_attempts) FILTER (WHERE published_at IS NULL), 0)::bigint AS max_publish_attempts, \
     count(*) FILTER (WHERE published_at IS NULL AND lease_expires_at IS NOT NULL AND lease_expires_at < $1)::bigint AS expired_leases \
     FROM edge.event_outbox";

#[derive(Debug, sqlx::FromRow)]
pub struct ClaimedOutboxEntry {
    pub outbox_id: Uuid,
    pub event_id: Uuid,
    pub envelope: Vec<u8>,
    pub fencing_token: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InteractionAcceptance {
    Accepted,
    Duplicate,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InteractionAcknowledgement {
    Acknowledged,
    Deferred,
}

#[derive(Debug, sqlx::FromRow)]
pub struct GatewaySessionRecord {
    pub session_id: String,
    pub sequence: i64,
    pub resume_gateway_url: String,
}

pub struct GatewayInteractionAcceptance<'a> {
    pub context: TenantContext,
    pub interaction_id: &'a str,
    pub receipt_id: Uuid,
    pub expires_at: OffsetDateTime,
    pub gateway_event: &'a EventEnvelope,
    pub gateway_raw: &'a [u8],
    pub interaction_event: &'a EventEnvelope,
    pub interaction_raw: &'a [u8],
}

pub struct NewOAuthTransaction<'a> {
    pub transaction_id: Uuid,
    pub state_hash: &'a [u8],
    pub verifier_ciphertext: &'a [u8],
    pub redirect_uri: &'a str,
    pub requested_scopes: &'a [String],
    pub expires_at: OffsetDateTime,
}

#[derive(Debug, sqlx::FromRow)]
pub struct ConsumedOAuthTransaction {
    pub transaction_id: Uuid,
    pub verifier_ciphertext: Vec<u8>,
    pub redirect_uri: String,
    pub requested_scopes: Vec<String>,
}

pub struct NewDiscordAuthorization<'a> {
    pub candidate_account_id: Uuid,
    pub provider_user_id: &'a str,
    pub username: &'a str,
    pub display_name: Option<&'a str>,
    pub credential_id: Uuid,
    pub access_token_ciphertext: &'a [u8],
    pub refresh_token_ciphertext: &'a [u8],
    pub scopes: &'a [String],
    pub credential_expires_at: OffsetDateTime,
    pub session_id: Uuid,
    pub csrf_secret_hash: &'a [u8],
    pub csrf_secret_ciphertext: &'a [u8],
    pub idle_expires_at: OffsetDateTime,
    pub absolute_expires_at: OffsetDateTime,
}

#[derive(Debug)]
pub struct CreatedAuthorization {
    pub account_id: Uuid,
    pub credential_generation: i64,
}

#[derive(Debug, sqlx::FromRow)]
pub struct ActiveAuthorizationSession {
    pub account_id: Uuid,
    pub credential_id: Uuid,
    pub access_token_ciphertext: Vec<u8>,
    pub refresh_token_ciphertext: Vec<u8>,
    pub credential_expires_at: OffsetDateTime,
    pub csrf_secret_ciphertext: Vec<u8>,
    pub idle_expires_at: OffsetDateTime,
    pub absolute_expires_at: OffsetDateTime,
}

pub struct GuildDiscoveryObservation<'a> {
    pub provider_guild_id: &'a str,
    pub guild_name: &'a str,
    pub icon_hash: Option<&'a str>,
    pub owner_hint: bool,
    pub permissions_hint: &'a str,
}

pub struct NewInstallAuthorization<'a> {
    pub transaction_id: Uuid,
    pub state_hash: &'a [u8],
    pub verifier_ciphertext: &'a [u8],
    pub account_id: Uuid,
    pub session_id: Uuid,
    pub provider_guild_id: &'a str,
    pub redirect_uri: &'a str,
    pub requested_scopes: &'a [String],
    pub frozen_manifest: &'a serde_json::Value,
    pub expires_at: OffsetDateTime,
    pub occurred_at: OffsetDateTime,
    pub preset: &'a str,
}

pub struct AuditFact<'a> {
    pub outcome: &'a str,
    pub reason_code: &'a str,
    pub account_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
    pub subject_ref: Option<&'a str>,
    pub occurred_at: OffsetDateTime,
}

#[derive(Debug, sqlx::FromRow)]
pub struct ConsumedInstallAuthorization {
    pub transaction_id: Uuid,
    pub provider_guild_id: String,
    pub generation: i64,
    pub verifier_ciphertext: Vec<u8>,
    pub redirect_uri: String,
    pub requested_scopes: Vec<String>,
    pub frozen_manifest: serde_json::Value,
    pub preset: String,
}

pub struct VerifyingInstallation<'a> {
    pub transaction_id: Uuid,
    pub candidate_tenant_id: Uuid,
    pub provider_guild_id: &'a str,
    pub application_id: &'a str,
    pub generation: i64,
    pub frozen_manifest: &'a serde_json::Value,
    pub provider_guild_hint: Option<&'a str>,
    pub permissions_hint: Option<&'a str>,
    pub received_at: OffsetDateTime,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct ClaimedInstallationVerification {
    pub installation_id: Uuid,
    pub tenant_id: Uuid,
    pub provider_guild_id: String,
    pub application_id: String,
    pub generation: i64,
    pub fencing_token: i64,
}

#[derive(Debug, sqlx::FromRow)]
pub struct GuildShellSummary {
    pub tenant_id: Uuid,
    pub provider_guild_id: Option<String>,
    pub installation_state: String,
    pub health_state: String,
    pub projection_watermark: OffsetDateTime,
}

#[derive(Debug, sqlx::FromRow)]
pub struct GuildShellProjection {
    pub tenant_id: Uuid,
    pub provider_guild_id: Option<String>,
    pub installation_state: String,
    pub health_state: String,
    pub installation_generation: Option<i64>,
    pub capabilities: serde_json::Value,
    pub projection_watermark: OffsetDateTime,
    pub probe_state: String,
}

pub(crate) struct InstallationStateEvent<'a> {
    tenant_id: Uuid,
    provider_guild_id: &'a str,
    application_id: &'a str,
    generation: i64,
    state: &'a str,
    capabilities: serde_json::Value,
    occurred_at: OffsetDateTime,
}

pub(crate) async fn relay_gauge(
    pool: &PgPool,
    statement: &'static str,
    now: OffsetDateTime,
) -> Result<RelayGauge, sqlx::Error> {
    sqlx::query_as(statement).bind(now).fetch_one(pool).await
}

pub(crate) async fn renew_outbox_lease(
    pool: &PgPool,
    statement: &'static str,
    lease_token: Uuid,
    lease_until: OffsetDateTime,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(statement)
        .bind(lease_token)
        .bind(lease_until)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

pub(crate) async fn insert_audit_event(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    fact: AuditFact<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO identity.audit_event \
         (audit_id, occurred_at, account_id, session_id, outcome, reason_code, subject_ref) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::now_v7())
    .bind(fact.occurred_at)
    .bind(fact.account_id)
    .bind(fact.session_id)
    .bind(fact.outcome)
    .bind(fact.reason_code)
    .bind(fact.subject_ref)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub(crate) async fn lock_latest_installation(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    provider_guild_id: &str,
    application_id: &str,
) -> Result<Option<(Uuid, Uuid, i64)>, sqlx::Error> {
    let latest: Option<(Uuid, Uuid, i64, String)> = sqlx::query_as(
        "SELECT install.installation_id, install.tenant_id, install.generation, install.state \
         FROM installation.installation AS install \
         JOIN installation.tenant AS tenant ON tenant.tenant_id = install.tenant_id \
         WHERE tenant.tenant_type = 'Guild' \
           AND tenant.provider_tenant_ref = $1 \
           AND tenant.application_id = $2 \
         ORDER BY install.generation DESC \
         LIMIT 1 \
         FOR UPDATE OF install",
    )
    .bind(provider_guild_id)
    .bind(application_id)
    .fetch_optional(&mut **transaction)
    .await?;
    let Some((installation_id, tenant_id, generation, state)) = latest else {
        return Ok(None);
    };
    if state != "Installed" {
        return Ok(None);
    }
    let updated = sqlx::query(
        "UPDATE installation.installation SET state = 'Removed' \
         WHERE installation_id = $1 AND state = 'Installed'",
    )
    .bind(installation_id)
    .execute(&mut **transaction)
    .await?
    .rows_affected();
    if updated == 1 {
        Ok(Some((installation_id, tenant_id, generation)))
    } else {
        Ok(None)
    }
}

pub(crate) async fn mark_bot_presence_absent(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    installation_id: Uuid,
    observed_at: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO installation.module_capability \
         (installation_id, module_key, capability_key, health_state, reason_code, observed_at) \
         VALUES ($1, 'platform_probe', 'bot_presence', 'Degraded', \
                 'bot_guild_presence_absent', $2) \
         ON CONFLICT (installation_id, module_key, capability_key) DO UPDATE SET \
           health_state = EXCLUDED.health_state, reason_code = EXCLUDED.reason_code, \
           observed_at = EXCLUDED.observed_at",
    )
    .bind(installation_id)
    .bind(observed_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub(crate) async fn revoke_other_sessions(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    account_id: Uuid,
    session_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE identity.authorization_session \
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) \
         WHERE account_id = $1 AND session_id <> $2 AND revoked_at IS NULL",
    )
    .bind(account_id)
    .bind(session_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub(crate) async fn missing_capability_allows_repair(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    next_generation: i64,
) -> Result<bool, sqlx::Error> {
    let latest: Option<(Uuid, i64, String)> = sqlx::query_as(
        "SELECT installation_id, generation, state FROM installation.installation \
         WHERE tenant_id = $1 ORDER BY generation DESC LIMIT 1 FOR UPDATE",
    )
    .bind(tenant_id)
    .fetch_optional(&mut **transaction)
    .await?;
    let Some((installation_id, generation, state)) = latest else {
        return Ok(false);
    };
    if (state != "Degraded" && state != "Removed") || next_generation <= generation {
        return Ok(false);
    }
    let missing: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM installation.module_capability \
         WHERE installation_id = $1 AND health_state <> 'Healthy'",
    )
    .bind(installation_id)
    .fetch_one(&mut **transaction)
    .await?;
    Ok(missing > 0)
}

pub(crate) async fn insert_installation_state_event(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    request: InstallationStateEvent<'_>,
) -> Result<(), sqlx::Error> {
    let event_id = Uuid::now_v7();
    let correlation_id = Uuid::now_v7();
    let timestamp = request
        .occurred_at
        .format(&Rfc3339)
        .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
    let event = EventEnvelope {
        event_id,
        schema_name: "InstallationStateChanged".to_owned(),
        schema_version: 1,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id: request.application_id.to_owned(),
        tenant_id: Some(request.tenant_id),
        guild_id: Some(request.provider_guild_id.to_owned()),
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: serde_json::json!({
            "generation": request.generation,
            "state": request.state,
            "capabilities": request.capabilities
        }),
    };
    let raw =
        serde_json::to_vec(&event).map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
    sqlx::query(
        "INSERT INTO installation.event_outbox \
         (outbox_id, tenant_id, event_id, topic, partition_key, envelope) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(request.tenant_id)
    .bind(event_id)
    .bind(&event.schema_name)
    .bind(request.tenant_id)
    .bind(raw)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

/// Converts a persisted opaque tenant id only after a caller already has a
/// server-authenticated context. Bare database identifiers are never exposed
/// as an authorization API.
#[must_use]
pub fn bound_tenant_id(context: TenantContext) -> TenantId {
    context.tenant_id
}
