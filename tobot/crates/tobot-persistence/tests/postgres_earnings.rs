//! Pruebas S6 en `tobot_test` desechable: admisión, cooldown y proyección.

use std::env;
use time::OffsetDateTime;
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_persistence::{DailyDecision, EarningsStore, Migrations, QueryStore};
use uuid::Uuid;

async fn fixture() -> Result<Option<(EarningsStore, QueryStore, sqlx::PgPool, Uuid, String)>, String>
{
    let Ok(url) = env::var("TOBOT_TEST_DATABASE_URL") else {
        if env::var("TOBOT_REQUIRE_POSTGRES").is_ok() {
            return Err("TOBOT_TEST_DATABASE_URL required".to_owned());
        }
        return Ok(None);
    };
    if url
        .split('?')
        .next()
        .and_then(|value| value.rsplit('/').next())
        != Some("tobot_test")
    {
        return Err("refusing a non-disposable database".to_owned());
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
    let tenant = Uuid::now_v7();
    let guild = (Uuid::now_v7().as_u128() % 900_000_000_000_000 + 1000).to_string();
    sqlx::query("INSERT INTO installation.tenant (tenant_id,tenant_type,provider_tenant_ref,application_id,state) VALUES ($1,'Guild',$2,'123','Active')")
        .bind(tenant).bind(&guild).execute(&pool).await.map_err(|e|e.to_string())?;
    sqlx::query("INSERT INTO installation.installation (installation_id,tenant_id,generation,state,manifest) VALUES ($1,$2,1,'Installed','{}'::jsonb)")
        .bind(Uuid::now_v7()).bind(tenant).execute(&pool).await.map_err(|e|e.to_string())?;
    Ok(Some((
        EarningsStore::connect(&url)
            .await
            .map_err(|e| e.to_string())?,
        QueryStore::connect(&url).await.map_err(|e| e.to_string())?,
        pool,
        tenant,
        guild,
    )))
}

#[tokio::test]
async fn daily_concurrency_one_admission_and_cooldown() -> Result<(), String> {
    let Some((store, _, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let policy = store
        .publish_daily(tenant, &guild, "123", Uuid::now_v7(), 10, now)
        .await
        .map_err(|e| e.to_string())?;
    assert_eq!(policy.amount, 10);
    let audit = store
        .request_circuit_change(tenant, Uuid::now_v7(), false, false, now)
        .await
        .map_err(|e| e.to_string())?;
    store
        .set_daily_enabled(tenant, Uuid::now_v7(), false, now)
        .await
        .map_err(|e| e.to_string())?;
    let disabled = store
        .admit_daily(tenant, &guild, "123", "456", "999", now)
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(disabled, DailyDecision::NotConfigured));
    store
        .finish_circuit_change(audit, true, None, now)
        .await
        .map_err(|e| e.to_string())?;
    store
        .set_daily_enabled(tenant, Uuid::now_v7(), true, now)
        .await
        .map_err(|e| e.to_string())?;
    let (a, b) = tokio::join!(
        store.admit_daily(tenant, &guild, "123", "456", "1001", now),
        store.admit_daily(tenant, &guild, "123", "456", "1002", now),
    );
    let outcomes = [a.map_err(|e| e.to_string())?, b.map_err(|e| e.to_string())?];
    assert_eq!(
        outcomes
            .iter()
            .filter(|value| matches!(value, DailyDecision::Admitted(_)))
            .count(),
        1
    );
    assert_eq!(
        outcomes
            .iter()
            .filter(|value| matches!(value, DailyDecision::Pending))
            .count(),
        1
    );
    let claimed = store
        .claim_pending(now, Uuid::now_v7())
        .await
        .map_err(|e| e.to_string())?;
    let action = claimed
        .into_iter()
        .find(|value| value.tenant_id == tenant)
        .ok_or("action was not claimed")?;
    assert!(
        store
            .complete(&action, Some(Uuid::now_v7()), Some(110), None, now)
            .await
            .map_err(|e| e.to_string())?
    );
    assert!(
        !store
            .complete(&action, Some(Uuid::now_v7()), Some(120), None, now)
            .await
            .map_err(|e| e.to_string())?
    );
    let responses = store
        .claim_responses(now, Uuid::now_v7())
        .await
        .map_err(|e| e.to_string())?;
    let due = responses
        .into_iter()
        .find(|value| value.action_id == action.action_id)
        .ok_or("terminal response not recoverable")?;
    assert!(
        store
            .finish_response(&due, true, now)
            .await
            .map_err(|e| e.to_string())?
    );
    assert!(
        !store
            .finish_response(&due, true, now)
            .await
            .map_err(|e| e.to_string())?
    );
    let next = store
        .admit_daily(
            tenant,
            &guild,
            "123",
            "456",
            "1003",
            now + time::Duration::hours(1),
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(next, DailyDecision::Ineligible(_)));
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM earnings.income_action WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    assert_eq!(count, 1);
    Ok(())
}

#[tokio::test]
async fn wallet_projection_ignores_duplicate_and_older_sequence() -> Result<(), String> {
    let Some((_, query, _, tenant, _)) = fixture().await? else {
        return Ok(());
    };
    let member = "456";
    let currency = Uuid::now_v7();
    for (sequence, balance) in [(2, 110), (1, 100), (2, 110)] {
        let event = EventEnvelope {
            event_id: Uuid::now_v7(),
            schema_name: "BalanceProjectionChanged".to_owned(),
            schema_version: 1,
            schema_family: Some("VirtualPayment".to_owned()),
            occurred_at: "2026-09-25T00:00:00Z".to_owned(),
            received_at: "2026-09-25T00:00:00Z".to_owned(),
            application_id: "123".to_owned(),
            tenant_id: Some(tenant),
            guild_id: None,
            shard_id: None,
            session_id: None,
            gateway_sequence: None,
            correlation_id: Uuid::now_v7(),
            causation_id: None,
            trace_context: TraceContext {
                trace_id: "trace".to_owned(),
                span_id: "span".to_owned(),
            },
            payload: serde_json::json!({"member_id":member,"currency_id":currency,"journal_sequence":sequence,"balance":balance}),
        };
        let raw = serde_json::to_vec(&event).map_err(|e| e.to_string())?;
        query
            .apply_wallet(&event, &raw, "1-0", OffsetDateTime::now_utc())
            .await
            .map_err(|e| e.to_string())?;
    }
    let row = query
        .wallet_projection(tenant, member)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("missing projection")?;
    assert_eq!((row.1, row.2), (110, 2));
    let foreign = Uuid::now_v7();
    let event = EventEnvelope {
        event_id: Uuid::now_v7(),
        schema_name: "BalanceProjectionChanged".to_owned(),
        schema_version: 1,
        schema_family: Some("VirtualPayment".to_owned()),
        occurred_at: "2026-09-25T00:00:00Z".to_owned(),
        received_at: "2026-09-25T00:00:00Z".to_owned(),
        application_id: "123".to_owned(),
        tenant_id: Some(foreign),
        guild_id: None,
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id: Uuid::now_v7(),
        causation_id: None,
        trace_context: TraceContext {
            trace_id: "trace".to_owned(),
            span_id: "span".to_owned(),
        },
        payload: serde_json::json!({"member_id":member,"currency_id":currency,"journal_sequence":3,"balance":120}),
    };
    let raw = serde_json::to_vec(&event).map_err(|e| e.to_string())?;
    query
        .apply_wallet(&event, &raw, "2-0", OffsetDateTime::now_utc())
        .await
        .map_err(|e| e.to_string())?;
    assert!(
        query
            .wallet_projection(foreign, member)
            .await
            .map_err(|e| e.to_string())?
            .is_none()
    );
    Ok(())
}
