use time::OffsetDateTime;
use tobot_core::TenantContext;
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

use super::{
    EdgeStore, GatewayInteractionAcceptance, GatewaySessionRecord, InteractionAcceptance,
    InteractionAcknowledgement, TenantId,
};

impl EdgeStore {
    /// Atomically reserves the interaction receipt. A duplicate returns false
    /// and must never create another initial Discord acknowledgement.
    ///
    /// # Errors
    ///
    /// Returns a database error if the reservation cannot be persisted.
    pub async fn reserve_interaction(
        &self,
        context: TenantContext,
        interaction_id: &str,
        receipt_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "INSERT INTO edge.interaction_receipt (receipt_id, tenant_id, interaction_id, state) \
             VALUES ($1, $2, $3, 'Reserved') ON CONFLICT (tenant_id, interaction_id) DO NOTHING",
        )
        .bind(receipt_id)
        .bind(context.tenant_id.as_uuid())
        .bind(interaction_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
    /// Atomically records a new interaction receipt and its durable fact.
    /// The initial Discord callback deliberately happens after this commit.
    ///
    /// # Errors
    ///
    /// Returns an error if either the receipt, inbox, or outbox write cannot
    /// be committed together.
    pub async fn accept_interaction_event(
        &self,
        context: TenantContext,
        interaction_id: &str,
        receipt_id: Uuid,
        expires_at: OffsetDateTime,
        event: &EventEnvelope,
        raw: &[u8],
    ) -> Result<InteractionAcceptance, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let receipt_inserted = sqlx::query(
            "INSERT INTO edge.interaction_receipt \
             (receipt_id, tenant_id, interaction_id, state, expires_at) \
             VALUES ($1, $2, $3, 'Reserved', $4) \
             ON CONFLICT (tenant_id, interaction_id) DO NOTHING",
        )
        .bind(receipt_id)
        .bind(context.tenant_id.as_uuid())
        .bind(interaction_id)
        .bind(expires_at)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;

        if !receipt_inserted {
            transaction.commit().await?;
            return Ok(InteractionAcceptance::Duplicate);
        }

        let inbox_inserted = sqlx::query(
            "INSERT INTO edge.event_inbox (event_id, tenant_id, schema_name, schema_version, raw_envelope) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(event.event_id)
        .bind(context.tenant_id.as_uuid())
        .bind(&event.schema_name)
        .bind(i32::from(event.schema_version))
        .bind(raw)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;

        if !inbox_inserted {
            return Err(sqlx::Error::Protocol(
                "interaction receipt has conflicting event identity".to_owned(),
            ));
        }

        sqlx::query(
            "INSERT INTO edge.event_outbox (outbox_id, tenant_id, event_id, topic, partition_key, envelope) \
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(Uuid::now_v7())
        .bind(context.tenant_id.as_uuid())
        .bind(event.event_id)
        .bind(&event.schema_name)
        .bind(context.tenant_id.as_uuid())
        .bind(raw)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;

        Ok(InteractionAcceptance::Accepted)
    }
    /// Reserves the Gateway and interaction receipts without writing the
    /// outbox. The acknowledgement can then run before fact publication.
    /// The technical receipt is the authoritative duplicate key.
    ///
    /// # Errors
    ///
    /// Returns an error if the supplied Gateway identity is incomplete or the
    /// reservation cannot be committed.
    pub async fn reserve_gateway_interaction(
        &self,
        request: &GatewayInteractionAcceptance<'_>,
    ) -> Result<InteractionAcceptance, sqlx::Error> {
        let GatewayInteractionAcceptance {
            context,
            interaction_id,
            receipt_id,
            expires_at,
            gateway_event,
            ..
        } = request;
        let (Some(shard_id), Some(session_id), Some(gateway_sequence)) = (
            gateway_event.shard_id,
            gateway_event.session_id.as_deref(),
            gateway_event.gateway_sequence,
        ) else {
            return Err(sqlx::Error::Protocol(
                "gateway event is missing its technical identity".to_owned(),
            ));
        };
        let mut transaction = self.pool.begin().await?;
        let gateway_inserted = sqlx::query(
            "INSERT INTO edge.gateway_receipt \
             (application_id, shard_id, session_id, gateway_sequence, event_id) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        )
        .bind(&gateway_event.application_id)
        .bind(i32::try_from(shard_id).map_err(|_| {
            sqlx::Error::Protocol("gateway shard id exceeds PostgreSQL integer range".to_owned())
        })?)
        .bind(session_id)
        .bind(i64::try_from(gateway_sequence).map_err(|_| {
            sqlx::Error::Protocol("gateway sequence exceeds PostgreSQL bigint range".to_owned())
        })?)
        .bind(gateway_event.event_id)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;
        if !gateway_inserted {
            transaction.commit().await?;
            return Ok(InteractionAcceptance::Duplicate);
        }

        let interaction_inserted = sqlx::query(
            "INSERT INTO edge.interaction_receipt \
             (receipt_id, tenant_id, interaction_id, state, expires_at) \
             VALUES ($1, $2, $3, 'Reserved', $4) \
             ON CONFLICT (tenant_id, interaction_id) DO NOTHING",
        )
        .bind(receipt_id)
        .bind(context.tenant_id.as_uuid())
        .bind(interaction_id)
        .bind(expires_at)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;
        if !interaction_inserted {
            return Err(sqlx::Error::Protocol(
                "gateway receipt has conflicting interaction identity".to_owned(),
            ));
        }
        transaction.commit().await?;
        Ok(InteractionAcceptance::Accepted)
    }
    /// Writes the Gateway and interaction facts after the initial callback.
    /// Publication is not on the acknowledgement path.
    ///
    /// # Errors
    ///
    /// Returns an error if either fact cannot be committed.
    pub async fn enqueue_gateway_interaction(
        &self,
        request: &GatewayInteractionAcceptance<'_>,
    ) -> Result<(), sqlx::Error> {
        let GatewayInteractionAcceptance {
            context,
            gateway_event,
            gateway_raw,
            interaction_event,
            interaction_raw,
            ..
        } = request;
        let mut transaction = self.pool.begin().await?;
        for (event, raw) in [
            (*gateway_event, *gateway_raw),
            (*interaction_event, *interaction_raw),
        ] {
            let inbox_inserted = sqlx::query(
                "INSERT INTO edge.event_inbox (event_id, tenant_id, schema_name, schema_version, raw_envelope) \
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING",
            )
            .bind(event.event_id)
            .bind(context.tenant_id.as_uuid())
            .bind(&event.schema_name)
            .bind(i32::from(event.schema_version))
            .bind(raw)
            .execute(&mut *transaction)
            .await?
            .rows_affected()
                == 1;
            if !inbox_inserted {
                return Err(sqlx::Error::Protocol(
                    "gateway receipt has conflicting event identity".to_owned(),
                ));
            }
            sqlx::query(
                "INSERT INTO edge.event_outbox (outbox_id, tenant_id, event_id, topic, partition_key, envelope) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(Uuid::now_v7())
            .bind(context.tenant_id.as_uuid())
            .bind(event.event_id)
            .bind(&event.schema_name)
            .bind(context.tenant_id.as_uuid())
            .bind(raw)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(())
    }
    /// Stores one relevant Gateway dispatch in the Edge inbox and outbox.
    /// A repeated application, shard, session, and sequence is not a second fact.
    /// Ready and Resume have no tenant, so those rows leave `tenant_id` empty.
    ///
    /// # Errors
    ///
    /// Returns an error when the technical identity is incomplete or the
    /// receipt cannot be committed with its outbox row.
    pub async fn accept_gateway_dispatch(
        &self,
        event: &EventEnvelope,
        raw: &[u8],
    ) -> Result<bool, sqlx::Error> {
        let (Some(shard_id), Some(session_id), Some(gateway_sequence)) = (
            event.shard_id,
            event.session_id.as_deref(),
            event.gateway_sequence,
        ) else {
            return Err(sqlx::Error::Protocol(
                "gateway dispatch is missing its technical identity".to_owned(),
            ));
        };
        let shard_id = i32::try_from(shard_id).map_err(|_| {
            sqlx::Error::Protocol("gateway shard id exceeds PostgreSQL integer range".to_owned())
        })?;
        let gateway_sequence = i64::try_from(gateway_sequence).map_err(|_| {
            sqlx::Error::Protocol("gateway sequence exceeds PostgreSQL bigint range".to_owned())
        })?;
        let partition_key = event
            .guild_id
            .clone()
            .unwrap_or_else(|| event.application_id.clone());
        let mut transaction = self.pool.begin().await?;
        let inserted = sqlx::query(
            "INSERT INTO edge.gateway_receipt \
             (application_id, shard_id, session_id, gateway_sequence, event_id) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
        )
        .bind(&event.application_id)
        .bind(shard_id)
        .bind(session_id)
        .bind(gateway_sequence)
        .bind(event.event_id)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;
        if !inserted {
            transaction.commit().await?;
            return Ok(false);
        }
        sqlx::query(
            "INSERT INTO edge.event_inbox \
             (event_id, tenant_id, schema_name, schema_version, raw_envelope) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(event.event_id)
        .bind(event.tenant_id)
        .bind(&event.schema_name)
        .bind(i32::from(event.schema_version))
        .bind(raw)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO edge.event_outbox \
             (outbox_id, tenant_id, event_id, topic, partition_key, envelope) \
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(Uuid::now_v7())
        .bind(event.tenant_id)
        .bind(event.event_id)
        .bind(&event.schema_name)
        .bind(partition_key)
        .bind(raw)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(true)
    }
    /// Loads the shard session saved from the last Ready or Resume.
    ///
    /// # Errors
    ///
    /// Returns a database error if the session row cannot be read.
    pub async fn load_gateway_session(
        &self,
        shard_id: i32,
    ) -> Result<Option<GatewaySessionRecord>, sqlx::Error> {
        sqlx::query_as(
            "SELECT session_id, sequence, resume_gateway_url \
             FROM edge.gateway_session WHERE shard_id = $1",
        )
        .bind(shard_id)
        .fetch_optional(&self.pool)
        .await
    }
    /// Replaces the shard's resumable session. Sequence is the last dispatch
    /// the process has observed.
    ///
    /// # Errors
    ///
    /// Returns a database error if the session cannot be saved.
    pub async fn save_gateway_session(
        &self,
        shard_id: i32,
        session_id: &str,
        sequence: i64,
        resume_gateway_url: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO edge.gateway_session \
             (shard_id, session_id, sequence, resume_gateway_url, updated_at) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (shard_id) DO UPDATE \
             SET session_id = EXCLUDED.session_id, \
                 sequence = EXCLUDED.sequence, \
                 resume_gateway_url = EXCLUDED.resume_gateway_url, \
                 updated_at = EXCLUDED.updated_at",
        )
        .bind(shard_id)
        .bind(session_id)
        .bind(sequence)
        .bind(resume_gateway_url)
        .bind(OffsetDateTime::now_utc())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Forgets a session Discord has invalidated so the next connect Identifies.
    ///
    /// # Errors
    ///
    /// Returns a database error if the session row cannot be removed.
    pub async fn delete_gateway_session(&self, shard_id: i32) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM edge.gateway_session WHERE shard_id = $1")
            .bind(shard_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    /// Records a successful initial interaction callback exactly once. The
    /// expected Reserved state makes a stale/duplicate caller harmless.
    ///
    /// # Errors
    ///
    /// Returns a database error if the acknowledgement receipt cannot be
    /// updated.
    pub async fn record_interaction_acknowledgement(
        &self,
        receipt_id: Uuid,
        acknowledgement: InteractionAcknowledgement,
        acknowledged_at: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let state = match acknowledgement {
            InteractionAcknowledgement::Acknowledged => "Acknowledged",
            InteractionAcknowledgement::Deferred => "Deferred",
        };
        let result = sqlx::query(
            "UPDATE edge.interaction_receipt \
             SET state = $2, acknowledgement_at = $3, acknowledgement_error = NULL \
             WHERE receipt_id = $1 AND state = 'Reserved' AND expires_at > $3",
        )
        .bind(receipt_id)
        .bind(state)
        .bind(acknowledged_at)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
    /// Leaves the durable receipt visible for reconciliation without storing
    /// raw provider errors or credentials.
    ///
    /// # Errors
    ///
    /// Returns a database error if the failed acknowledgement cannot be
    /// recorded.
    pub async fn record_interaction_acknowledgement_failure(
        &self,
        receipt_id: Uuid,
        error_class: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE edge.interaction_receipt SET acknowledgement_error = $2 \
             WHERE receipt_id = $1 AND state = 'Reserved'",
        )
        .bind(receipt_id)
        .bind(error_class)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
    /// Resolves only an active guild installation. Gateway payload fields are
    /// correlation data, never authorization by themselves.
    ///
    /// # Errors
    ///
    /// Returns a database error if the installation context cannot be read.
    pub async fn resolve_active_guild_tenant(
        &self,
        application_id: &str,
        guild_id: &str,
    ) -> Result<Option<TenantContext>, sqlx::Error> {
        let tenant_id = sqlx::query_scalar::<_, Uuid>(
            "SELECT tenant_id FROM installation.tenant \
             WHERE tenant_type = 'Guild' AND provider_tenant_ref = $1 \
               AND application_id = $2 AND state = 'Active'",
        )
        .bind(guild_id)
        .bind(application_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(tenant_id.map(|tenant_id| TenantContext {
            tenant_id: TenantId::from_uuid(tenant_id),
            tenant_type: tobot_core::TenantType::Guild,
        }))
    }
    /// Writes the receipt and its outbox fact in one transaction. The tenant
    /// context is bound before SQL is issued.
    ///
    /// # Errors
    ///
    /// Returns a database error if either sibling record cannot be committed.
    pub async fn accept_edge_event(
        &self,
        context: TenantContext,
        event: &EventEnvelope,
        raw: &[u8],
    ) -> Result<bool, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let inserted = sqlx::query(
            "INSERT INTO edge.event_inbox (event_id, tenant_id, schema_name, schema_version, raw_envelope) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(event.event_id)
        .bind(context.tenant_id.as_uuid())
        .bind(&event.schema_name)
        .bind(i32::from(event.schema_version))
        .bind(raw)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;
        if inserted {
            sqlx::query(
                "INSERT INTO edge.event_outbox (outbox_id, tenant_id, event_id, topic, partition_key, envelope) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(Uuid::now_v7())
            .bind(context.tenant_id.as_uuid())
            .bind(event.event_id)
            .bind(&event.schema_name)
            .bind(context.tenant_id.as_uuid())
            .bind(raw)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(inserted)
    }
}
