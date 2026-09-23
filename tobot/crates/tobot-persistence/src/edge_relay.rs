use time::OffsetDateTime;
use uuid::Uuid;

use super::{ClaimedOutboxEntry, EDGE_RELAY_GAUGE, EdgeRelayStore, RelayGauge};

impl EdgeRelayStore {
    /// Aggregate edge-outbox age. The caller supplies Clock-port time.
    ///
    /// # Errors
    ///
    /// Returns a database error if the aggregate cannot be read.
    pub async fn edge_relay_gauge(&self, now: OffsetDateTime) -> Result<RelayGauge, sqlx::Error> {
        super::relay_gauge(&self.pool, EDGE_RELAY_GAUGE, now).await
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
            "WITH candidate AS ( \
               SELECT outbox_id FROM edge.event_outbox \
               WHERE published_at IS NULL AND available_at <= $1 \
                 AND (lease_expires_at IS NULL OR lease_expires_at < $1) \
               ORDER BY available_at, outbox_id LIMIT $2 FOR UPDATE SKIP LOCKED \
             ) \
             UPDATE edge.event_outbox AS outbox \
             SET lease_token = $3, lease_expires_at = $4, fencing_token = outbox.fencing_token + 1, \
                 publish_attempts = outbox.publish_attempts + 1 \
             FROM candidate \
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
            "UPDATE edge.event_outbox SET published_at = $4, lease_token = NULL, lease_expires_at = NULL \
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
    /// Extends the Edge lease while the same owner is still publishing.
    /// A stolen lease updates nothing.
    ///
    /// # Errors
    ///
    /// Returns a database error if the lease cannot be extended.
    pub async fn renew_edge_outbox_lease(
        &self,
        lease_token: Uuid,
        lease_until: OffsetDateTime,
    ) -> Result<u64, sqlx::Error> {
        super::renew_outbox_lease(
            &self.pool,
            "UPDATE edge.event_outbox SET lease_expires_at = $2 \
             WHERE lease_token = $1 AND published_at IS NULL",
            lease_token,
            lease_until,
        )
        .await
    }
}
