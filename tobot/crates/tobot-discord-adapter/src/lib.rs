//! Discord SDK containment. Only typed, S0-approved operations cross this
//! boundary; domain crates never receive Twilight values.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use twilight_http::{api_error::ApiError, error::ErrorType};
use twilight_model::{
    channel::message::MessageFlags,
    http::interaction::{InteractionResponse, InteractionResponseData, InteractionResponseType},
    id::{
        Id,
        marker::{ApplicationMarker, InteractionMarker},
    },
};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InteractionCallback {
    pub application_id: u64,
    pub interaction_id: u64,
    pub interaction_token: String,
    pub ephemeral: bool,
}

#[derive(Debug, Error)]
pub enum TransportError {
    #[error("Discord request was rate limited; retry after {retry_after_ms} ms")]
    RateLimited { retry_after_ms: u64 },
    #[error("Discord rejected the typed operation: {status}")]
    Rejected { status: u16 },
    #[error("Discord transport failed: {0}")]
    Unavailable(String),
}

#[async_trait]
pub trait DiscordTransport: Send + Sync {
    async fn respond_to_interaction(
        &self,
        request: InteractionCallback,
    ) -> Result<(), TransportError>;
    async fn defer_interaction(&self, request: InteractionCallback) -> Result<(), TransportError>;
}

/// Holds the bot-token HTTP client privately. Concrete response mapping is
/// added only to the two trait methods; there is intentionally no `client()`
/// escape hatch for arbitrary REST paths.
pub struct TwilightTransport {
    client: twilight_http::Client,
}

impl TwilightTransport {
    #[must_use]
    pub fn new(bot_token: String) -> Self {
        Self {
            client: twilight_http::Client::new(bot_token),
        }
    }

    fn response_data(ephemeral: bool) -> InteractionResponseData {
        InteractionResponseData {
            flags: ephemeral.then_some(MessageFlags::EPHEMERAL),
            ..InteractionResponseData::default()
        }
    }

    fn ids(
        request: &InteractionCallback,
    ) -> Result<(Id<ApplicationMarker>, Id<InteractionMarker>), TransportError> {
        let application_id = Id::new_checked(request.application_id)
            .ok_or(TransportError::Rejected { status: 400 })?;
        let interaction_id = Id::new_checked(request.interaction_id)
            .ok_or(TransportError::Rejected { status: 400 })?;

        if request.interaction_token.is_empty() {
            return Err(TransportError::Rejected { status: 400 });
        }

        Ok((application_id, interaction_id))
    }

    async fn create_response(
        &self,
        request: InteractionCallback,
        response: InteractionResponse,
    ) -> Result<(), TransportError> {
        let (application_id, interaction_id) = Self::ids(&request)?;

        self.client
            .interaction(application_id)
            .create_response(interaction_id, &request.interaction_token, &response)
            .await
            .map(|_| ())
            .map_err(|error| Self::map_error(&error))
    }

    fn map_error(error: &twilight_http::Error) -> TransportError {
        match error.kind() {
            ErrorType::Response {
                error: ApiError::Ratelimited(rate_limit),
                ..
            } => TransportError::RateLimited {
                retry_after_ms: Self::retry_after_ms(rate_limit.retry_after),
            },
            ErrorType::Response { status, .. } => TransportError::Rejected {
                status: status.get(),
            },
            _ => TransportError::Unavailable(error.to_string()),
        }
    }

    fn retry_after_ms(seconds: f64) -> u64 {
        match Duration::try_from_secs_f64(seconds.max(0.0)) {
            Ok(duration) => match u64::try_from(duration.as_millis()) {
                Ok(milliseconds) => milliseconds.max(1),
                Err(_) => u64::MAX,
            },
            Err(_) => 1_000,
        }
    }
}

#[async_trait]
impl DiscordTransport for TwilightTransport {
    async fn respond_to_interaction(
        &self,
        request: InteractionCallback,
    ) -> Result<(), TransportError> {
        let response = InteractionResponse {
            kind: InteractionResponseType::ChannelMessageWithSource,
            data: Some(Self::response_data(request.ephemeral)),
        };

        self.create_response(request, response).await
    }

    async fn defer_interaction(&self, request: InteractionCallback) -> Result<(), TransportError> {
        let response = InteractionResponse {
            kind: InteractionResponseType::DeferredChannelMessageWithSource,
            data: Some(Self::response_data(request.ephemeral)),
        };

        self.create_response(request, response).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_data_only_sets_ephemeral_when_requested() {
        assert_eq!(
            TwilightTransport::response_data(true).flags,
            Some(MessageFlags::EPHEMERAL)
        );
        assert_eq!(TwilightTransport::response_data(false).flags, None);
    }

    #[test]
    fn zero_ids_and_empty_tokens_are_rejected_before_network_io() {
        let request = InteractionCallback {
            application_id: 0,
            interaction_id: 1,
            interaction_token: "token".to_owned(),
            ephemeral: false,
        };
        assert!(matches!(
            TwilightTransport::ids(&request),
            Err(TransportError::Rejected { status: 400 })
        ));

        let request = InteractionCallback {
            application_id: 1,
            interaction_id: 1,
            interaction_token: String::new(),
            ephemeral: false,
        };
        assert!(matches!(
            TwilightTransport::ids(&request),
            Err(TransportError::Rejected { status: 400 })
        ));
    }

    #[test]
    fn retry_duration_is_rounded_without_overflowing() {
        assert_eq!(TwilightTransport::retry_after_ms(0.0001), 1);
        assert_eq!(TwilightTransport::retry_after_ms(1.5), 1_500);
        assert_eq!(TwilightTransport::retry_after_ms(f64::INFINITY), 1_000);
    }
}
