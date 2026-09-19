//! Interaction ingress policy. Gateway decoding supplies owned DTOs here;
//! this crate never owns a Discord WebSocket or an arbitrary HTTP client.

use thiserror::Error;
use time::{Duration, OffsetDateTime};
use tobot_core::TenantContext;
use tobot_discord_adapter::{DiscordTransport, InteractionCallback, TransportError};
use tobot_envelope::EventEnvelope;
use tobot_persistence::{InteractionAcceptance, InteractionAcknowledgement, Store};
use uuid::Uuid;

const INTERACTION_LIFETIME: Duration = Duration::minutes(15);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProbeAcknowledgement {
    Immediate,
    Deferred,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IngressOutcome {
    Acknowledged,
    Deferred,
    Duplicate,
}

#[derive(Debug, Error)]
pub enum IngressError {
    #[error("interaction fact is not an InteractionAccepted envelope")]
    InvalidEnvelope,
    #[error("durable interaction acceptance failed")]
    Persistence,
    #[error("initial Discord callback failed: {0}")]
    Transport(#[from] TransportError),
}

pub struct InteractionEdge<T> {
    store: Store,
    transport: T,
}

impl<T> InteractionEdge<T>
where
    T: DiscordTransport,
{
    #[must_use]
    pub fn new(store: Store, transport: T) -> Self {
        Self { store, transport }
    }

    /// Commits the receipt and fact before attempting a single initial
    /// Discord callback. Duplicate ingress is intentionally silent and never
    /// causes another callback.
    ///
    /// # Errors
    ///
    /// Returns an error when the envelope is not an interaction fact, durable
    /// acceptance fails, or Discord cannot accept the initial callback.
    pub async fn accept_and_acknowledge(
        &self,
        context: TenantContext,
        callback: InteractionCallback,
        event: &EventEnvelope,
        raw: &[u8],
        acknowledgement: ProbeAcknowledgement,
        now: OffsetDateTime,
    ) -> Result<IngressOutcome, IngressError> {
        if event.schema_name != "InteractionAccepted" {
            return Err(IngressError::InvalidEnvelope);
        }

        let receipt_id = Uuid::now_v7();
        match self
            .store
            .accept_interaction_event(
                context,
                &callback.interaction_id.to_string(),
                receipt_id,
                now + INTERACTION_LIFETIME,
                event,
                raw,
            )
            .await
            .map_err(|_| IngressError::Persistence)?
        {
            InteractionAcceptance::Duplicate => Ok(IngressOutcome::Duplicate),
            InteractionAcceptance::Accepted => {
                let callback_result = match acknowledgement {
                    ProbeAcknowledgement::Immediate => self
                        .transport
                        .respond_to_interaction(callback)
                        .await
                        .map(|()| {
                            (
                                InteractionAcknowledgement::Acknowledged,
                                IngressOutcome::Acknowledged,
                            )
                        }),
                    ProbeAcknowledgement::Deferred => {
                        self.transport.defer_interaction(callback).await.map(|()| {
                            (
                                InteractionAcknowledgement::Deferred,
                                IngressOutcome::Deferred,
                            )
                        })
                    }
                };

                match callback_result {
                    Ok((acknowledgement, outcome)) => {
                        self.store
                            .record_interaction_acknowledgement(receipt_id, acknowledgement, now)
                            .await
                            .map_err(|_| IngressError::Persistence)?;
                        Ok(outcome)
                    }
                    Err(error) => {
                        let _updated = self
                            .store
                            .record_interaction_acknowledgement_failure(
                                receipt_id,
                                error_class(&error),
                            )
                            .await
                            .map_err(|_| IngressError::Persistence)?;
                        Err(IngressError::Transport(error))
                    }
                }
            }
        }
    }
}

const fn error_class(error: &TransportError) -> &'static str {
    match error {
        TransportError::RateLimited { .. } => "RateLimited",
        TransportError::Rejected { .. } => "Rejected",
        TransportError::Unavailable(_) => "Unavailable",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_error_classes_do_not_leak_provider_detail() {
        assert_eq!(
            error_class(&TransportError::Unavailable("provider secret".to_owned())),
            "Unavailable"
        );
        assert_eq!(
            error_class(&TransportError::RateLimited { retry_after_ms: 10 }),
            "RateLimited"
        );
    }
}
