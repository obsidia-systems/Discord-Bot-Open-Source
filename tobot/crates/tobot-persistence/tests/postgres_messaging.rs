//! S2 proofs use only a disposable database named `tobot_test`.

use std::env;
use time::{Duration, OffsetDateTime};
use tobot_persistence::{
    DeliveryIntentStore, JoinDecision, LifecycleStore, MessagingOutbox, Migrations, NewJoin,
    QueryStore,
};
use uuid::Uuid;

static TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn fixture() -> Result<
    Option<(
        LifecycleStore,
        DeliveryIntentStore,
        sqlx::PgPool,
        Uuid,
        String,
    )>,
    String,
> {
    let Ok(url) = env::var("TOBOT_TEST_DATABASE_URL") else {
        if env::var("TOBOT_REQUIRE_POSTGRES").is_ok() {
            return Err("TOBOT_TEST_DATABASE_URL is required".to_owned());
        }
        return Ok(None);
    };
    if url
        .split('?')
        .next()
        .and_then(|path| path.rsplit('/').next())
        != Some("tobot_test")
    {
        return Err("refusing to use a database other than tobot_test".to_owned());
    }
    Migrations::connect(&url)
        .await
        .map_err(|e| e.to_string())?
        .migrate()
        .await
        .map_err(|e| e.to_string())?;
    let pool = sqlx::PgPool::connect(&url)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("TRUNCATE delivery.message_attempt, delivery.message_intent, delivery.event_outbox, lifecycle.join_decision, lifecycle.welcome_revision, lifecycle.event_outbox")
        .execute(&pool).await.map_err(|e| e.to_string())?;
    let tenant = Uuid::now_v7();
    let guild = format!("{}", Uuid::now_v7().as_u128());
    sqlx::query("INSERT INTO installation.tenant (tenant_id,tenant_type,provider_tenant_ref,application_id,state) VALUES ($1,'Guild',$2,'app','Active')")
        .bind(tenant).bind(&guild).execute(&pool).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO installation.installation (installation_id,tenant_id,generation,state,manifest) VALUES ($1,$2,1,'Installed','{}'::jsonb)")
        .bind(Uuid::now_v7()).bind(tenant).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(Some((
        LifecycleStore::connect(&url)
            .await
            .map_err(|e| e.to_string())?,
        DeliveryIntentStore::connect(&url)
            .await
            .map_err(|e| e.to_string())?,
        pool,
        tenant,
        guild,
    )))
}

#[tokio::test]
async fn revision_is_immutable_and_bot_join_is_suppressed() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((life, delivery, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let first = life
        .publish_welcome(tenant, &guild, "123", "Hello {member}", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let join = NewJoin {
        tenant_id: tenant,
        guild_id: &guild,
        member_id: "456",
        joined_at: now,
        is_bot: false,
        application_id: "app",
    };
    let JoinDecision::Requested { revision, key } = life
        .reserve_join(&join, now)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Err("human join was suppressed".to_owned());
    };
    let intent = delivery
        .create_intent(&revision, "456", &key, "app", now)
        .await
        .map_err(|e| e.to_string())?;
    life.publish_welcome(
        tenant,
        &guild,
        "789",
        "New message",
        "app",
        now + Duration::seconds(1),
    )
    .await
    .map_err(|e| e.to_string())?;
    let stored: (String, String) =
        sqlx::query_as("SELECT body,state FROM lifecycle.welcome_revision WHERE revision_id=$1")
            .bind(first.revision_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    if stored != ("Hello {member}".to_owned(), "Superseded".to_owned())
        || intent.revision_id != first.revision_id
        || intent.content != "Hello <@456>"
    {
        return Err("in-flight intent did not keep the immutable revision".to_owned());
    }
    let bot = NewJoin {
        tenant_id: tenant,
        guild_id: &guild,
        member_id: "999",
        joined_at: now,
        is_bot: true,
        application_id: "app",
    };
    if !matches!(
        life.reserve_join(&bot, now)
            .await
            .map_err(|e| e.to_string())?,
        JoinDecision::Suppressed
    ) {
        return Err("bot join was not suppressed".to_owned());
    }
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM delivery.message_intent WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    if count != 1 {
        return Err("bot join created an intent".to_owned());
    }
    Ok(())
}

#[tokio::test]
async fn duplicate_join_claims_once_and_blocked_is_terminal() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((life, delivery, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    life.publish_welcome(tenant, &guild, "123", "Hello {member}", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let join = NewJoin {
        tenant_id: tenant,
        guild_id: &guild,
        member_id: "456",
        joined_at: now,
        is_bot: false,
        application_id: "app",
    };
    let (first, second) =
        tokio::join!(life.reserve_join(&join, now), life.reserve_join(&join, now));
    let JoinDecision::Requested { revision, key } = first.map_err(|e| e.to_string())? else {
        return Err("first join suppressed".to_owned());
    };
    let JoinDecision::Requested {
        revision: second_revision,
        key: second_key,
    } = second.map_err(|e| e.to_string())?
    else {
        return Err("second join suppressed".to_owned());
    };
    let (first_intent, second_intent) = tokio::join!(
        delivery.create_intent(&revision, "456", &key, "app", now),
        delivery.create_intent(&second_revision, "456", &second_key, "app", now)
    );
    let first_intent = first_intent.map_err(|e| e.to_string())?;
    let second_intent = second_intent.map_err(|e| e.to_string())?;
    if first_intent.intent_id != second_intent.intent_id {
        return Err("duplicate join created two intents".to_owned());
    }
    let claimed = delivery
        .claim_next(now)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "intent was not claimed".to_owned())?;
    if delivery
        .claim_next(now)
        .await
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err("two workers claimed one live intent".to_owned());
    }
    if !delivery
        .mark_sending(&claimed, now)
        .await
        .map_err(|e| e.to_string())?
    {
        return Err("claim did not enter Sending".to_owned());
    }
    delivery
        .finish(&claimed, "Blocked", None, now)
        .await
        .map_err(|e| e.to_string())?;
    if delivery
        .claim_next(now + Duration::minutes(2))
        .await
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err("Blocked was retried".to_owned());
    }
    let state: String =
        sqlx::query_scalar("SELECT status FROM delivery.message_intent WHERE intent_id=$1")
            .bind(claimed.intent_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    if state != "Blocked" {
        return Err(format!("expected Blocked, got {state}"));
    }
    Ok(())
}

#[tokio::test]
async fn uncertain_reconciles_by_nonce_or_dead_letters_without_second_claim() -> Result<(), String>
{
    let _guard = TEST_LOCK.lock().await;
    let Some((life, delivery, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let revision = life
        .publish_welcome(tenant, &guild, "123", "Hello", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let first = delivery
        .create_intent(&revision, "456", "first", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let claimed = delivery
        .claim_next(now)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "missing claim".to_owned())?;
    if first.intent_id != claimed.intent_id {
        return Err("wrong intent claimed".to_owned());
    }
    delivery
        .mark_sending(&claimed, now)
        .await
        .map_err(|e| e.to_string())?;
    delivery
        .finish(&claimed, "OutcomeUncertain", None, now)
        .await
        .map_err(|e| e.to_string())?;
    if delivery
        .claim_next(now + Duration::minutes(1))
        .await
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err("uncertain create was blindly retried".to_owned());
    }
    let matched = delivery
        .by_nonce(&claimed.nonce)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "nonce was not indexed".to_owned())?;
    delivery
        .finish(
            &matched,
            "Sent",
            Some("discord-message-1"),
            now + Duration::seconds(2),
        )
        .await
        .map_err(|e| e.to_string())?;
    let second = delivery
        .create_intent(&revision, "789", "second", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let claimed = delivery
        .claim_next(now)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "second intent missing".to_owned())?;
    if claimed.intent_id != second.intent_id {
        return Err("wrong second claim".to_owned());
    }
    delivery
        .mark_sending(&claimed, now)
        .await
        .map_err(|e| e.to_string())?;
    delivery
        .finish(&claimed, "OutcomeUncertain", None, now)
        .await
        .map_err(|e| e.to_string())?;
    let unmatched = delivery
        .by_nonce(&claimed.nonce)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "second nonce missing".to_owned())?;
    delivery
        .finish(&unmatched, "DeadLetter", None, now + Duration::seconds(61))
        .await
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT status,provider_message_id FROM delivery.message_intent WHERE tenant_id=$1 ORDER BY created_at")
        .bind(tenant).fetch_all(&pool).await.map_err(|e| e.to_string())?;
    if !rows.contains(&("Sent".to_owned(), Some("discord-message-1".to_owned())))
        || !rows.contains(&("DeadLetter".to_owned(), None))
    {
        return Err(format!("unexpected outcomes: {rows:?}"));
    }
    Ok(())
}

#[tokio::test]
async fn delivery_outbox_projects_status_and_watermark() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((life, delivery, _pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let revision = life
        .publish_welcome(tenant, &guild, "123", "Hello", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let intent = delivery
        .create_intent(&revision, "456", "projection-key", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let url = env::var("TOBOT_TEST_DATABASE_URL").map_err(|e| e.to_string())?;
    let outbox = MessagingOutbox::Delivery(delivery);
    let lease = Uuid::now_v7();
    let entries = outbox.claim(now, lease).await.map_err(|e| e.to_string())?;
    if entries.len() != 1 {
        return Err(format!("expected one delivery fact, got {}", entries.len()));
    }
    let event = tobot_envelope::EventEnvelope::parse_s0(&entries[0].envelope)
        .map_err(|e| e.to_string())?
        .event;
    let query = QueryStore::connect(&url).await.map_err(|e| e.to_string())?;
    query
        .apply_welcome_delivery(&event, &entries[0].envelope, "1-0", now)
        .await
        .map_err(|e| e.to_string())?;
    let projected = query
        .welcome_delivery(tenant)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "delivery projection missing".to_owned())?;
    if projected.intent_id != intent.intent_id
        || projected.status != "Pending"
        || projected.projection_watermark != now
    {
        return Err("delivery projection has wrong intent, status, or watermark".to_owned());
    }
    let mut sent = event.clone();
    sent.event_id = Uuid::now_v7();
    sent.schema_name = "DeliverySucceeded".to_owned();
    sent.payload["status"] = serde_json::json!("Sent");
    sent.payload["provider_message_id"] = serde_json::json!("message-123");
    sent.occurred_at = (now + Duration::seconds(1))
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|e| e.to_string())?;
    let sent_raw = serde_json::to_vec(&sent).map_err(|e| e.to_string())?;
    query
        .apply_welcome_delivery(&sent, &sent_raw, "1-1", now + Duration::seconds(1))
        .await
        .map_err(|e| e.to_string())?;
    let mut late_queue = event.clone();
    late_queue.event_id = Uuid::now_v7();
    let late_raw = serde_json::to_vec(&late_queue).map_err(|e| e.to_string())?;
    query
        .apply_welcome_delivery(&late_queue, &late_raw, "1-2", now + Duration::seconds(2))
        .await
        .map_err(|e| e.to_string())?;
    let final_status = query
        .welcome_delivery(tenant)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "delivery projection disappeared".to_owned())?;
    if final_status.status != "Sent"
        || final_status.provider_message_id.as_deref() != Some("message-123")
    {
        return Err("late queued fact regressed a sent projection".to_owned());
    }
    outbox
        .published(&entries[0], lease, now)
        .await
        .map_err(|e| e.to_string())?;
    if !outbox
        .claim(now + Duration::seconds(31), Uuid::now_v7())
        .await
        .map_err(|e| e.to_string())?
        .is_empty()
    {
        return Err("published fact was claimed again".to_owned());
    }
    Ok(())
}

#[tokio::test]
async fn claim_rotates_to_another_tenant_with_due_work() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((life, delivery, pool, first_tenant, first_guild)) = fixture().await? else {
        return Ok(());
    };
    let second_tenant = Uuid::now_v7();
    let second_guild = Uuid::now_v7().as_u128().to_string();
    sqlx::query("INSERT INTO installation.tenant (tenant_id,tenant_type,provider_tenant_ref,application_id,state) VALUES ($1,'Guild',$2,'app','Active')")
        .bind(second_tenant).bind(&second_guild).execute(&pool).await.map_err(|e| e.to_string())?;
    let now = OffsetDateTime::now_utc();
    let first = life
        .publish_welcome(first_tenant, &first_guild, "123", "Hello", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let second = life
        .publish_welcome(second_tenant, &second_guild, "123", "Hello", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    for number in 0..3 {
        delivery
            .create_intent(&first, "456", &format!("a-{number}"), "app", now)
            .await
            .map_err(|e| e.to_string())?;
    }
    delivery
        .create_intent(&second, "789", "b-0", "app", now)
        .await
        .map_err(|e| e.to_string())?;
    let first_claim = delivery
        .claim_next(now)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "first claim missing".to_owned())?;
    if first_claim.tenant_id != first_tenant {
        return Err("oldest tenant was not claimed first".to_owned());
    }
    let second_claim = delivery
        .claim_next_after(now, Some(first_tenant))
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "second claim missing".to_owned())?;
    if second_claim.tenant_id != second_tenant {
        return Err("hot tenant monopolized claim".to_owned());
    }
    Ok(())
}
