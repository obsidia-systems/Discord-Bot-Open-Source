//! Transactional outbox relay. A failed bus publish deliberately leaves the
//! lease to expire; it never marks a fact as published on uncertain outcome.

use std::time::Instant;

use time::{Duration, OffsetDateTime};
use tobot_bus::{BusError, RedisStreamPublisher};
use tobot_envelope::{EnvelopeError, EventEnvelope};
use tobot_persistence::{EdgeRelayStore, InstallationStore, MessagingOutbox, ModerationStore};
use uuid::Uuid;

const LEASE_HEARTBEAT: std::time::Duration = std::time::Duration::from_secs(5);

/// A claim that is still publishing renews once this much wall time has passed.
#[must_use]
pub fn lease_renewal_due(elapsed: std::time::Duration) -> bool {
    elapsed >= LEASE_HEARTBEAT
}

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
    store: EdgeRelayStore,
    publisher: RedisStreamPublisher,
}

pub struct InstallationOutboxRelay {
    store: InstallationStore,
    publisher: RedisStreamPublisher,
}

pub struct ModerationOutboxRelay {
    store: ModerationStore,
    publisher: RedisStreamPublisher,
}

pub struct MessagingOutboxRelay {
    store: MessagingOutbox,
    publisher: RedisStreamPublisher,
}

impl MessagingOutboxRelay {
    #[must_use]
    pub fn new(store: MessagingOutbox, publisher: RedisStreamPublisher) -> Self {
        Self { store, publisher }
    }

    /// # Errors
    /// Returns the first database, envelope, or Redis error without acknowledging it.
    pub async fn relay_once(&self, now: OffsetDateTime) -> Result<usize, RelayError> {
        let token = Uuid::now_v7();
        let entries = self.store.claim(now, token).await?;
        let mut count = 0;
        for entry in entries {
            let parsed = EventEnvelope::parse_s0(&entry.envelope)?;
            self.publisher
                .publish(&parsed.event, &entry.envelope)
                .await?;
            self.store
                .published(&entry, token, OffsetDateTime::now_utc())
                .await?;
            count += 1;
        }
        Ok(count)
    }
}

impl EdgeOutboxRelay {
    #[must_use]
    pub fn new(store: EdgeRelayStore, publisher: RedisStreamPublisher) -> Self {
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
        let mut started = Instant::now();
        for entry in entries {
            if lease_renewal_due(started.elapsed()) {
                let extended = self
                    .store
                    .renew_edge_outbox_lease(
                        lease_token,
                        OffsetDateTime::now_utc() + Duration::seconds(15),
                    )
                    .await?;
                if extended == 0 {
                    break;
                }
                started = Instant::now();
            }
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

impl InstallationOutboxRelay {
    #[must_use]
    pub fn new(store: InstallationStore, publisher: RedisStreamPublisher) -> Self {
        Self { store, publisher }
    }

    /// # Errors
    ///
    /// Returns the first persistence, envelope, or Redis failure without
    /// acknowledging uncertain publication.
    pub async fn relay_once(
        &self,
        now: OffsetDateTime,
        batch_size: i64,
    ) -> Result<usize, RelayError> {
        let lease_token = Uuid::now_v7();
        let entries = self
            .store
            .claim_installation_outbox(now, now + Duration::seconds(15), lease_token, batch_size)
            .await?;
        let mut published = 0;
        let mut started = Instant::now();
        for entry in entries {
            if lease_renewal_due(started.elapsed()) {
                let extended = self
                    .store
                    .renew_installation_outbox_lease(
                        lease_token,
                        OffsetDateTime::now_utc() + Duration::seconds(15),
                    )
                    .await?;
                if extended == 0 {
                    break;
                }
                started = Instant::now();
            }
            let parsed = EventEnvelope::parse_s0(&entry.envelope)?;
            self.publisher
                .publish(&parsed.event, &entry.envelope)
                .await?;
            if self
                .store
                .mark_installation_outbox_published(
                    entry.outbox_id,
                    lease_token,
                    entry.fencing_token,
                    now,
                )
                .await?
            {
                published += 1;
            }
        }
        Ok(published)
    }
}

impl ModerationOutboxRelay {
    #[must_use]
    pub fn new(store: ModerationStore, publisher: RedisStreamPublisher) -> Self {
        Self { store, publisher }
    }

    /// # Errors
    ///
    /// Returns the first persistence, envelope, or Redis failure without
    /// acknowledging uncertain publication.
    pub async fn relay_once(
        &self,
        now: OffsetDateTime,
        batch_size: i64,
    ) -> Result<usize, RelayError> {
        let lease_token = Uuid::now_v7();
        let entries = self
            .store
            .claim_moderation_outbox(now, now + Duration::seconds(15), lease_token, batch_size)
            .await?;
        let mut published = 0;
        let mut started = Instant::now();
        for entry in entries {
            if lease_renewal_due(started.elapsed()) {
                let extended = self
                    .store
                    .renew_moderation_outbox_lease(
                        lease_token,
                        OffsetDateTime::now_utc() + Duration::seconds(15),
                    )
                    .await?;
                if extended == 0 {
                    break;
                }
                started = Instant::now();
            }
            let parsed = EventEnvelope::parse_s0(&entry.envelope)?;
            self.publisher
                .publish(&parsed.event, &entry.envelope)
                .await?;
            if self
                .store
                .mark_moderation_outbox_published(
                    entry.outbox_id,
                    lease_token,
                    entry.fencing_token,
                    now,
                )
                .await?
            {
                published += 1;
            }
        }
        Ok(published)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LeaseDecision {
    Owned,
    Takeover,
    Rejected,
}

/// A live foreign lease is rejected. An expired or empty lease can be taken over.
#[must_use]
pub fn lease_decision(holder: Option<Uuid>, token: Uuid, lease_expired: bool) -> LeaseDecision {
    match holder {
        Some(current) if current == token => LeaseDecision::Owned,
        Some(_) if lease_expired => LeaseDecision::Takeover,
        Some(_) => LeaseDecision::Rejected,
        None => LeaseDecision::Takeover,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_lease_can_be_taken_over_and_a_live_lease_cannot() {
        let owner = Uuid::now_v7();
        let other = Uuid::now_v7();
        assert_eq!(
            lease_decision(Some(owner), owner, false),
            LeaseDecision::Owned
        );
        assert_eq!(
            lease_decision(Some(owner), other, false),
            LeaseDecision::Rejected
        );
        assert_eq!(
            lease_decision(Some(owner), other, true),
            LeaseDecision::Takeover
        );
        assert_eq!(lease_decision(None, other, false), LeaseDecision::Takeover);
    }

    #[test]
    fn lease_renewal_waits_until_the_batch_is_still_in_flight() {
        assert!(!lease_renewal_due(std::time::Duration::from_millis(100)));
        assert!(lease_renewal_due(std::time::Duration::from_secs(5)));
    }
}
