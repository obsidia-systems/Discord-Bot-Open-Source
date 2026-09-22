//! Receipts that only exist once PostgreSQL applies the lease and consumption
//! predicates. A missing `TOBOT_TEST_DATABASE_URL` skips the proof locally;
//! CI sets `TOBOT_REQUIRE_POSTGRES` so a missing URL fails the job.

use std::env;

use time::{Duration, OffsetDateTime};
use tobot_core::{TenantContext, TenantId, TenantType};
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_persistence::{ClaimedOutboxEntry, NewDiscordAuthorization, NewOAuthTransaction, Store};
use uuid::Uuid;

#[tokio::test]
async fn killed_edge_relay_is_reclaimed_only_after_the_lease_expires() -> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let context = TenantContext {
        tenant_id: TenantId::new(),
        tenant_type: TenantType::Guild,
    };
    let event = interaction_accepted(context.tenant_id);
    accept_once(&store, context, &event).await?;

    let now = OffsetDateTime::now_utc();
    let killed_owner = Uuid::now_v7();
    let first = claim_event(
        &store,
        &event,
        now,
        killed_owner,
        "claimed batch did not include the new edge receipt",
    )
    .await?;
    reject_live_lease(&store, &event, &first, now).await?;
    reclaim_after_expiry(&store, &event, killed_owner, first.fencing_token, now).await
}

async fn accept_once(
    store: &Store,
    context: TenantContext,
    event: &EventEnvelope,
) -> Result<(), String> {
    let raw = serde_json::to_vec(event).map_err(|error| error.to_string())?;
    let inserted = store
        .accept_edge_event(context, event, &raw)
        .await
        .map_err(|error| error.to_string())?;
    if !inserted {
        return Err("first edge acceptance did not persist a receipt".to_owned());
    }
    let duplicate = store
        .accept_edge_event(context, event, &raw)
        .await
        .map_err(|error| error.to_string())?;
    if duplicate {
        return Err("duplicate edge acceptance published another outbox row".to_owned());
    }
    Ok(())
}

async fn claim_event(
    store: &Store,
    event: &EventEnvelope,
    now: OffsetDateTime,
    owner: Uuid,
    missing: &str,
) -> Result<ClaimedOutboxEntry, String> {
    let claimed = store
        .claim_edge_outbox(now, now + Duration::seconds(15), owner, 20)
        .await
        .map_err(|error| error.to_string())?;
    claimed
        .into_iter()
        .find(|entry| entry.event_id == event.event_id)
        .ok_or_else(|| missing.to_owned())
}

async fn reject_live_lease(
    store: &Store,
    event: &EventEnvelope,
    held: &ClaimedOutboxEntry,
    now: OffsetDateTime,
) -> Result<(), String> {
    let during_lease = store
        .claim_edge_outbox(
            now + Duration::seconds(1),
            now + Duration::seconds(16),
            Uuid::now_v7(),
            20,
        )
        .await
        .map_err(|error| error.to_string())?;
    if during_lease
        .iter()
        .any(|entry| entry.event_id == event.event_id)
    {
        return Err("a live lease was claimed by another relay".to_owned());
    }
    let stale_receipt = store
        .mark_edge_outbox_published(held.outbox_id, Uuid::now_v7(), held.fencing_token, now)
        .await
        .map_err(|error| error.to_string())?;
    if stale_receipt {
        return Err("a relay without the lease recorded publication".to_owned());
    }
    Ok(())
}

async fn reclaim_after_expiry(
    store: &Store,
    event: &EventEnvelope,
    killed_owner: Uuid,
    previous_fence: i64,
    now: OffsetDateTime,
) -> Result<(), String> {
    let recovered_at = now + Duration::seconds(16);
    let recovered_owner = Uuid::now_v7();
    let second = claim_event(
        store,
        event,
        recovered_at,
        recovered_owner,
        "expired lease was not reclaimed",
    )
    .await?;
    if second.fencing_token <= previous_fence {
        return Err("reclaim did not advance the fencing token".to_owned());
    }
    let killed_owner_after_takeover = store
        .mark_edge_outbox_published(
            second.outbox_id,
            killed_owner,
            second.fencing_token,
            recovered_at,
        )
        .await
        .map_err(|error| error.to_string())?;
    if killed_owner_after_takeover {
        return Err("the killed relay published after its lease was taken".to_owned());
    }
    let published = store
        .mark_edge_outbox_published(
            second.outbox_id,
            recovered_owner,
            second.fencing_token,
            recovered_at,
        )
        .await
        .map_err(|error| error.to_string())?;
    if !published {
        return Err("the recovered relay did not record publication".to_owned());
    }
    let after_publish = store
        .claim_edge_outbox(
            recovered_at + Duration::seconds(1),
            recovered_at + Duration::seconds(16),
            Uuid::now_v7(),
            20,
        )
        .await
        .map_err(|error| error.to_string())?;
    if after_publish
        .iter()
        .any(|entry| entry.event_id == event.event_id)
    {
        return Err("a published receipt was claimed again".to_owned());
    }
    Ok(())
}

#[tokio::test]
async fn oauth_replay_and_revoked_session_fail_closed_in_postgres() -> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let state_hash = Uuid::now_v7().as_bytes().to_vec();
    let scopes = vec!["identify".to_owned(), "guilds".to_owned()];
    store
        .create_oauth_transaction(NewOAuthTransaction {
            transaction_id: Uuid::now_v7(),
            state_hash: &state_hash,
            verifier_ciphertext: b"ciphertext-not-a-verifier",
            redirect_uri: "https://dash.tobot.test/auth/discord/callback",
            requested_scopes: &scopes,
            expires_at: now + Duration::minutes(10),
        })
        .await
        .map_err(|error| error.to_string())?;
    let consumed = store
        .consume_oauth_transaction(&state_hash, now)
        .await
        .map_err(|error| error.to_string())?;
    if consumed.is_none() {
        return Err("unexpired oauth state was not consumed".to_owned());
    }
    let replay = store
        .consume_oauth_transaction(&state_hash, now + Duration::seconds(1))
        .await
        .map_err(|error| error.to_string())?;
    if replay.is_some() {
        return Err("consumed oauth state was replayed".to_owned());
    }

    let expired_hash = Uuid::now_v7().as_bytes().to_vec();
    store
        .create_oauth_transaction(NewOAuthTransaction {
            transaction_id: Uuid::now_v7(),
            state_hash: &expired_hash,
            verifier_ciphertext: b"ciphertext-not-a-verifier",
            redirect_uri: "https://dash.tobot.test/auth/discord/callback",
            requested_scopes: &scopes,
            expires_at: now - Duration::seconds(1),
        })
        .await
        .map_err(|error| error.to_string())?;
    let expired = store
        .consume_oauth_transaction(&expired_hash, now)
        .await
        .map_err(|error| error.to_string())?;
    if expired.is_some() {
        return Err("expired oauth state was consumed".to_owned());
    }

    let session_id = Uuid::now_v7();
    let scopes = vec!["identify".to_owned()];
    store
        .create_discord_authorization(NewDiscordAuthorization {
            candidate_account_id: Uuid::now_v7(),
            provider_user_id: &Uuid::now_v7().to_string(),
            username: "operator",
            display_name: None,
            credential_id: Uuid::now_v7(),
            access_token_ciphertext: b"access-ciphertext",
            refresh_token_ciphertext: b"refresh-ciphertext",
            scopes: &scopes,
            credential_expires_at: now + Duration::hours(1),
            session_id,
            csrf_secret_hash: b"csrf-hash",
            csrf_secret_ciphertext: b"csrf-ciphertext",
            idle_expires_at: now + Duration::hours(12),
            absolute_expires_at: now + Duration::days(7),
        })
        .await
        .map_err(|error| error.to_string())?;
    let authorized = store
        .authorize_session(session_id, now)
        .await
        .map_err(|error| error.to_string())?;
    if authorized.is_none() {
        return Err("a live session was not authorized".to_owned());
    }
    store
        .revoke_session(session_id, now + Duration::seconds(1))
        .await
        .map_err(|error| error.to_string())?;
    let revoked = store
        .authorize_session(session_id, now + Duration::seconds(2))
        .await
        .map_err(|error| error.to_string())?;
    if revoked.is_some() {
        return Err("a revoked session stayed authorized".to_owned());
    }
    Ok(())
}

async fn connect() -> Result<Option<Store>, String> {
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
    let store = Store::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    store.migrate().await.map_err(|error| error.to_string())?;
    Ok(Some(store))
}

fn interaction_accepted(tenant_id: TenantId) -> EventEnvelope {
    let event_id = Uuid::now_v7();
    EventEnvelope {
        event_id,
        schema_name: "InteractionAccepted".to_owned(),
        schema_version: 1,
        occurred_at: "2026-09-22T08:20:18Z".to_owned(),
        received_at: "2026-09-22T08:20:18Z".to_owned(),
        application_id: "app".to_owned(),
        tenant_id: Some(tenant_id.as_uuid()),
        guild_id: None,
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id: event_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: event_id.to_string(),
            span_id: event_id.to_string(),
        },
        payload: serde_json::json!({ "outcome": "Acknowledged" }),
    }
}
