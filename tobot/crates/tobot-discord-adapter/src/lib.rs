//! Discord SDK containment. Only typed, S0-approved operations cross this
//! boundary; domain crates never receive Twilight values.

use async_trait::async_trait;
use thiserror::Error;

#[derive(Clone, Debug, Eq, PartialEq)]
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
    _client: twilight_http::Client,
}

impl TwilightTransport {
    #[must_use]
    pub fn new(bot_token: String) -> Self {
        Self {
            _client: twilight_http::Client::new(bot_token),
        }
    }
}
