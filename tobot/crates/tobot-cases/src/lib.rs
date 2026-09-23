//! Moderation case lifecycle hosted by Control Plane. It calls Delivery and does not own a bot token.

use async_trait::async_trait;
use thiserror::Error;
use time::OffsetDateTime;
use tobot_discord_adapter::{
    CapabilityDecision, ModerationPreflightReport, TimeoutOutcome, classify_timeout_result,
    combine_preflight,
};
use tobot_envelope::{EnvelopeError, ModerationActionType};
use tobot_persistence::{ModerationCaseRecord, ModerationStore, NewModerationCase};
use uuid::Uuid;

/// Discord's documented timeout maximum: 28 days.
pub const TIMEOUT_MAX_SECONDS: i64 = 28 * 24 * 60 * 60;

#[derive(Debug, Error)]
pub enum CasesError {
    #[error(transparent)]
    Store(#[from] sqlx::Error),
    #[error(transparent)]
    Action(#[from] EnvelopeError),
    #[error("moderation transport failed")]
    Transport(String),
}

pub struct SubmittedAction<'a> {
    pub tenant_id: Uuid,
    pub guild_id: &'a str,
    pub application_id: &'a str,
    pub actor_provider_user_id: &'a str,
    pub target_user_id: &'a str,
    pub action_type: &'a str,
    pub duration_text: Option<&'a str>,
    pub reason: &'a str,
    pub interaction_id: &'a str,
    pub correlation_id: Uuid,
    pub deadline_passed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CaseDecision {
    pub case_id: Option<Uuid>,
    pub display_number: Option<i64>,
    pub status: String,
    pub follow_up: String,
}

pub struct PreflightQuery<'a> {
    pub guild_id: &'a str,
    pub actor_user_id: &'a str,
    pub target_user_id: &'a str,
    pub protected_targets: &'a [String],
}

pub struct TimeoutMutation<'a> {
    pub guild_id: &'a str,
    pub user_id: &'a str,
    pub until_unix: Option<i64>,
    pub audit_reason: &'a str,
}

#[async_trait]
pub trait MemberTimeoutGateway: Send + Sync {
    async fn preflight(
        &self,
        query: &PreflightQuery<'_>,
    ) -> Result<ModerationPreflightReport, tobot_discord_adapter::TransportError>;

    async fn apply_timeout(
        &self,
        mutation: &TimeoutMutation<'_>,
    ) -> Result<(), tobot_discord_adapter::TransportError>;

    async fn clear_timeout(
        &self,
        mutation: &TimeoutMutation<'_>,
    ) -> Result<(), tobot_discord_adapter::TransportError>;

    async fn observe_timeout(
        &self,
        guild_id: &str,
        user_id: &str,
    ) -> Result<bool, tobot_discord_adapter::TransportError>;
}

/// A failed follow-up does not change a case that Discord already confirmed.
#[must_use]
pub fn status_after_followup_failure(status: &str) -> &str {
    status
}

/// # Errors
///
/// Returns an error when the duration is empty, non-positive, or longer than 28 days.
pub fn parse_timeout_duration(raw: &str) -> Result<i64, EnvelopeError> {
    let folded = fold_duration(raw.trim());
    let (count, unit) = split_duration(&folded).ok_or_else(|| {
        EnvelopeError::UnsupportedSchemaName(format!("duration {raw}"))
    })?;
    let count = count.parse::<i64>().map_err(|_| {
        EnvelopeError::UnsupportedSchemaName(format!("duration {raw}"))
    })?;
    if count <= 0 {
        return Err(EnvelopeError::UnsupportedSchemaName(format!("duration {raw}")));
    }
    let seconds = count.saturating_mul(unit_seconds(unit).ok_or_else(|| {
        EnvelopeError::UnsupportedSchemaName(format!("duration {raw}"))
    })?);
    if !(1..=TIMEOUT_MAX_SECONDS).contains(&seconds) {
        return Err(EnvelopeError::UnsupportedSchemaName(format!("duration {raw}")));
    }
    Ok(seconds)
}

#[must_use]
pub fn moderation_idempotency_key(
    tenant_id: Uuid,
    interaction_id: &str,
    target_user_id: &str,
    action_type: &str,
    expiry: &str,
) -> String {
    format!("{tenant_id}:{interaction_id}:{target_user_id}:{action_type}:{expiry}")
}

#[must_use]
pub fn follow_up_text(display_number: Option<i64>, status: &str) -> String {
    let state = match status {
        "Applied" | "Compensated" => "Applied",
        "Rejected" => "Rejected",
        "Failed" | "Blocked" => "Failed",
        _ => "Uncertain",
    };
    match display_number {
        Some(number) => format!("Case {number}: {state}."),
        None => format!("The action is {state}."),
    }
}

/// Admits one timeout or clear. A replay of the same key does not call Transport again.
///
/// # Errors
///
/// Returns a store or transport error that leaves the case recoverable.
pub async fn execute_submitted_action(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    action: &SubmittedAction<'_>,
    now: OffsetDateTime,
) -> Result<CaseDecision, CasesError> {
    let action_type = ModerationActionType::try_from(action.action_type)?;
    if action.deadline_passed {
        return Ok(decision(None, None, "Rejected"));
    }
    let reason = sanitize_reason(action.reason);
    if reason.is_empty() {
        return Ok(decision(None, None, "Rejected"));
    }
    let Ok(duration) = duration_for(action_type, action.duration_text) else {
        return Ok(decision(None, None, "Rejected"));
    };
    let pinned = store.pin_policy(action.tenant_id).await?;
    let expiry = duration.map_or_else(|| "clear".to_owned(), |seconds| seconds.to_string());
    let key = moderation_idempotency_key(
        action.tenant_id,
        action.interaction_id,
        action.target_user_id,
        action_type.as_str(),
        &expiry,
    );
    let expires_at = duration.and_then(|seconds| now.checked_add(time::Duration::seconds(seconds)));
    let (record, created) = store
        .open_case(
            &NewModerationCase {
                tenant_id: action.tenant_id,
                action_type: action_type.as_str(),
                actor_provider_user_id: action.actor_provider_user_id,
                target_user_id: action.target_user_id,
                target_label: action.target_user_id,
                reason: &reason,
                duration_seconds: duration,
                expires_at,
                policy_revision_id: pinned.policy_revision_id,
                idempotency_key: &key,
                interaction_id: action.interaction_id,
                guild_id: action.guild_id,
                correlation_id: action.correlation_id,
                application_id: action.application_id,
            },
            now,
        )
        .await?;
    if !created && record.status != "Requested" {
        return Ok(from_record(&record));
    }
    if duration.is_none() && action_type == ModerationActionType::Timeout {
        return reject_case(store, &record, now).await;
    }
    drive_case(store, gateway, &record, &pinned.protected_targets, now).await
}

/// Finishes cases left in `Executing` by a killed worker. A transmitted timeout is not sent again.
///
/// # Errors
///
/// Returns the first store or transport error.
pub async fn resume_stale_cases(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    now: OffsetDateTime,
) -> Result<usize, CasesError> {
    let stale = store
        .stale_executing(now - time::Duration::seconds(2))
        .await?;
    let mut finished = 0;
    for case_id in stale {
        if resume_one(store, gateway, case_id, now).await? {
            finished += 1;
        }
    }
    Ok(finished)
}

async fn resume_one(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    case_id: Uuid,
    now: OffsetDateTime,
) -> Result<bool, CasesError> {
    let Some(record) = store.case_by_id(case_id).await? else {
        return Ok(false);
    };
    if record.status != "Executing" {
        return Ok(false);
    }
    match store.receipt_class(case_id).await?.as_deref() {
        Some("Confirmed") => {
            finish_applied(store, &record, now).await?;
        }
        Some("Blocked") => {
            let _changed = store
                .transition_case(
                    record.case_id,
                    &["Executing"],
                    "Failed",
                    Some("ModerationActionFailed"),
                    serde_json::json!({}),
                    &record.application_id,
                    now,
                )
                .await?;
        }
        Some("Transmitted" | "Uncertain") => {
            reconcile(store, gateway, &record, now).await?;
        }
        _ => {
            store.ensure_receipt(record.case_id).await?;
            send_timeout(store, gateway, &record, now).await?;
        }
    }
    Ok(true)
}

async fn drive_case(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    record: &ModerationCaseRecord,
    protected_targets: &[String],
    now: OffsetDateTime,
) -> Result<CaseDecision, CasesError> {
    let report = match gateway
        .preflight(&PreflightQuery {
            guild_id: &record.guild_id,
            actor_user_id: &record.actor_provider_user_id,
            target_user_id: &record.target_user_id,
            protected_targets,
        })
        .await
    {
        Ok(report) => report,
        Err(tobot_discord_adapter::TransportError::RateLimited { .. }) => {
            return Ok(from_record(record));
        }
        Err(error) => return Err(CasesError::Transport(error.to_string())),
    };
    match combine_preflight(&report) {
        CapabilityDecision::Denied => reject_case(store, record, now).await,
        CapabilityDecision::Blocked | CapabilityDecision::Unknown => {
            fail_case(store, record, "Requested", now).await
        }
        CapabilityDecision::Allowed => authorize_and_send(store, gateway, record, now).await,
    }
}

async fn authorize_and_send(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    record: &ModerationCaseRecord,
    now: OffsetDateTime,
) -> Result<CaseDecision, CasesError> {
    let authorized = store
        .transition_case(
            record.case_id,
            &["Requested"],
            "Authorized",
            Some("ModerationActionAuthorized"),
            serde_json::json!({}),
            &record.application_id,
            now,
        )
        .await?;
    if !authorized {
        return reload(store, record.case_id).await;
    }
    let executing = store
        .transition_case(
            record.case_id,
            &["Authorized"],
            "Executing",
            None,
            serde_json::json!({}),
            &record.application_id,
            now,
        )
        .await?;
    if !executing {
        return reload(store, record.case_id).await;
    }
    store.ensure_receipt(record.case_id).await?;
    send_timeout(store, gateway, record, now).await?;
    reload(store, record.case_id).await
}

async fn send_timeout(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    record: &ModerationCaseRecord,
    now: OffsetDateTime,
) -> Result<(), CasesError> {
    if !store.mark_transmitted_once(record.case_id).await? {
        return Ok(());
    }
    let until_unix = record.expires_at.map(OffsetDateTime::unix_timestamp);
    let audit_reason = format!("case {}: {}", record.display_number, record.reason);
    let mutation = TimeoutMutation {
        guild_id: &record.guild_id,
        user_id: &record.target_user_id,
        until_unix,
        audit_reason: &audit_reason,
    };
    let result = if record.action_type == "remove_timeout" {
        gateway.clear_timeout(&mutation).await
    } else {
        gateway.apply_timeout(&mutation).await
    };
    apply_timeout_result(store, gateway, record, result, now).await
}

async fn apply_timeout_result(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    record: &ModerationCaseRecord,
    result: Result<(), tobot_discord_adapter::TransportError>,
    now: OffsetDateTime,
) -> Result<(), CasesError> {
    let outcome = match &result {
        Ok(()) => TimeoutOutcome::Applied,
        Err(error) => classify_timeout_result(Err(error)),
    };
    match outcome {
        TimeoutOutcome::Applied => finish_applied(store, record, now).await,
        TimeoutOutcome::RateLimited => {
            store.set_receipt_class(record.case_id, "NotSent").await?;
            Ok(())
        }
        TimeoutOutcome::Blocked | TimeoutOutcome::Failed => {
            store.set_receipt_class(record.case_id, "Blocked").await?;
            let _changed = store
                .transition_case(
                    record.case_id,
                    &["Executing"],
                    "Failed",
                    Some("ModerationActionFailed"),
                    serde_json::json!({}),
                    &record.application_id,
                    now,
                )
                .await?;
            Ok(())
        }
        TimeoutOutcome::OutcomeUncertain => {
            store.set_receipt_class(record.case_id, "Uncertain").await?;
            reconcile(store, gateway, record, now).await
        }
    }
}

async fn finish_applied(
    store: &ModerationStore,
    record: &ModerationCaseRecord,
    now: OffsetDateTime,
) -> Result<(), CasesError> {
    store.set_receipt_class(record.case_id, "Confirmed").await?;
    let mut extra = serde_json::json!({});
    if record.action_type == "remove_timeout" {
        let compensated = store
            .compensate_applied_timeouts(record.tenant_id, &record.target_user_id, record.case_id, now)
            .await?;
        extra = serde_json::json!({
            "compensated_case_ids": compensated.iter().map(ToString::to_string).collect::<Vec<_>>()
        });
    }
    let _changed = store
        .transition_case(
            record.case_id,
            &["Executing", "Authorized"],
            "Applied",
            Some("ModerationActionApplied"),
            extra,
            &record.application_id,
            now,
        )
        .await?;
    Ok(())
}

async fn reconcile(
    store: &ModerationStore,
    gateway: &impl MemberTimeoutGateway,
    record: &ModerationCaseRecord,
    now: OffsetDateTime,
) -> Result<(), CasesError> {
    let active = gateway
        .observe_timeout(&record.guild_id, &record.target_user_id)
        .await
        .map_err(|error| CasesError::Transport(error.to_string()))?;
    let succeeded = if record.action_type == "remove_timeout" {
        !active
    } else {
        active
    };
    if succeeded {
        finish_applied(store, record, now).await
    } else {
        store.set_receipt_class(record.case_id, "Uncertain").await?;
        let _changed = store
            .transition_case(
                record.case_id,
                &["Executing"],
                "OutcomeUncertain",
                None,
                serde_json::json!({}),
                &record.application_id,
                now,
            )
            .await?;
        Ok(())
    }
}

async fn reject_case(
    store: &ModerationStore,
    record: &ModerationCaseRecord,
    now: OffsetDateTime,
) -> Result<CaseDecision, CasesError> {
    let _changed = store
        .transition_case(
            record.case_id,
            &["Requested"],
            "Rejected",
            Some("ModerationActionRejected"),
            serde_json::json!({}),
            &record.application_id,
            now,
        )
        .await?;
    reload(store, record.case_id).await
}

async fn fail_case(
    store: &ModerationStore,
    record: &ModerationCaseRecord,
    from: &str,
    now: OffsetDateTime,
) -> Result<CaseDecision, CasesError> {
    let _changed = store
        .transition_case(
            record.case_id,
            &[from],
            "Failed",
            Some("ModerationActionFailed"),
            serde_json::json!({}),
            &record.application_id,
            now,
        )
        .await?;
    reload(store, record.case_id).await
}

async fn reload(store: &ModerationStore, case_id: Uuid) -> Result<CaseDecision, CasesError> {
    let record = store.case_by_id(case_id).await?;
    Ok(record.map_or_else(
        || decision(Some(case_id), None, "Uncertain"),
        |record| from_record(&record),
    ))
}

fn from_record(record: &ModerationCaseRecord) -> CaseDecision {
    decision(Some(record.case_id), Some(record.display_number), &record.status)
}

fn decision(case_id: Option<Uuid>, display_number: Option<i64>, status: &str) -> CaseDecision {
    CaseDecision {
        case_id,
        display_number,
        status: status.to_owned(),
        follow_up: follow_up_text(display_number, status),
    }
}

fn duration_for(
    action_type: ModerationActionType,
    duration_text: Option<&str>,
) -> Result<Option<i64>, EnvelopeError> {
    match action_type {
        ModerationActionType::RemoveTimeout => Ok(None),
        ModerationActionType::Timeout => {
            let Some(text) = duration_text else {
                return Ok(None);
            };
            parse_timeout_duration(text).map(Some)
        }
    }
}

fn sanitize_reason(reason: &str) -> String {
    reason
        .chars()
        .filter(|character| !character.is_control())
        .take(200)
        .collect::<String>()
        .trim()
        .to_owned()
}

fn fold_duration(raw: &str) -> String {
    raw.to_lowercase()
        .chars()
        .map(|character| match character {
            'á' | 'à' => 'a',
            'í' => 'i',
            _ => character,
        })
        .collect()
}

fn split_duration(raw: &str) -> Option<(&str, &str)> {
    let raw = raw.trim();
    if let Some((count, unit)) = raw.split_once(|character: char| character.is_whitespace()) {
        return Some((count.trim(), unit.trim()));
    }
    if raw.chars().all(|character| character.is_ascii_digit()) && !raw.is_empty() {
        return Some((raw, "m"));
    }
    let split = raw.find(|character: char| !character.is_ascii_digit())?;
    if split == 0 {
        return None;
    }
    Some((&raw[..split], raw[split..].trim()))
}

fn unit_seconds(unit: &str) -> Option<i64> {
    match unit {
        "s" | "sec" | "second" | "seconds" | "segundo" | "segundos" => Some(1),
        "m" | "min" | "minute" | "minutes" | "minuto" | "minutos" => Some(60),
        "h" | "hr" | "hour" | "hours" | "hora" | "horas" => Some(3_600),
        "d" | "day" | "days" | "dia" | "dias" => Some(86_400),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_accepts_english_and_spanish_and_rejects_the_overflow() {
        assert_eq!(parse_timeout_duration("1").ok(), Some(60));
        assert_eq!(parse_timeout_duration("10m").ok(), Some(600));
        assert_eq!(parse_timeout_duration("10 minutos").ok(), Some(600));
        assert_eq!(parse_timeout_duration("1 día").ok(), Some(86_400));
        assert_eq!(parse_timeout_duration("28d").ok(), Some(TIMEOUT_MAX_SECONDS));
        assert!(parse_timeout_duration("29d").is_err());
        assert!(parse_timeout_duration("0m").is_err());
    }

    #[test]
    fn follow_up_failure_leaves_applied_unchanged() {
        assert_eq!(status_after_followup_failure("Applied"), "Applied");
        assert_eq!(follow_up_text(Some(4), "Applied"), "Case 4: Applied.");
        assert_eq!(follow_up_text(Some(4), "OutcomeUncertain"), "Case 4: Uncertain.");
    }
}
