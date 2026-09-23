//! Interaction ingress policy. Gateway decoding supplies owned DTOs here;
//! this crate never owns a Discord WebSocket or an arbitrary HTTP client.

use thiserror::Error;
use time::{Duration, OffsetDateTime};
use tobot_core::TenantContext;
use tobot_discord_adapter::{
    DiscordTransport, InteractionCallback, TransportError, acknowledgement_deadline_open,
};
use tobot_envelope::EventEnvelope;
use tobot_persistence::{
    EdgeStore, GatewayInteractionAcceptance, InteractionAcceptance, InteractionAcknowledgement,
};
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
    Expired,
}

pub struct AcknowledgementResult {
    pub outcome: IngressOutcome,
    /// Milliseconds spent in the Discord callback. Absent when no callback was sent.
    pub callback_ms: Option<u64>,
}

pub struct InteractionIngressRequest<'a> {
    pub context: TenantContext,
    pub callback: InteractionCallback,
    pub gateway_event: &'a EventEnvelope,
    pub gateway_raw: &'a [u8],
    pub interaction_event: &'a EventEnvelope,
    pub interaction_raw: &'a [u8],
    pub acknowledgement: ProbeAcknowledgement,
    pub now: OffsetDateTime,
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
    store: EdgeStore,
    transport: T,
}

impl<T> InteractionEdge<T>
where
    T: DiscordTransport,
{
    #[must_use]
    pub fn new(store: EdgeStore, transport: T) -> Self {
        Self { store, transport }
    }

    /// Reserves the duplicate key, sends one initial callback, then writes the
    /// outbox. The callback does not wait for fact publication. An interaction
    /// that is already three seconds old is not sent to Discord.
    ///
    /// # Errors
    ///
    /// Returns an error when the envelope is not an interaction fact, durable
    /// acceptance fails, or Discord cannot accept the initial callback.
    pub async fn accept_and_acknowledge(
        &self,
        request: InteractionIngressRequest<'_>,
    ) -> Result<AcknowledgementResult, IngressError> {
        let InteractionIngressRequest {
            context,
            callback,
            gateway_event,
            gateway_raw,
            interaction_event,
            interaction_raw,
            acknowledgement,
            now,
        } = request;
        if gateway_event.schema_name != "GatewayEventAccepted"
            || interaction_event.schema_name != "InteractionAccepted"
        {
            return Err(IngressError::InvalidEnvelope);
        }
        let acceptance = GatewayInteractionAcceptance {
            context,
            interaction_id: &callback.interaction_id.to_string(),
            receipt_id: Uuid::now_v7(),
            expires_at: now + INTERACTION_LIFETIME,
            gateway_event,
            gateway_raw,
            interaction_event,
            interaction_raw,
        };
        let now_ms = unix_millis(now);
        if !acknowledgement_deadline_open(callback.interaction_id, now_ms) {
            return self.reserve_without_callback(&acceptance, "Expired").await;
        }

        match self
            .store
            .reserve_gateway_interaction(&acceptance)
            .await
            .map_err(|_| IngressError::Persistence)?
        {
            InteractionAcceptance::Duplicate => Ok(silent(IngressOutcome::Duplicate)),
            InteractionAcceptance::Accepted => {
                let started = std::time::Instant::now();
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
                let callback_ms = elapsed_ms(started);

                match callback_result {
                    Ok((acknowledgement, outcome)) => {
                        self.store
                            .record_interaction_acknowledgement(
                                acceptance.receipt_id,
                                acknowledgement,
                                now,
                            )
                            .await
                            .map_err(|_| IngressError::Persistence)?;
                        self.store
                            .enqueue_gateway_interaction(&acceptance)
                            .await
                            .map_err(|_| IngressError::Persistence)?;
                        Ok(AcknowledgementResult {
                            outcome,
                            callback_ms: Some(callback_ms),
                        })
                    }
                    Err(error) => {
                        let _updated = self
                            .store
                            .record_interaction_acknowledgement_failure(
                                acceptance.receipt_id,
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

    async fn reserve_without_callback(
        &self,
        acceptance: &GatewayInteractionAcceptance<'_>,
        class: &str,
    ) -> Result<AcknowledgementResult, IngressError> {
        match self
            .store
            .reserve_gateway_interaction(acceptance)
            .await
            .map_err(|_| IngressError::Persistence)?
        {
            InteractionAcceptance::Duplicate => Ok(silent(IngressOutcome::Duplicate)),
            InteractionAcceptance::Accepted => {
                let _updated = self
                    .store
                    .record_interaction_acknowledgement_failure(acceptance.receipt_id, class)
                    .await
                    .map_err(|_| IngressError::Persistence)?;
                Ok(silent(IngressOutcome::Expired))
            }
        }
    }
}

fn silent(outcome: IngressOutcome) -> AcknowledgementResult {
    AcknowledgementResult {
        outcome,
        callback_ms: None,
    }
}

fn unix_millis(now: OffsetDateTime) -> u64 {
    u64::try_from(now.unix_timestamp_nanos() / 1_000_000).unwrap_or(u64::MAX)
}

fn elapsed_ms(started: std::time::Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
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
