//! S4 proofs use only a disposable database named `tobot_test`.

use std::env;
use time::OffsetDateTime;
use tobot_persistence::{NewTextMessage, ProgressionStore, QueryStore, XpDecision};
use uuid::Uuid;

static TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn payload(guild_id: &str, channel_id: &str, award: i64) -> serde_json::Value {
    serde_json::json!({
        "guild_id": guild_id,
        "channel_id": channel_id,
        "award": award,
        "cooldown_seconds": 0,
        "multiplier": 1
    })
}

async fn fixture() -> Result<Option<(ProgressionStore, sqlx::PgPool, Uuid, String)>, String> {
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
    tobot_persistence::Migrations::connect(&url)
        .await
        .map_err(|error| error.to_string())?
        .migrate()
        .await
        .map_err(|error| error.to_string())?;
    let pool = sqlx::PgPool::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("TRUNCATE progression.xp_ledger_entry, progression.progression_policy_revision, progression.progression_policy, progression.event_outbox")
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    let tenant = Uuid::now_v7();
    let guild = format!(
        "{}",
        (Uuid::now_v7().as_u128() % 900_000_000_000_000) + 1_000
    );
    sqlx::query("INSERT INTO installation.tenant (tenant_id,tenant_type,provider_tenant_ref,application_id,state) VALUES ($1,'Guild',$2,'app','Active')")
        .bind(tenant)
        .bind(&guild)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("INSERT INTO installation.installation (installation_id,tenant_id,generation,state,manifest) VALUES ($1,$2,1,'Installed','{}'::jsonb)")
        .bind(Uuid::now_v7())
        .bind(tenant)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    Ok(Some((
        ProgressionStore::connect(&url)
            .await
            .map_err(|error| error.to_string())?,
        pool,
        tenant,
        guild,
    )))
}

fn message<'a>(
    tenant: Uuid,
    guild: &'a str,
    channel: &'a str,
    id: &'a str,
    author: &'a str,
    bot: bool,
    webhook: bool,
) -> NewTextMessage<'a> {
    NewTextMessage {
        tenant_id: tenant,
        guild_id: guild,
        channel_id: channel,
        message_id: id,
        author_id: author,
        author_bot: bot,
        webhook,
        application_id: "app",
    }
}

#[tokio::test]
async fn duplicate_message_is_one_award_and_other_sources_write_nothing() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let ignored = store
        .record_message(&message(tenant, &guild, "9", "1", "7", false, false), now)
        .await
        .map_err(|error| error.to_string())?;
    assert!(matches!(ignored, XpDecision::Ignored));
    store
        .publish_progression(tenant, &guild, "9", &payload(&guild, "9", 10), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let other = store
        .record_message(&message(tenant, &guild, "8", "2", "7", false, false), now)
        .await
        .map_err(|error| error.to_string())?;
    assert!(matches!(other, XpDecision::Ignored));
    let bot = store
        .record_message(&message(tenant, &guild, "9", "3", "4", true, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let XpDecision::Skipped(skipped) = bot else {
        return Err("bot message was not skipped".to_owned());
    };
    assert_eq!(skipped.delta, 0);
    let first = store
        .record_message(&message(tenant, &guild, "9", "5", "7", false, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let again = store
        .record_message(&message(tenant, &guild, "9", "5", "7", false, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let XpDecision::Awarded(award) = first else {
        return Err("human message was not awarded".to_owned());
    };
    let XpDecision::Awarded(replay) = again else {
        return Err("replay was not awarded".to_owned());
    };
    assert_eq!(award.entry_id, replay.entry_id);
    assert_eq!(award.delta, 10);
    assert_eq!(award.balance_after, 10);
    assert_eq!(award.level_before, 0);
    assert_eq!(award.level_after, 1);
    let rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM progression.xp_ledger_entry WHERE tenant_id=$1 AND message_id='5'",
    )
    .bind(tenant)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(rows, 1);
    let awards: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM progression.event_outbox WHERE topic='XpAwardRecorded'",
    )
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    let rewards: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM progression.event_outbox WHERE topic='LevelRewardRequested'",
    )
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(awards, 1);
    assert_eq!(rewards, 0);
    let _query = QueryStore::connect(
        &env::var("TOBOT_TEST_DATABASE_URL").map_err(|error| error.to_string())?,
    )
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tokio::test]
async fn a_later_revision_does_not_rewrite_an_older_award() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let first = store
        .publish_progression(tenant, &guild, "9", &payload(&guild, "9", 10), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let award = store
        .record_message(&message(tenant, &guild, "9", "5", "7", false, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let XpDecision::Awarded(entry) = award else {
        return Err("first award missing".to_owned());
    };
    let second = store
        .publish_progression(tenant, &guild, "9", &payload(&guild, "9", 20), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    assert_ne!(first.revision_id, second.revision_id);
    let stored: (i32, i64) = sqlx::query_as(
        "SELECT delta, level_after FROM progression.xp_ledger_entry WHERE entry_id=$1",
    )
    .bind(entry.entry_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(stored, (10, 1));
    let next = store
        .record_message(&message(tenant, &guild, "9", "6", "7", false, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let XpDecision::Awarded(later) = next else {
        return Err("second award missing".to_owned());
    };
    assert_eq!(later.delta, 20);
    assert_eq!(later.level_before, 1);
    assert_eq!(later.level_after, 2);
    assert_eq!(later.balance_after, 30);
    let published: i32 = sqlx::query_scalar(
        "SELECT award FROM progression.progression_policy_revision WHERE revision_id=$1",
    )
    .bind(first.revision_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(published, 10);
    Ok(())
}
