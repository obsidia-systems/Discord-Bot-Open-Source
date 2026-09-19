//! Internal, closed typed client for Delivery. It cannot address Discord or
//! arbitrary service paths.

use async_trait::async_trait;
use std::time::Duration;
use tobot_discord_adapter::{DiscordTransport, InteractionCallback, TransportError};

pub struct InternalDeliveryTransport {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

impl InternalDeliveryTransport {
    /// # Errors
    ///
    /// Returns a client construction error when its bounded timeout policy
    /// cannot be configured.
    pub fn new(base_url: &str, service_token: String) -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(500))
            .timeout(Duration::from_secs(2))
            .build()?;
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_owned(),
            service_token,
        })
    }

    async fn send(&self, path: &str, callback: InteractionCallback) -> Result<(), TransportError> {
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.service_token)
            .json(&callback)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery is unavailable".to_owned()))?;
        let status = response.status();
        if status.is_success() {
            return Ok(());
        }
        if status.as_u16() == 429 {
            let retry_after_ms = response
                .headers()
                .get("retry-after")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .map_or(1_000, |seconds| seconds.saturating_mul(1_000));
            return Err(TransportError::RateLimited { retry_after_ms });
        }
        if status.is_client_error() {
            return Err(TransportError::Rejected {
                status: status.as_u16(),
            });
        }
        Err(TransportError::Unavailable(
            "Delivery is unavailable".to_owned(),
        ))
    }
}

#[async_trait]
impl DiscordTransport for InternalDeliveryTransport {
    async fn respond_to_interaction(
        &self,
        request: InteractionCallback,
    ) -> Result<(), TransportError> {
        self.send("/internal/v1/interactions/respond", request)
            .await
    }

    async fn defer_interaction(&self, request: InteractionCallback) -> Result<(), TransportError> {
        self.send("/internal/v1/interactions/defer", request).await
    }
}
