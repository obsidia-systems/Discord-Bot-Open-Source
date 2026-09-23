//! Query inbox replay and installation negatives that the domain types cannot
//! prove: a foreign session, a bound redirect, and `Installed` only after both
//! capability rows are Healthy.

use std::env;

use sqlx::postgres::PgPoolOptions;
use time::{Duration, OffsetDateTime};
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_persistence::{
    ClaimedInstallationVerification, InstallationStore, Migrations, NewInstallAuthorization,
    QueryStore, VerifyingInstallation,
};

struct Fixture {
    installation: InstallationStore,
    query: QueryStore,
    pool: sqlx::PgPool,
}
use uuid::Uuid;

#[tokio::test]
async fn restarted_projection_keeps_its_inbox_cursor() -> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let tenant_id = Uuid::now_v7();
    let guild_id = format!("guild-{tenant_id}");
    let installed = installation_event(tenant_id, &guild_id, 2, "Installed");
    let raw = serde_json::to_vec(&installed).map_err(|error| error.to_string())?;
    let first_at = OffsetDateTime::now_utc()
        .replace_nanosecond(0)
        .map_err(|error| error.to_string())?;
    store
        .query
        .apply_installation_projection(&installed, &raw, "1-0", first_at)
        .await
        .map_err(|error| error.to_string())?;
    store
        .query
        .apply_installation_projection(&installed, &raw, "1-0", first_at + Duration::minutes(5))
        .await
        .map_err(|error| error.to_string())?;
    let shell = store
        .query
        .guild_shell_for_provider_guilds(tenant_id, std::slice::from_ref(&guild_id))
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "installed shell was not projected".to_owned())?;
    if shell.projection_watermark != first_at || shell.installation_generation != Some(2) {
        return Err("replaying an inbox entry moved the projection".to_owned());
    }

    let older = installation_event(tenant_id, &guild_id, 1, "Verifying");
    let older_raw = serde_json::to_vec(&older).map_err(|error| error.to_string())?;
    store
        .query
        .apply_installation_projection(&older, &older_raw, "1-1", first_at + Duration::minutes(6))
        .await
        .map_err(|error| error.to_string())?;
    let after_older = store
        .query
        .guild_shell_for_provider_guilds(tenant_id, &[guild_id])
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "shell disappeared after an older fact".to_owned())?;
    if after_older.installation_state != "Installed"
        || after_older.installation_generation != Some(2)
    {
        return Err("an older generation replaced the installed projection".to_owned());
    }
    Ok(())
}

#[tokio::test]
async fn install_callback_rejects_a_foreign_session_and_stays_degraded_without_presence()
-> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let account_id = Uuid::now_v7();
    let session_id = Uuid::now_v7();
    let guild_id = format!("guild-{account_id}");
    let redirect_uri = "https://dash.tobot.test/install/discord/callback";
    let transaction_id = Uuid::now_v7();
    create_install(
        &store,
        transaction_id,
        account_id,
        session_id,
        &guild_id,
        redirect_uri,
        now + Duration::minutes(10),
    )
    .await?;
    let state_hash = state_hash_for(&guild_id);

    if store
        .installation
        .consume_install_authorization(&state_hash, account_id, Uuid::now_v7(), now)
        .await
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("a foreign session consumed the install".to_owned());
    }
    let consumed = store
        .installation
        .consume_install_authorization(&state_hash, account_id, session_id, now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "the bound session did not consume the install".to_owned())?;
    if consumed.redirect_uri != redirect_uri {
        return Err("consume returned a redirect other than the bound one".to_owned());
    }
    if store
        .installation
        .consume_install_authorization(&state_hash, account_id, session_id, now)
        .await
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("install state was replayed".to_owned());
    }

    let hint = "callback-hint-is-not-the-guild";
    let tenant_id = store
        .installation
        .record_verifying_installation(VerifyingInstallation {
            transaction_id: consumed.transaction_id,
            candidate_tenant_id: Uuid::now_v7(),
            provider_guild_id: &guild_id,
            application_id: "app",
            generation: consumed.generation,
            frozen_manifest: &consumed.frozen_manifest,
            provider_guild_hint: Some(hint),
            permissions_hint: Some("8"),
            received_at: now,
        })
        .await
        .map_err(|error| error.to_string())?;
    let stored_guild: String = sqlx::query_scalar(
        "SELECT provider_tenant_ref FROM installation.tenant WHERE tenant_id = $1",
    )
    .bind(tenant_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    if stored_guild != guild_id {
        return Err("the callback hint became the tenant reference".to_owned());
    }

    let claim = claim_guild(&store, &guild_id, now).await?;
    reject_stale_fence(&store, &claim, now).await?;
    store
        .installation
        .complete_installation_verification(&claim, false, now)
        .await
        .map_err(|error| error.to_string())?;
    let persisted = installation_state(&store, claim.installation_id).await?;
    if persisted != "Degraded" {
        return Err("missing bot presence became Installed".to_owned());
    }
    admit_repair(&store, account_id, session_id, &guild_id, now).await?;
    execute_repair(&store, account_id, session_id, &guild_id, tenant_id, now).await?;
    leave_installed_guild(&store, &guild_id, tenant_id, now).await?;
    let installed = verify_guild(&store, now, true).await?;
    if installed != "Installed" {
        return Err("healthy capabilities stayed below Installed".to_owned());
    }
    Ok(())
}

async fn leave_installed_guild(
    store: &Fixture,
    guild_id: &str,
    tenant_id: Uuid,
    now: OffsetDateTime,
) -> Result<(), String> {
    let installed = store
        .installation
        .installed_provider_guild_ids("app")
        .await
        .map_err(|error| error.to_string())?;
    if !installed.iter().any(|id| id == guild_id) {
        return Err("the installed guild was missing from presence reconciliation".to_owned());
    }
    if !store
        .installation
        .record_bot_departure("app", guild_id, now)
        .await
        .map_err(|error| error.to_string())?
    {
        return Err("leaving the guild left the installation Installed".to_owned());
    }
    let after = store
        .installation
        .installed_provider_guild_ids("app")
        .await
        .map_err(|error| error.to_string())?;
    if after.iter().any(|id| id == guild_id) {
        return Err("a departed guild stayed in the installed reconciliation set".to_owned());
    }
    if store
        .installation
        .record_bot_departure("app", guild_id, now + Duration::seconds(1))
        .await
        .map_err(|error| error.to_string())?
    {
        return Err("a second departure rewrote the removed installation".to_owned());
    }
    if store
        .installation
        .record_bot_departure("app", "guild-not-installed", now)
        .await
        .map_err(|error| error.to_string())?
    {
        return Err("an unknown guild was removed".to_owned());
    }
    let generation: i64 = sqlx::query_scalar(
        "SELECT generation FROM installation.installation \
         WHERE tenant_id = $1 AND state = 'Removed' \
         ORDER BY generation DESC LIMIT 1",
    )
    .bind(tenant_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    if generation != 2 {
        return Err("departure removed a generation other than the installed one".to_owned());
    }
    let raw: Vec<u8> = sqlx::query_scalar(
        "SELECT envelope FROM installation.event_outbox \
         WHERE tenant_id = $1 AND topic = 'InstallationStateChanged' \
         ORDER BY available_at DESC, outbox_id DESC LIMIT 1",
    )
    .bind(tenant_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    let event: EventEnvelope = serde_json::from_slice(&raw).map_err(|error| error.to_string())?;
    store
        .query
        .apply_installation_projection(&event, &raw, "departure-1", now)
        .await
        .map_err(|error| error.to_string())?;
    let guilds = [guild_id.to_owned()];
    let shell = store
        .query
        .guild_shell_for_provider_guilds(tenant_id, &guilds)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "departure was not projected".to_owned())?;
    if shell.installation_state != "Removed" || shell.health_state != "Removed" {
        return Err("the projected shell stayed Installed after the bot left".to_owned());
    }
    if shell.capabilities["bot_presence"] != "Degraded" {
        return Err("the projected shell hid the missing bot".to_owned());
    }
    Ok(())
}

async fn claim_guild(
    store: &Fixture,
    guild_id: &str,
    now: OffsetDateTime,
) -> Result<ClaimedInstallationVerification, String> {
    let claim = store
        .installation
        .claim_installation_verification(now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "verifying installation was not claimed".to_owned())?;
    if claim.provider_guild_id != guild_id {
        return Err("verification claim belonged to another guild".to_owned());
    }
    Ok(claim)
}

async fn reject_stale_fence(
    store: &Fixture,
    claim: &ClaimedInstallationVerification,
    now: OffsetDateTime,
) -> Result<(), String> {
    let stale = ClaimedInstallationVerification {
        fencing_token: 0,
        ..claim.clone()
    };
    if store
        .installation
        .complete_installation_verification(&stale, false, now)
        .await
        .is_ok()
    {
        return Err("a stale fencing token completed verification".to_owned());
    }
    Ok(())
}

async fn verify_guild(
    store: &Fixture,
    now: OffsetDateTime,
    bot_present: bool,
) -> Result<String, String> {
    let account_id = Uuid::now_v7();
    let session_id = Uuid::now_v7();
    let guild_id = format!("guild-{account_id}");
    let transaction_id = Uuid::now_v7();
    create_install(
        store,
        transaction_id,
        account_id,
        session_id,
        &guild_id,
        "https://dash.tobot.test/install/discord/callback",
        now + Duration::minutes(10),
    )
    .await?;
    let consumed = store
        .installation
        .consume_install_authorization(&state_hash_for(&guild_id), account_id, session_id, now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "healthy install was not consumed".to_owned())?;
    store
        .installation
        .record_verifying_installation(VerifyingInstallation {
            transaction_id,
            candidate_tenant_id: Uuid::now_v7(),
            provider_guild_id: &guild_id,
            application_id: "app",
            generation: consumed.generation,
            frozen_manifest: &consumed.frozen_manifest,
            provider_guild_hint: None,
            permissions_hint: None,
            received_at: now,
        })
        .await
        .map_err(|error| error.to_string())?;
    let claim = claim_guild(store, &guild_id, now).await?;
    store
        .installation
        .complete_installation_verification(&claim, bot_present, now)
        .await
        .map_err(|error| error.to_string())?;
    installation_state(store, claim.installation_id).await
}

async fn admit_repair(
    store: &Fixture,
    account_id: Uuid,
    session_id: Uuid,
    guild_id: &str,
    now: OffsetDateTime,
) -> Result<(), String> {
    let manifest = serde_json::json!({
        "module": "platform_probe",
        "oauth_scopes": ["applications.commands", "bot"],
        "guild_permissions": "0",
        "gateway_intents": ["GUILDS"],
        "bot_presence_required": true
    });
    let scopes = vec!["bot".to_owned(), "applications.commands".to_owned()];
    let generation = store
        .installation
        .create_guild_install_authorization(NewInstallAuthorization {
            transaction_id: Uuid::now_v7(),
            state_hash: &format!("repair-{guild_id}").into_bytes(),
            verifier_ciphertext: b"ciphertext-not-a-verifier",
            account_id,
            session_id,
            provider_guild_id: guild_id,
            redirect_uri: "https://dash.tobot.test/install/discord/callback",
            requested_scopes: &scopes,
            frozen_manifest: &manifest,
            expires_at: now + Duration::minutes(10),
            occurred_at: now,
            preset: "GuildRepair",
        })
        .await
        .map_err(|error| error.to_string())?;
    if generation != 2 {
        return Err("repair did not open the next generation".to_owned());
    }
    let (installation_state, tenant_state): (String, String) = sqlx::query_as(
        "SELECT install.state, tenant.state \
         FROM installation.installation AS install \
         JOIN installation.tenant AS tenant ON tenant.tenant_id = install.tenant_id \
         WHERE tenant.provider_tenant_ref = $1 AND install.generation = 1",
    )
    .bind(guild_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    if installation_state != "Degraded" || tenant_state != "Active" {
        return Err("repair replaced or removed the degraded installation".to_owned());
    }
    let permissions: String = sqlx::query_scalar(
        "SELECT frozen_manifest->>'guild_permissions' \
         FROM installation.authorization_transaction \
         WHERE provider_guild_id = $1 AND preset = 'GuildRepair'",
    )
    .bind(guild_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    if permissions != "0" {
        return Err("repair asked for a permission other than the S0 union".to_owned());
    }
    let (outcome, reason_code, subject_ref): (String, String, String) = sqlx::query_as(
        "SELECT outcome, reason_code, subject_ref \
         FROM identity.audit_event WHERE subject_ref = $1",
    )
    .bind(guild_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    if outcome != "repair_admitted"
        || reason_code != "guild_repair_generation"
        || subject_ref != guild_id
    {
        return Err("repair admission was not audited against the guild".to_owned());
    }
    Ok(())
}

async fn execute_repair(
    store: &Fixture,
    account_id: Uuid,
    session_id: Uuid,
    guild_id: &str,
    tenant_id: Uuid,
    now: OffsetDateTime,
) -> Result<(), String> {
    let missing = store
        .installation
        .missing_capability_keys(tenant_id)
        .await
        .map_err(|error| error.to_string())?;
    if missing != ["bot_presence"] {
        return Err("repair started without the missing bot capability".to_owned());
    }
    let state_hash = format!("repair-{guild_id}").into_bytes();
    if store
        .installation
        .consume_install_authorization(&state_hash, account_id, Uuid::now_v7(), now)
        .await
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("a foreign session consumed the repair".to_owned());
    }
    let consumed = store
        .installation
        .consume_install_authorization(&state_hash, account_id, session_id, now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "the bound session did not consume the repair".to_owned())?;
    if consumed.preset != "GuildRepair" || consumed.generation != 2 {
        return Err("repair consumption did not keep the admitted generation".to_owned());
    }
    if store
        .installation
        .consume_install_authorization(&state_hash, account_id, session_id, now)
        .await
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("repair state was replayed".to_owned());
    }
    let repaired = store
        .installation
        .record_repair_installation(VerifyingInstallation {
            transaction_id: consumed.transaction_id,
            candidate_tenant_id: Uuid::now_v7(),
            provider_guild_id: guild_id,
            application_id: "app",
            generation: consumed.generation,
            frozen_manifest: &consumed.frozen_manifest,
            provider_guild_hint: Some("callback-hint-is-not-the-guild"),
            permissions_hint: Some("8"),
            received_at: now,
        })
        .await
        .map_err(|error| error.to_string())?;
    if repaired != Some(tenant_id) {
        return Err("missing-capability repair did not open a generation".to_owned());
    }
    let claim = claim_guild(store, guild_id, now).await?;
    if claim.generation != 2 {
        return Err("verification claimed a generation other than the repair".to_owned());
    }
    store
        .installation
        .complete_installation_verification(&claim, true, now)
        .await
        .map_err(|error| error.to_string())?;
    if installation_state(store, claim.installation_id).await? != "Installed" {
        return Err("restored bot presence left the repair Degraded".to_owned());
    }
    let previous: String = sqlx::query_scalar(
        "SELECT state FROM installation.installation \
         WHERE tenant_id = $1 AND generation = 1",
    )
    .bind(tenant_id)
    .fetch_one(&store.pool)
    .await
    .map_err(|error| error.to_string())?;
    if previous != "Degraded" {
        return Err("repair replaced the previous degraded generation".to_owned());
    }
    if !store
        .installation
        .missing_capability_keys(tenant_id)
        .await
        .map_err(|error| error.to_string())?
        .is_empty()
    {
        return Err("a healthy repair still reported a missing capability".to_owned());
    }
    Ok(())
}

async fn create_install(
    store: &Fixture,
    transaction_id: Uuid,
    account_id: Uuid,
    session_id: Uuid,
    guild_id: &str,
    redirect_uri: &str,
    expires_at: OffsetDateTime,
) -> Result<(), String> {
    let scopes = vec!["bot".to_owned(), "applications.commands".to_owned()];
    let manifest = serde_json::json!({ "permissions": "0" });
    store
        .installation
        .create_guild_install_authorization(NewInstallAuthorization {
            transaction_id,
            state_hash: &state_hash_for(guild_id),
            verifier_ciphertext: b"ciphertext-not-a-verifier",
            account_id,
            session_id,
            provider_guild_id: guild_id,
            redirect_uri,
            requested_scopes: &scopes,
            frozen_manifest: &manifest,
            expires_at,
            occurred_at: expires_at,
            preset: "GuildInstall",
        })
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn installation_state(store: &Fixture, installation_id: Uuid) -> Result<String, String> {
    sqlx::query_scalar("SELECT state FROM installation.installation WHERE installation_id = $1")
        .bind(installation_id)
        .fetch_one(&store.pool)
        .await
        .map_err(|error| error.to_string())
}

fn state_hash_for(guild_id: &str) -> Vec<u8> {
    guild_id.as_bytes().to_vec()
}

fn installation_event(
    tenant_id: Uuid,
    guild_id: &str,
    generation: i64,
    state: &str,
) -> EventEnvelope {
    let event_id = Uuid::now_v7();
    EventEnvelope {
        event_id,
        schema_name: "InstallationStateChanged".to_owned(),
        schema_version: 1,
        occurred_at: "2026-09-22T08:20:18Z".to_owned(),
        received_at: "2026-09-22T08:20:18Z".to_owned(),
        application_id: "app".to_owned(),
        tenant_id: Some(tenant_id),
        guild_id: Some(guild_id.to_owned()),
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id: event_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: event_id.to_string(),
            span_id: event_id.to_string(),
        },
        payload: serde_json::json!({
            "generation": generation,
            "state": state,
            "capabilities": { "bot_presence": "Healthy" }
        }),
    }
}

async fn connect() -> Result<Option<Fixture>, String> {
    let Ok(url) = env::var("TOBOT_TEST_DATABASE_URL") else {
        if env::var("TOBOT_REQUIRE_POSTGRES").is_ok() {
            return Err("TOBOT_TEST_DATABASE_URL is required".to_owned());
        }
        return Ok(None);
    };
    let database_name = url
        .split('?')
        .next()
        .and_then(|path| path.rsplit('/').next())
        .unwrap_or("");
    if database_name != "tobot_test" {
        return Err("refusing to run receipts against a database other than tobot_test".to_owned());
    }
    let migrations = Migrations::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    migrations
        .migrate()
        .await
        .map_err(|error| error.to_string())?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    Ok(Some(Fixture {
        installation: InstallationStore::connect(&url)
            .await
            .map_err(|error| error.to_string())?,
        query: QueryStore::connect(&url)
            .await
            .map_err(|error| error.to_string())?,
        pool,
    }))
}
