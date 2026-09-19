//! Private owner stores. The migration is embedded for reviewable, explicit
//! deployment; application binaries never auto-migrate production databases.

use sqlx::{PgPool, postgres::PgPoolOptions};
use time::OffsetDateTime;
use tobot_core::{TenantContext, TenantId};
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

#[derive(Debug, sqlx::FromRow)]
pub struct ClaimedOutboxEntry {
    pub outbox_id: Uuid,
    pub event_id: Uuid,
    pub envelope: Vec<u8>,
    pub fencing_token: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InteractionAcceptance {
    Accepted,
    Duplicate,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InteractionAcknowledgement {
    Acknowledged,
    Deferred,
}

pub struct GatewayInteractionAcceptance<'a> {
    pub context: TenantContext,
    pub interaction_id: &'a str,
    pub receipt_id: Uuid,
    pub expires_at: OffsetDateTime,
    pub gateway_event: &'a EventEnvelope,
    pub gateway_raw: &'a [u8],
    pub interaction_event: &'a EventEnvelope,
    pub interaction_raw: &'a [u8],
}

impl Store {
    /// # Errors
    ///
    /// Returns the driver error if a connection cannot be established.
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    /// # Errors
    ///
    /// Returns a migration error if a reviewed migration cannot be applied.
    pub async fn migrate(&self) -> Result<(), sqlx::migrate::MigrateError> {
        MIGRATOR.run(&self.pool).await
    }

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

    /// Atomically accepts the Gateway technical receipt, its Gateway fact,
    /// the interaction receipt, and its interaction fact. The technical
    /// receipt is the authoritative duplicate key; wall-clock time and local
    /// UUIDs cannot be used for Gateway deduplication.
    ///
    /// # Errors
    ///
    /// Returns an error if the supplied Gateway identity is incomplete or any
    /// member of the durable acceptance transaction cannot be committed.
    pub async fn accept_gateway_interaction(
        &self,
        request: GatewayInteractionAcceptance<'_>,
    ) -> Result<InteractionAcceptance, sqlx::Error> {
        let GatewayInteractionAcceptance {
            context,
            interaction_id,
            receipt_id,
            expires_at,
            gateway_event,
            gateway_raw,
            interaction_event,
            interaction_raw,
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

        for (event, raw) in [
            (gateway_event, gateway_raw),
            (interaction_event, interaction_raw),
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
        Ok(InteractionAcceptance::Accepted)
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

    #[must_use]
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Claims a bounded batch. The supplied time must come from the Clock
    /// port; this store never decides business time itself.
    ///
    /// # Errors
    ///
    /// Returns a database error if the lock/claim transaction fails.
    pub async fn claim_edge_outbox(
        &self,
        now: OffsetDateTime,
        lease_until: OffsetDateTime,
        lease_token: Uuid,
        limit: i64,
    ) -> Result<Vec<ClaimedOutboxEntry>, sqlx::Error> {
        sqlx::query_as(
            "WITH candidate AS (\
               SELECT outbox_id FROM edge.event_outbox\
               WHERE published_at IS NULL AND available_at <= $1\
                 AND (lease_expires_at IS NULL OR lease_expires_at < $1)\
               ORDER BY available_at, outbox_id LIMIT $2 FOR UPDATE SKIP LOCKED\
             )\
             UPDATE edge.event_outbox AS outbox\
             SET lease_token = $3, lease_expires_at = $4, fencing_token = outbox.fencing_token + 1,\
                 publish_attempts = outbox.publish_attempts + 1\
             FROM candidate\
             WHERE outbox.outbox_id = candidate.outbox_id\
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
    /// Returns a database error if the fenced publication receipt cannot be
    /// recorded. A stale owner updates zero rows.
    pub async fn mark_edge_outbox_published(
        &self,
        outbox_id: Uuid,
        lease_token: Uuid,
        fencing_token: i64,
        published_at: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE edge.event_outbox SET published_at = $4, lease_token = NULL, lease_expires_at = NULL\
             WHERE outbox_id = $1 AND lease_token = $2 AND fencing_token = $3 AND published_at IS NULL",
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

/// Converts a persisted opaque tenant id only after a caller already has a
/// server-authenticated context. Bare database identifiers are never exposed
/// as an authorization API.
#[must_use]
pub fn bound_tenant_id(context: TenantContext) -> TenantId {
    context.tenant_id
}
