use time::OffsetDateTime;
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

use super::{CaseProjection, GuildShellProjection, GuildShellSummary, QueryStore};

impl QueryStore {
    /// Idempotently applies a validated Installation fact to the rebuildable
    /// Query/Status projection and its own inbox.
    ///
    /// # Errors
    ///
    /// Returns a database error or protocol error for an incomplete fact.
    pub async fn apply_installation_projection(
        &self,
        event: &EventEnvelope,
        raw: &[u8],
        stream_position: &str,
        received_at: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let tenant_id = event
            .tenant_id
            .ok_or_else(|| sqlx::Error::Protocol("installation fact lacks tenant_id".to_owned()))?;
        let provider_guild_id = event
            .guild_id
            .as_deref()
            .ok_or_else(|| sqlx::Error::Protocol("installation fact lacks guild_id".to_owned()))?;
        let generation = event.payload["generation"].as_i64().ok_or_else(|| {
            sqlx::Error::Protocol("installation fact lacks generation".to_owned())
        })?;
        let state = event.payload["state"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("installation fact lacks state".to_owned()))?;
        let capabilities = event.payload["capabilities"].clone();
        let mut transaction = self.pool.begin().await?;
        let inserted = sqlx::query(
            "INSERT INTO query_status.event_inbox \
             (event_id, schema_name, raw_envelope, stream_position, received_at) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(event.event_id)
        .bind(&event.schema_name)
        .bind(raw)
        .bind(stream_position)
        .bind(received_at)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;
        if inserted {
            sqlx::query(
                "INSERT INTO query_status.guild_shell \
                 (tenant_id, installation_state, health_state, projection_watermark, probe_state, \
                  provider_guild_id, installation_generation, capabilities, last_event_id) \
                 VALUES ($1, $2, $2, $3, 'NotRun', $4, $5, $6, $7) \
                 ON CONFLICT (tenant_id) DO UPDATE SET \
                   installation_state = EXCLUDED.installation_state, \
                   health_state = EXCLUDED.health_state, \
                   projection_watermark = EXCLUDED.projection_watermark, \
                   provider_guild_id = EXCLUDED.provider_guild_id, \
                   installation_generation = EXCLUDED.installation_generation, \
                   capabilities = EXCLUDED.capabilities, last_event_id = EXCLUDED.last_event_id \
                 WHERE query_status.guild_shell.installation_generation IS NULL \
                    OR query_status.guild_shell.installation_generation <= EXCLUDED.installation_generation",
            )
            .bind(tenant_id)
            .bind(state)
            .bind(received_at)
            .bind(provider_guild_id)
            .bind(generation)
            .bind(capabilities)
            .bind(event.event_id)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await
    }
    /// Reads a shell under a provider guild predicate already bound from a
    /// live authenticated provider observation by Control API.
    ///
    /// # Errors
    ///
    /// Returns a database error if the tenant-bound projection cannot be read.
    pub async fn guild_shell_for_provider_guilds(
        &self,
        tenant_id: Uuid,
        provider_guild_ids: &[String],
    ) -> Result<Option<GuildShellProjection>, sqlx::Error> {
        sqlx::query_as(
            "SELECT shell.tenant_id, shell.provider_guild_id, shell.installation_state, \
                    shell.health_state, shell.installation_generation, shell.capabilities, \
                    shell.projection_watermark, shell.probe_state \
             FROM query_status.guild_shell AS shell \
             WHERE shell.tenant_id = $1 AND shell.provider_guild_id = ANY($2)",
        )
        .bind(tenant_id)
        .bind(provider_guild_ids)
        .fetch_optional(&self.pool)
        .await
    }
    /// Reads disposable installation summaries for provider guild ids the
    /// caller already bounded with an authenticated discovery observation.
    ///
    /// A missing row is not an error: the picker treats it as not enabled.
    ///
    /// # Errors
    ///
    /// Returns a database error if the projection cannot be read.
    pub async fn guild_shell_summaries_for_provider_guilds(
        &self,
        provider_guild_ids: &[String],
    ) -> Result<Vec<GuildShellSummary>, sqlx::Error> {
        sqlx::query_as(
            "SELECT DISTINCT ON (provider_guild_id) \
                    tenant_id, provider_guild_id, installation_state, health_state, \
                    projection_watermark \
             FROM query_status.guild_shell \
             WHERE provider_guild_id = ANY($1) \
             ORDER BY provider_guild_id, projection_watermark DESC",
        )
        .bind(provider_guild_ids)
        .fetch_all(&self.pool)
        .await
    }
    /// Count of shells currently `Degraded`. No tenant identifier is returned.
    ///
    /// # Errors
    ///
    /// Returns a database error if the count cannot be read.
    pub async fn degraded_shell_count(&self) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT count(*)::bigint FROM query_status.guild_shell \
             WHERE installation_state = 'Degraded'",
        )
        .fetch_one(&self.pool)
        .await
    }

    /// Idempotently applies one moderation fact to the rebuildable case summary.
    ///
    /// # Errors
    ///
    /// Returns a database error or protocol error for an incomplete fact.
    pub async fn apply_case_projection(
        &self,
        event: &EventEnvelope,
        raw: &[u8],
        stream_position: &str,
        received_at: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let tenant_id = event
            .tenant_id
            .ok_or_else(|| sqlx::Error::Protocol("moderation fact lacks tenant_id".to_owned()))?;
        let summary = case_summary(&event.payload)?;
        let mut transaction = self.pool.begin().await?;
        let inserted =
            insert_inbox(&mut transaction, event, raw, stream_position, received_at).await?;
        if inserted {
            upsert_case(
                &mut transaction,
                tenant_id,
                &summary,
                event.event_id,
                received_at,
            )
            .await?;
            compensate_cases(&mut transaction, &event.payload, received_at).await?;
        }
        transaction.commit().await
    }

    /// # Errors
    ///
    /// Returns a database error if the tenant-bound cases cannot be read.
    pub async fn cases_for_tenant(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<CaseProjection>, sqlx::Error> {
        sqlx::query_as(
            "SELECT case_id, tenant_id, display_number, action, target_label, target_user_id, \
                    actor_provider_user_id, reason, status, expires_at, projection_watermark \
             FROM query_status.moderation_case WHERE tenant_id = $1 \
             ORDER BY display_number DESC LIMIT 50",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
    }

    /// # Errors
    ///
    /// Returns a database error if the case cannot be read.
    pub async fn case_for_tenant(
        &self,
        tenant_id: Uuid,
        case_id: Uuid,
    ) -> Result<Option<CaseProjection>, sqlx::Error> {
        sqlx::query_as(
            "SELECT case_id, tenant_id, display_number, action, target_label, target_user_id, \
                    actor_provider_user_id, reason, status, expires_at, projection_watermark \
             FROM query_status.moderation_case WHERE tenant_id = $1 AND case_id = $2",
        )
        .bind(tenant_id)
        .bind(case_id)
        .fetch_optional(&self.pool)
        .await
    }
}

struct CaseSummary {
    case_id: Uuid,
    display_number: i64,
    action: String,
    target_label: String,
    target_user_id: String,
    actor_provider_user_id: String,
    reason: String,
    status: String,
    expires_at: Option<OffsetDateTime>,
}

fn case_summary(payload: &serde_json::Value) -> Result<CaseSummary, sqlx::Error> {
    let case_id = payload["case_id"]
        .as_str()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| sqlx::Error::Protocol("moderation fact lacks case_id".to_owned()))?;
    let display_number = payload["display_number"]
        .as_i64()
        .ok_or_else(|| sqlx::Error::Protocol("moderation fact lacks display_number".to_owned()))?;
    Ok(CaseSummary {
        case_id,
        display_number,
        action: required_string(payload, "action")?,
        target_label: required_string(payload, "target_label")?,
        target_user_id: required_string(payload, "target_user_id")?,
        actor_provider_user_id: required_string(payload, "actor_provider_user_id")?,
        reason: required_string(payload, "reason")?,
        status: required_string(payload, "status")?,
        expires_at: payload["expires_at"]
            .as_i64()
            .and_then(|seconds| OffsetDateTime::from_unix_timestamp(seconds).ok()),
    })
}

fn required_string(payload: &serde_json::Value, key: &str) -> Result<String, sqlx::Error> {
    payload[key]
        .as_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| sqlx::Error::Protocol(format!("moderation fact lacks {key}")))
}

async fn insert_inbox(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    event: &EventEnvelope,
    raw: &[u8],
    stream_position: &str,
    received_at: OffsetDateTime,
) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query(
        "INSERT INTO query_status.event_inbox \
         (event_id, schema_name, raw_envelope, stream_position, received_at) \
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING",
    )
    .bind(event.event_id)
    .bind(&event.schema_name)
    .bind(raw)
    .bind(stream_position)
    .bind(received_at)
    .execute(&mut **transaction)
    .await?
    .rows_affected()
        == 1;
    Ok(inserted)
}

async fn upsert_case(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    summary: &CaseSummary,
    event_id: Uuid,
    received_at: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO query_status.moderation_case \
         (case_id, tenant_id, display_number, action, target_label, target_user_id, \
          actor_provider_user_id, reason, status, expires_at, projection_watermark, last_event_id) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) \
         ON CONFLICT (case_id) DO UPDATE SET \
           status = EXCLUDED.status, reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, \
           projection_watermark = EXCLUDED.projection_watermark, last_event_id = EXCLUDED.last_event_id",
    )
    .bind(summary.case_id)
    .bind(tenant_id)
    .bind(summary.display_number)
    .bind(&summary.action)
    .bind(&summary.target_label)
    .bind(&summary.target_user_id)
    .bind(&summary.actor_provider_user_id)
    .bind(&summary.reason)
    .bind(&summary.status)
    .bind(summary.expires_at)
    .bind(received_at)
    .bind(event_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn compensate_cases(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    payload: &serde_json::Value,
    received_at: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    let Some(ids) = payload
        .get("compensated_case_ids")
        .and_then(serde_json::Value::as_array)
    else {
        return Ok(());
    };
    for id in ids {
        let Some(case_id) = id.as_str().and_then(|value| value.parse::<Uuid>().ok()) else {
            continue;
        };
        sqlx::query(
            "UPDATE query_status.moderation_case SET status = 'Compensated', \
             projection_watermark = $2 WHERE case_id = $1",
        )
        .bind(case_id)
        .bind(received_at)
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}
