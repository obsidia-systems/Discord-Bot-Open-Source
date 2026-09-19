//! Transactional outbox relay. A failed bus publish deliberately leaves the
//! lease to expire; it never marks a fact as published on uncertain outcome.

use time::{Duration, OffsetDateTime};
use tobot_bus::{BusError, RedisStreamPublisher};
use tobot_envelope::{EnvelopeError, EventEnvelope};
use tobot_persistence::Store;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum RelayError {
    #[error(transparent)]
    Store(#[from] sqlx::Error),
    #[error(transparent)]
    Envelope(#[from] EnvelopeError),
    #[error(transparent)]
    Bus(#[from] BusError),
}

pub struct EdgeOutboxRelay {
    store: Store,
    publisher: RedisStreamPublisher,
}

impl EdgeOutboxRelay {
    #[must_use]
    pub fn new(store: Store, publisher: RedisStreamPublisher) -> Self {
        Self { store, publisher }
    }

    /// Relays at most `batch_size` events at the supplied Clock-port instant.
    ///
    /// # Errors
    ///
    /// Returns the first persistence, parse, or Redis failure without marking
    /// the current or later entries as published.
    pub async fn relay_once(
        &self,
        now: OffsetDateTime,
        batch_size: i64,
    ) -> Result<usize, RelayError> {
        let lease_token = Uuid::now_v7();
        let entries = self
            .store
            .claim_edge_outbox(now, now + Duration::seconds(15), lease_token, batch_size)
            .await?;
        let mut published = 0;
        for entry in entries {
            let parsed = EventEnvelope::parse_s0(&entry.envelope)?;
            self.publisher
                .publish(&parsed.event, &entry.envelope)
                .await?;
            if self
                .store
                .mark_edge_outbox_published(entry.outbox_id, lease_token, entry.fencing_token, now)
                .await?
            {
                published += 1;
            }
        }
        Ok(published)
    }
}
