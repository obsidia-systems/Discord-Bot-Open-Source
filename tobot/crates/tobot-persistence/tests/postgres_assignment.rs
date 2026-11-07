//! S3 proofs use only a disposable database named `tobot_test`.

use std::env;
use time::OffsetDateTime;
use tobot_persistence::{AssignmentStore, Migrations, NewRoleJoin, QueryStore, RoleJoin};
use uuid::Uuid;

static TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn payload(guild_id: &str, role_id: &str) -> serde_json::Value {
    serde_json::json!({
        "guild_id": guild_id,
        "role_id": role_id,
        "managed": false,
        "position": 1,
        "bot_highest_position": 5,
        "permissions": "1024",
        "delay_seconds": 0
    })
}

async fn fixture() -> Result<Option<(AssignmentStore, sqlx::PgPool, Uuid, String)>, String> {
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
        .map_err(|error| error.to_string())?
        .migrate()
        .await
        .map_err(|error| error.to_string())?;
    let pool = sqlx::PgPool::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("TRUNCATE assignment.role_assignment_attempt, assignment.role_assignment_intent, assignment.role_relation_claim, assignment.role_policy_revision, assignment.role_policy, assignment.event_outbox")
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
        AssignmentStore::connect(&url)
            .await
            .map_err(|error| error.to_string())?,
        pool,
        tenant,
        guild,
    )))
}

fn join<'a>(
    tenant: Uuid,
    guild: &'a str,
    member: &'a str,
    at: &'a str,
    bot: bool,
) -> NewRoleJoin<'a> {
    NewRoleJoin {
        tenant_id: tenant,
        guild_id: guild,
        member_id: member,
        joined_at: OffsetDateTime::parse(at, &time::format_description::well_known::Rfc3339)
            .unwrap_or_else(|error| panic!("timestamp: {error}")),
        joined_at_token: at,
        is_bot: bot,
        application_id: "app",
    }
}

#[tokio::test]
async fn revision_is_immutable_and_duplicate_join_is_one_intent() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let first = store
        .publish_role(tenant, &guild, "200", &payload(&guild, "200"), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let second = store
        .publish_role(tenant, &guild, "201", &payload(&guild, "201"), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let stored: String = sqlx::query_scalar(
        "SELECT role_id FROM assignment.role_policy_revision WHERE revision_id=$1",
    )
    .bind(first.revision_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(stored, "200");
    assert_ne!(first.revision_id, second.revision_id);
    store
        .publish_role(tenant, &guild, "200", &payload(&guild, "200"), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let at = "2026-09-23T20:00:00Z";
    let member = "300";
    let first_join = store
        .reserve_join(&join(tenant, &guild, member, at, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let second_join = store
        .reserve_join(&join(tenant, &guild, member, at, false), now)
        .await
        .map_err(|error| error.to_string())?;
    let RoleJoin::Planned { intent } = first_join else {
        return Err("human join was not planned".to_owned());
    };
    let RoleJoin::Planned { intent: again } = second_join else {
        return Err("duplicate join was not planned".to_owned());
    };
    assert_eq!(intent.intent_id, again.intent_id);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM assignment.role_assignment_intent WHERE tenant_id=$1 AND member_id=$2")
        .bind(tenant)
        .bind(member)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(count, 1);
    Ok(())
}

#[tokio::test]
async fn no_revision_writes_nothing_and_bot_or_cases_skip() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let ignored = store
        .reserve_join(
            &join(tenant, &guild, "1", "2026-09-23T20:00:00Z", false),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    assert!(matches!(ignored, RoleJoin::Ignored));
    let rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM assignment.role_assignment_intent WHERE tenant_id=$1",
    )
    .bind(tenant)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(rows, 0);
    store
        .publish_role(tenant, &guild, "200", &payload(&guild, "200"), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let bot = store
        .reserve_join(
            &join(tenant, &guild, "2", "2026-09-23T20:01:00Z", true),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    assert!(matches!(bot, RoleJoin::Skipped { .. }));
    sqlx::query("INSERT INTO assignment.role_relation_claim (claim_id,tenant_id,guild_id,member_id,role_id,source,status) VALUES ($1,$2,$3,'4','200','cases','Active')")
        .bind(Uuid::now_v7())
        .bind(tenant)
        .bind(&guild)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;
    let outranked = store
        .reserve_join(
            &join(tenant, &guild, "4", "2026-09-23T20:02:00Z", false),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    assert!(matches!(outranked, RoleJoin::Skipped { .. }));
    let puts: i64 = sqlx::query_scalar("SELECT COALESCE(sum(put_count),0) FROM assignment.role_assignment_intent WHERE tenant_id=$1")
        .bind(tenant)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(puts, 0);
    Ok(())
}

#[tokio::test]
async fn one_fence_transmits_once_and_a_read_does_not_put_again() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    store
        .publish_role(tenant, &guild, "200", &payload(&guild, "200"), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    store
        .reserve_join(
            &join(tenant, &guild, "5", "2026-09-23T20:03:00Z", false),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    let claimed = store
        .claim_next(now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("missing claim")?;
    assert!(
        store
            .claim_next(now)
            .await
            .map_err(|error| error.to_string())?
            .is_none()
    );
    let mut stale = claimed.clone();
    stale.fencing_token -= 1;
    assert!(
        !store
            .mark_transmitted(&stale, now)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        store
            .mark_transmitted(&claimed, now)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        !store
            .mark_transmitted(&claimed, now)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        store
            .finish(&claimed, "Applied", "MemberRead", now)
            .await
            .map_err(|error| error.to_string())?
    );
    let puts: i32 = sqlx::query_scalar(
        "SELECT put_count FROM assignment.role_assignment_intent WHERE intent_id=$1",
    )
    .bind(claimed.intent_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(puts, 1);
    let claims: i64 = sqlx::query_scalar("SELECT count(*) FROM assignment.role_relation_claim WHERE tenant_id=$1 AND source='automatic'")
        .bind(tenant)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(claims, 1);
    store
        .publish_role(tenant, &guild, "201", &payload(&guild, "201"), "app", now)
        .await
        .map_err(|error| error.to_string())?;
    let remaining: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM assignment.role_relation_claim WHERE tenant_id=$1 AND role_id='200'",
    )
    .bind(tenant)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(remaining, 1);
    let _query = QueryStore::connect(
        &env::var("TOBOT_TEST_DATABASE_URL").map_err(|error| error.to_string())?,
    )
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tokio::test]
async fn unchanged_failed_uncertain_and_lease() -> Result<(), String> {
    let _guard = TEST_LOCK.lock().await;
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    store
        .publish_role(tenant, &guild, "200", &payload(&guild, "200"), "app", now)
        .await
        .map_err(|error| error.to_string())?;

    store
        .reserve_join(
            &join(tenant, &guild, "6", "2026-09-23T20:04:00Z", false),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    let unchanged = store
        .claim_next(now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("missing unchanged claim")?;
    assert!(
        store
            .finish(&unchanged, "Unchanged", "AlreadyPresent", now)
            .await
            .map_err(|error| error.to_string())?
    );
    let unchanged_status: String = sqlx::query_scalar(
        "SELECT status FROM assignment.role_assignment_intent WHERE intent_id=$1",
    )
    .bind(unchanged.intent_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(unchanged_status, "Unchanged");
    let unchanged_puts: i32 = sqlx::query_scalar(
        "SELECT put_count FROM assignment.role_assignment_intent WHERE intent_id=$1",
    )
    .bind(unchanged.intent_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(unchanged_puts, 0);
    let automatic: i64 = sqlx::query_scalar("SELECT count(*) FROM assignment.role_relation_claim WHERE tenant_id=$1 AND source='automatic'")
        .bind(tenant)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(automatic, 0);

    store
        .reserve_join(
            &join(tenant, &guild, "7", "2026-09-23T20:05:00Z", false),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    let failed = store
        .claim_next(now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("missing failed claim")?;
    assert!(
        store
            .finish(&failed, "Failed", "Blocked", now)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        !store
            .finish(&failed, "Failed", "Blocked", now)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        store
            .claim_next(now + time::Duration::hours(1))
            .await
            .map_err(|error| error.to_string())?
            .is_none()
    );
    let failed_status: String = sqlx::query_scalar(
        "SELECT status FROM assignment.role_assignment_intent WHERE intent_id=$1",
    )
    .bind(failed.intent_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(failed_status, "Failed");

    store
        .reserve_join(
            &join(tenant, &guild, "8", "2026-09-23T20:06:00Z", false),
            now,
        )
        .await
        .map_err(|error| error.to_string())?;
    let uncertain = store
        .claim_next(now)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("missing uncertain claim")?;
    assert!(
        store
            .finish(&uncertain, "OutcomeUncertain", "LostResponse", now)
            .await
            .map_err(|error| error.to_string())?
    );
    let uncertain_facts: i64 = sqlx::query_scalar("SELECT count(*) FROM assignment.event_outbox WHERE topic='OutcomeUncertain' OR topic='RoleAssignmentUncertain'")
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    assert_eq!(uncertain_facts, 0);
    assert!(
        store
            .claim_next(now)
            .await
            .map_err(|error| error.to_string())?
            .is_none()
    );
    let reclaimed = store
        .claim_next(now + time::Duration::seconds(16))
        .await
        .map_err(|error| error.to_string())?
        .ok_or("uncertain intent was not reclaimed after the lease")?;
    assert_eq!(reclaimed.intent_id, uncertain.intent_id);
    assert!(reclaimed.fencing_token > uncertain.fencing_token);
    let mut stale = reclaimed.clone();
    stale.fencing_token -= 1;
    let extended = now + time::Duration::seconds(120);
    assert!(
        !store
            .defer_lease(&stale, extended)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        store
            .defer_lease(&reclaimed, extended)
            .await
            .map_err(|error| error.to_string())?
    );
    assert!(
        store
            .claim_next(now + time::Duration::seconds(20))
            .await
            .map_err(|error| error.to_string())?
            .is_none()
    );
    let after_defer = store
        .claim_next(extended + time::Duration::seconds(1))
        .await
        .map_err(|error| error.to_string())?
        .ok_or("deferred lease did not expire")?;
    assert_eq!(after_defer.intent_id, uncertain.intent_id);

    let unchanged_topic: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM assignment.event_outbox WHERE topic='RoleAssignmentUnchanged'",
    )
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    let failed_topic: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM assignment.event_outbox WHERE topic='RoleAssignmentFailed'",
    )
    .fetch_one(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(unchanged_topic, 1);
    assert_eq!(failed_topic, 1);
    Ok(())
}
