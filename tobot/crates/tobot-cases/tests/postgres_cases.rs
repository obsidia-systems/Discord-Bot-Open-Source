//! Case proofs that need PostgreSQL. They refuse any database other than `tobot_test`.

use std::{
    env,
    sync::atomic::{AtomicUsize, Ordering},
};

use async_trait::async_trait;
use time::OffsetDateTime;
use tobot_cases::{
    MemberTimeoutGateway, PreflightQuery, SubmittedAction, TimeoutMutation,
    execute_submitted_action, status_after_followup_failure,
};
use tobot_discord_adapter::{CapabilityDecision, ModerationPreflightReport, TransportError};
use tobot_persistence::{Migrations, ModerationStore};
use uuid::Uuid;

struct Script {
    report: ModerationPreflightReport,
    calls: AtomicUsize,
}

#[async_trait]
impl MemberTimeoutGateway for Script {
    async fn preflight(
        &self,
        _query: &PreflightQuery<'_>,
    ) -> Result<ModerationPreflightReport, TransportError> {
        Ok(self.report.clone())
    }

    async fn apply_timeout(&self, _mutation: &TimeoutMutation<'_>) -> Result<(), TransportError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    async fn clear_timeout(&self, _mutation: &TimeoutMutation<'_>) -> Result<(), TransportError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    async fn observe_timeout(
        &self,
        _guild_id: &str,
        _user_id: &str,
    ) -> Result<bool, TransportError> {
        Ok(true)
    }
}

#[tokio::test]
async fn hierarchy_deny_does_not_call_timeout() -> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let tenant_id = insert_tenant().await?;
    let script = Script {
        report: report(CapabilityDecision::Denied),
        calls: AtomicUsize::new(0),
    };
    let decision = execute_submitted_action(
        &store,
        &script,
        &action(tenant_id, "timeout", "10m", "interaction-hierarchy"),
        OffsetDateTime::now_utc(),
    )
    .await
    .map_err(|error| error.to_string())?;
    if decision.status != "Rejected" {
        return Err(format!("expected Rejected, got {}", decision.status));
    }
    if script.calls.load(Ordering::SeqCst) != 0 {
        return Err("hierarchy deny called timeout".to_owned());
    }
    Ok(())
}

#[tokio::test]
async fn one_idempotency_key_confirms_one_timeout() -> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let tenant_id = insert_tenant().await?;
    let script = Script {
        report: report(CapabilityDecision::Allowed),
        calls: AtomicUsize::new(0),
    };
    let submitted = action(tenant_id, "timeout", "10m", "interaction-once");
    let now = OffsetDateTime::now_utc();
    let first = execute_submitted_action(&store, &script, &submitted, now)
        .await
        .map_err(|error| error.to_string())?;
    let second = execute_submitted_action(&store, &script, &submitted, now)
        .await
        .map_err(|error| error.to_string())?;
    if first.case_id != second.case_id {
        return Err("replay opened a second case".to_owned());
    }
    if first.status != "Applied" || second.status != "Applied" {
        return Err(format!(
            "expected Applied, got {} and {}",
            first.status, second.status
        ));
    }
    if script.calls.load(Ordering::SeqCst) != 1 {
        return Err("timeout was sent more than once".to_owned());
    }
    if status_after_followup_failure("Applied") != "Applied" {
        return Err("follow-up failure changed Applied".to_owned());
    }
    Ok(())
}

#[tokio::test]
async fn two_workers_with_one_key_send_one_timeout() -> Result<(), String> {
    let Some(store) = connect().await? else {
        return Ok(());
    };
    let tenant_id = insert_tenant().await?;
    let script = std::sync::Arc::new(Script {
        report: report(CapabilityDecision::Allowed),
        calls: AtomicUsize::new(0),
    });
    let submitted = action(tenant_id, "timeout", "5m", "interaction-dual");
    let now = OffsetDateTime::now_utc();
    let (left, right) = tokio::join!(
        execute_submitted_action(&store, script.as_ref(), &submitted, now),
        execute_submitted_action(&store, script.as_ref(), &submitted, now),
    );
    let left = left.map_err(|error| error.to_string())?;
    let right = right.map_err(|error| error.to_string())?;
    if left.case_id != right.case_id {
        return Err("dual writer opened two cases".to_owned());
    }
    if script.calls.load(Ordering::SeqCst) > 1 {
        return Err("dual writer sent more than one timeout".to_owned());
    }
    Ok(())
}

fn action<'a>(
    tenant_id: Uuid,
    action_type: &'a str,
    duration: &'a str,
    interaction_id: &'a str,
) -> SubmittedAction<'a> {
    SubmittedAction {
        tenant_id,
        guild_id: "guild",
        application_id: "app",
        actor_provider_user_id: "111",
        target_user_id: "222",
        action_type,
        duration_text: Some(duration),
        reason: "spam",
        interaction_id,
        correlation_id: Uuid::now_v7(),
        deadline_passed: false,
    }
}

fn report(hierarchy: CapabilityDecision) -> ModerationPreflightReport {
    ModerationPreflightReport {
        actor_permission: CapabilityDecision::Allowed,
        bot_permission: CapabilityDecision::Allowed,
        owner_protection: CapabilityDecision::Allowed,
        hierarchy,
        protected_target: CapabilityDecision::Allowed,
    }
}

async fn insert_tenant() -> Result<Uuid, String> {
    let tenant_id = Uuid::now_v7();
    let pool = sqlx::PgPool::connect(
        &env::var("TOBOT_TEST_DATABASE_URL").map_err(|error| error.to_string())?,
    )
    .await
    .map_err(|error| error.to_string())?;
    sqlx::query(
        "INSERT INTO installation.tenant \
         (tenant_id, tenant_type, provider_tenant_ref, application_id, state) \
         VALUES ($1, 'Guild', $2, 'app', 'Active')",
    )
    .bind(tenant_id)
    .bind(tenant_id.to_string())
    .execute(&pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(tenant_id)
}

async fn connect() -> Result<Option<ModerationStore>, String> {
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
        return Err("refusing to run cases against a database other than tobot_test".to_owned());
    }
    let migrations = Migrations::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    migrations
        .migrate()
        .await
        .map_err(|error| error.to_string())?;
    Ok(Some(
        ModerationStore::connect(&url)
            .await
            .map_err(|error| error.to_string())?,
    ))
}
