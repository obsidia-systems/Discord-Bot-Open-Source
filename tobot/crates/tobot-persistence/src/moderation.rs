//! Case rows, receipts, and the moderation outbox. Other facades do not write these tables.

use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_envelope::{EventEnvelope, TraceContext};
use uuid::Uuid;

use super::{ClaimedOutboxEntry, ModerationStore};

const LIVE_FACTS: &[&str] = &[
    "ModerationCaseOpened",
    "ModerationActionAuthorized",
    "ModerationActionRejected",
    "ModerationActionFailed",
    "ModerationActionApplied",
];

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct ModerationCaseRecord {
    pub case_id: Uuid,
    pub tenant_id: Uuid,
    pub display_number: i64,
    pub action_type: String,
    pub status: String,
    pub actor_provider_user_id: String,
    pub target_user_id: String,
    pub target_label: String,
    pub reason: String,
    pub duration_seconds: Option<i64>,
    pub expires_at: Option<OffsetDateTime>,
    pub policy_revision_id: Uuid,
    pub idempotency_key: String,
    pub interaction_id: String,
    pub guild_id: String,
    pub application_id: String,
    pub correlation_id: Uuid,
}

pub struct NewModerationCase<'a> {
    pub tenant_id: Uuid,
    pub action_type: &'a str,
    pub actor_provider_user_id: &'a str,
    pub target_user_id: &'a str,
    pub target_label: &'a str,
    pub reason: &'a str,
    pub duration_seconds: Option<i64>,
    pub expires_at: Option<OffsetDateTime>,
    pub policy_revision_id: Uuid,
    pub idempotency_key: &'a str,
    pub interaction_id: &'a str,
    pub guild_id: &'a str,
    pub correlation_id: Uuid,
    pub application_id: &'a str,
}

#[derive(Clone, Debug)]
pub struct PinnedPolicy {
    pub policy_revision_id: Uuid,
    pub protected_targets: Vec<String>,
}

const CASE_COLUMNS: &str = "case_id, tenant_id, display_number, action_type, status, \
     actor_provider_user_id, target_user_id, target_label, reason, duration_seconds, expires_at, \
     policy_revision_id, idempotency_key, interaction_id, guild_id, application_id, correlation_id";

impl ModerationStore {
    /// Pins one policy revision per tenant. `protected_targets` stays an empty list.
    ///
    /// # Errors
    ///
    /// Returns a database error when the policy row cannot be written or read.
    pub async fn pin_policy(&self, tenant_id: Uuid) -> Result<PinnedPolicy, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO moderation.policy (policy_id, tenant_id) VALUES ($1, $2) \
             ON CONFLICT (tenant_id) DO NOTHING",
        )
        .bind(Uuid::now_v7())
        .bind(tenant_id)
        .execute(&mut *transaction)
        .await?;
        let policy_id: Uuid = sqlx::query_scalar(
            "SELECT policy_id FROM moderation.policy WHERE tenant_id = $1 FOR UPDATE",
        )
        .bind(tenant_id)
        .fetch_one(&mut *transaction)
        .await?;
        let existing: Option<(Uuid, serde_json::Value)> = sqlx::query_as(
            "SELECT policy_revision_id, protected_targets FROM moderation.policy_revision \
             WHERE policy_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(policy_id)
        .fetch_optional(&mut *transaction)
        .await?;
        let pinned = match existing {
            Some((policy_revision_id, protected_targets)) => PinnedPolicy {
                policy_revision_id,
                protected_targets: string_list(&protected_targets),
            },
            None => insert_empty_revision(&mut transaction, policy_id, tenant_id).await?,
        };
        transaction.commit().await?;
        Ok(pinned)
    }

    /// Inserts one case for an idempotency key. A second call returns the same row.
    ///
    /// # Errors
    ///
    /// Returns a database error when the case or its opened fact cannot be written.
    pub async fn open_case(
        &self,
        new_case: &NewModerationCase<'_>,
        now: OffsetDateTime,
    ) -> Result<(ModerationCaseRecord, bool), sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SELECT policy_id FROM moderation.policy WHERE tenant_id = $1 FOR UPDATE")
            .bind(new_case.tenant_id)
            .execute(&mut *transaction)
            .await?;
        let display_number: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(display_number), 0) + 1 FROM moderation.case WHERE tenant_id = $1",
        )
        .bind(new_case.tenant_id)
        .fetch_one(&mut *transaction)
        .await?;
        let case_id = Uuid::now_v7();
        let inserted = insert_case(&mut transaction, new_case, case_id, display_number, now).await?;
        let record = if inserted {
            let record = load_case_in(&mut transaction, case_id).await?;
            append_fact(
                &mut transaction,
                &record,
                "ModerationCaseOpened",
                serde_json::json!({}),
                new_case.application_id,
                now,
            )
            .await?;
            record
        } else {
            load_case_by_key(&mut transaction, new_case.tenant_id, new_case.idempotency_key).await?
        };
        transaction.commit().await?;
        Ok((record, inserted))
    }

    /// Moves a case when its current status is one of `from_statuses`.
    ///
    /// # Errors
    ///
    /// Returns a database error when the status or its fact cannot be written.
    #[allow(clippy::too_many_arguments)]
    pub async fn transition_case(
        &self,
        case_id: Uuid,
        from_statuses: &[&str],
        to_status: &str,
        fact_name: Option<&str>,
        extra: serde_json::Value,
        application_id: &str,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let record = load_case_for_update(&mut transaction, case_id).await?;
        let Some(record) = record else {
            transaction.commit().await?;
            return Ok(false);
        };
        if !from_statuses.contains(&record.status.as_str()) {
            transaction.commit().await?;
            return Ok(false);
        }
        sqlx::query(
            "UPDATE moderation.case SET status = $2, updated_at = $3 WHERE case_id = $1",
        )
        .bind(case_id)
        .bind(to_status)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        let mut updated = record;
        updated.status = to_status.to_owned();
        if let Some(fact_name) = fact_name {
            append_fact(
                &mut transaction,
                &updated,
                fact_name,
                extra,
                application_id,
                now,
            )
            .await?;
        } else {
            append_local_event(&mut transaction, case_id, to_status, now).await?;
        }
        transaction.commit().await?;
        Ok(true)
    }

    /// # Errors
    ///
    /// Returns a database error when the case cannot be read.
    pub async fn case_by_id(
        &self,
        case_id: Uuid,
    ) -> Result<Option<ModerationCaseRecord>, sqlx::Error> {
        let sql = format!("SELECT {CASE_COLUMNS} FROM moderation.case WHERE case_id = $1");
        sqlx::query_as(&sql)
            .bind(case_id)
            .fetch_optional(&self.pool)
            .await
    }

    /// # Errors
    ///
    /// Returns a database error when the receipt cannot be read.
    pub async fn receipt_class(&self, case_id: Uuid) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT result_class FROM moderation.action_receipt WHERE case_id = $1",
        )
        .bind(case_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Inserts `NotSent` once. A later class does not replace `Confirmed`.
    ///
    /// # Errors
    ///
    /// Returns a database error when the receipt cannot be written.
    pub async fn ensure_receipt(&self, case_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO moderation.action_receipt \
             (receipt_id, case_id, request_id, fencing_token, result_class) \
             VALUES ($1, $2, $3, 1, 'NotSent') ON CONFLICT (case_id) DO NOTHING",
        )
        .bind(Uuid::now_v7())
        .bind(case_id)
        .bind(Uuid::now_v7())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// One caller wins the provider send. A receipt that already left `NotSent` stays put.
    ///
    /// # Errors
    ///
    /// Returns a database error when the receipt cannot be updated.
    pub async fn mark_transmitted_once(&self, case_id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE moderation.action_receipt SET result_class = 'Transmitted', \
             fencing_token = fencing_token + 1 \
             WHERE case_id = $1 AND result_class = 'NotSent'",
        )
        .bind(case_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    /// # Errors
    ///
    /// Returns a database error when the receipt cannot be updated.
    pub async fn set_receipt_class(
        &self,
        case_id: Uuid,
        result_class: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE moderation.action_receipt SET result_class = $2, \
             fencing_token = fencing_token + 1 \
             WHERE case_id = $1 AND result_class <> 'Confirmed'",
        )
        .bind(case_id)
        .bind(result_class)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Marks earlier applied timeouts for the same member as compensated.
    ///
    /// # Errors
    ///
    /// Returns a database error when those rows cannot be updated.
    pub async fn compensate_applied_timeouts(
        &self,
        tenant_id: Uuid,
        target_user_id: &str,
        except_case_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let ids: Vec<Uuid> = sqlx::query_scalar(
            "UPDATE moderation.case SET status = 'Compensated', updated_at = $4 \
             WHERE tenant_id = $1 AND target_user_id = $2 AND action_type = 'timeout' \
               AND status = 'Applied' AND case_id <> $3 \
             RETURNING case_id",
        )
        .bind(tenant_id)
        .bind(target_user_id)
        .bind(except_case_id)
        .bind(now)
        .fetch_all(&mut *transaction)
        .await?;
        for case_id in &ids {
            append_local_event(&mut transaction, *case_id, "Compensated", now).await?;
        }
        transaction.commit().await?;
        Ok(ids)
    }

    /// Cases left in `Executing` long enough that the worker which set that status is gone.
    ///
    /// # Errors
    ///
    /// Returns a database error when the scan fails.
    pub async fn stale_executing(
        &self,
        older_than: OffsetDateTime,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT case_id FROM moderation.case \
             WHERE status = 'Executing' AND updated_at <= $1 \
             ORDER BY updated_at LIMIT 20",
        )
        .bind(older_than)
        .fetch_all(&self.pool)
        .await
    }

    /// # Errors
    ///
    /// Returns a database error when the gauge cannot be read.
    pub async fn moderation_relay_gauge(
        &self,
        now: OffsetDateTime,
    ) -> Result<super::RelayGauge, sqlx::Error> {
        sqlx::query_as(super::MODERATION_RELAY_GAUGE)
            .bind(now)
            .fetch_one(&self.pool)
            .await
    }

    /// # Errors
    ///
    /// Returns a database error when the lease cannot be extended.
    pub async fn renew_moderation_outbox_lease(
        &self,
        lease_token: Uuid,
        lease_until: OffsetDateTime,
    ) -> Result<u64, sqlx::Error> {
        super::renew_outbox_lease(
            &self.pool,
            "UPDATE moderation.event_outbox SET lease_expires_at = $2 \
             WHERE lease_token = $1 AND published_at IS NULL",
            lease_token,
            lease_until,
        )
        .await
    }

    /// # Errors
    ///
    /// Returns a database error when outbox work cannot be claimed.
    pub async fn claim_moderation_outbox(
        &self,
        now: OffsetDateTime,
        lease_until: OffsetDateTime,
        lease_token: Uuid,
        limit: i64,
    ) -> Result<Vec<ClaimedOutboxEntry>, sqlx::Error> {
        sqlx::query_as(
            "WITH candidate AS (SELECT outbox_id FROM moderation.event_outbox \
               WHERE published_at IS NULL AND available_at <= $1 \
                 AND (lease_expires_at IS NULL OR lease_expires_at < $1) \
               ORDER BY available_at, outbox_id LIMIT $2 FOR UPDATE SKIP LOCKED) \
             UPDATE moderation.event_outbox AS outbox SET lease_token = $3, \
               lease_expires_at = $4, fencing_token = outbox.fencing_token + 1, \
               publish_attempts = outbox.publish_attempts + 1 FROM candidate \
             WHERE outbox.outbox_id = candidate.outbox_id \
             RETURNING outbox.outbox_id, outbox.event_id, outbox.envelope, outbox.fencing_token",
        )
        .bind(now)
        .bind(limit)
        .bind(lease_token)
        .bind(lease_until)
        .fetch_all(&self.pool)
        .await
    }

    /// # Errors
    ///
    /// Returns a database error when the fenced receipt cannot be recorded.
    pub async fn mark_moderation_outbox_published(
        &self,
        outbox_id: Uuid,
        lease_token: Uuid,
        fencing_token: i64,
        published_at: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE moderation.event_outbox SET published_at = $4, lease_token = NULL, \
             lease_expires_at = NULL WHERE outbox_id = $1 AND lease_token = $2 \
             AND fencing_token = $3 AND published_at IS NULL",
        )
        .bind(outbox_id)
        .bind(lease_token)
        .bind(fencing_token)
        .bind(published_at)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
}

async fn insert_empty_revision(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    policy_id: Uuid,
    tenant_id: Uuid,
) -> Result<PinnedPolicy, sqlx::Error> {
    let policy_revision_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO moderation.policy_revision \
         (policy_revision_id, policy_id, tenant_id, protected_targets, actor_capabilities) \
         VALUES ($1, $2, $3, '[]'::jsonb, '[\"timeout\",\"remove_timeout\"]'::jsonb)",
    )
    .bind(policy_revision_id)
    .bind(policy_id)
    .bind(tenant_id)
    .execute(&mut **transaction)
    .await?;
    Ok(PinnedPolicy {
        policy_revision_id,
        protected_targets: Vec::new(),
    })
}

async fn insert_case(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    new_case: &NewModerationCase<'_>,
    case_id: Uuid,
    display_number: i64,
    now: OffsetDateTime,
) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query(
        "INSERT INTO moderation.case \
         (case_id, tenant_id, display_number, action_type, status, actor_provider_user_id, \
          target_user_id, target_label, reason, duration_seconds, expires_at, policy_revision_id, \
          idempotency_key, interaction_id, guild_id, application_id, incident_id, correlation_id, \
          created_at, updated_at) \
         VALUES ($1,$2,$3,$4,'Requested',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL,$16,$17,$17) \
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING",
    )
    .bind(case_id)
    .bind(new_case.tenant_id)
    .bind(display_number)
    .bind(new_case.action_type)
    .bind(new_case.actor_provider_user_id)
    .bind(new_case.target_user_id)
    .bind(new_case.target_label)
    .bind(new_case.reason)
    .bind(new_case.duration_seconds)
    .bind(new_case.expires_at)
    .bind(new_case.policy_revision_id)
    .bind(new_case.idempotency_key)
    .bind(new_case.interaction_id)
    .bind(new_case.guild_id)
    .bind(new_case.application_id)
    .bind(new_case.correlation_id)
    .bind(now)
    .execute(&mut **transaction)
    .await?
    .rows_affected()
        == 1;
    Ok(inserted)
}

async fn load_case_in(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    case_id: Uuid,
) -> Result<ModerationCaseRecord, sqlx::Error> {
    let sql = format!("SELECT {CASE_COLUMNS} FROM moderation.case WHERE case_id = $1");
    sqlx::query_as(&sql)
        .bind(case_id)
        .fetch_one(&mut **transaction)
        .await
}

async fn load_case_for_update(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    case_id: Uuid,
) -> Result<Option<ModerationCaseRecord>, sqlx::Error> {
    let sql = format!(
        "SELECT {CASE_COLUMNS} FROM moderation.case WHERE case_id = $1 FOR UPDATE"
    );
    sqlx::query_as(&sql)
        .bind(case_id)
        .fetch_optional(&mut **transaction)
        .await
}

async fn load_case_by_key(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    idempotency_key: &str,
) -> Result<ModerationCaseRecord, sqlx::Error> {
    let sql = format!(
        "SELECT {CASE_COLUMNS} FROM moderation.case WHERE tenant_id = $1 AND idempotency_key = $2"
    );
    sqlx::query_as(&sql)
        .bind(tenant_id)
        .bind(idempotency_key)
        .fetch_one(&mut **transaction)
        .await
}

async fn append_fact(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    record: &ModerationCaseRecord,
    fact_name: &str,
    extra: serde_json::Value,
    application_id: &str,
    now: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    if !LIVE_FACTS.contains(&fact_name) {
        return Err(sqlx::Error::Protocol(format!(
            "moderation fact {fact_name} is not live in this slice"
        )));
    }
    let sequence = next_sequence(transaction, record.case_id).await?;
    let mut payload = case_payload(record);
    if let Some(object) = extra.as_object() {
        for (key, value) in object {
            payload[key] = value.clone();
        }
    }
    sqlx::query(
        "INSERT INTO moderation.case_event \
         (case_event_id, case_id, sequence_number, event_name, payload, occurred_at) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(record.case_id)
    .bind(sequence)
    .bind(fact_name)
    .bind(&payload)
    .bind(now)
    .execute(&mut **transaction)
    .await?;
    insert_outbox(
        transaction,
        record,
        fact_name,
        &payload,
        application_id,
        now,
    )
    .await
}

async fn append_local_event(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    case_id: Uuid,
    event_name: &str,
    now: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    let sequence = next_sequence(transaction, case_id).await?;
    sqlx::query(
        "INSERT INTO moderation.case_event \
         (case_event_id, case_id, sequence_number, event_name, payload, occurred_at) \
         VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(case_id)
    .bind(sequence)
    .bind(event_name)
    .bind(now)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn next_sequence(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    case_id: Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM moderation.case_event WHERE case_id = $1",
    )
    .bind(case_id)
    .fetch_one(&mut **transaction)
    .await
}

fn case_payload(record: &ModerationCaseRecord) -> serde_json::Value {
    serde_json::json!({
        "case_id": record.case_id,
        "display_number": record.display_number,
        "action": record.action_type,
        "target_label": record.target_label,
        "target_user_id": record.target_user_id,
        "actor_provider_user_id": record.actor_provider_user_id,
        "reason": record.reason,
        "status": record.status,
        "expires_at": record.expires_at.map(time::OffsetDateTime::unix_timestamp),
    })
}

async fn insert_outbox(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    record: &ModerationCaseRecord,
    fact_name: &str,
    payload: &serde_json::Value,
    application_id: &str,
    now: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    let timestamp = now
        .format(&Rfc3339)
        .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
    let event_id = Uuid::now_v7();
    let event = EventEnvelope {
        event_id,
        schema_name: fact_name.to_owned(),
        schema_version: 1,
        schema_family: None,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id: application_id.to_owned(),
        tenant_id: Some(record.tenant_id),
        guild_id: Some(record.guild_id.clone()),
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id: record.correlation_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: record.correlation_id.to_string(),
            span_id: event_id.to_string(),
        },
        payload: payload.clone(),
    };
    let raw = serde_json::to_vec(&event).map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
    sqlx::query(
        "INSERT INTO moderation.event_outbox \
         (outbox_id, tenant_id, event_id, topic, partition_key, envelope) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(record.tenant_id)
    .bind(event_id)
    .bind(fact_name)
    .bind(record.tenant_id.to_string())
    .bind(raw)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

fn string_list(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default()
}
