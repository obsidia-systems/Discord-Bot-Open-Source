use time::OffsetDateTime;
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

use super::{GuildShellProjection, GuildShellSummary, QueryStore};

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
}
