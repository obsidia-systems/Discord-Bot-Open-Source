use std::time::Duration;
use tobot_discord_adapter::{TextChannel, TransportError};

use super::classify_status;

#[derive(Clone)]
pub struct WelcomeDeliveryClient {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

impl WelcomeDeliveryClient {
    /// # Errors
    /// Returns an error if the bounded private client cannot be constructed.
    pub fn new(base_url: &str, service_token: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(500))
                .timeout(Duration::from_secs(8))
                .build()?,
            base_url: base_url.trim_end_matches('/').to_owned(),
            service_token,
        })
    }

    /// # Errors
    /// Returns a classified error when Delivery cannot list guild text channels.
    pub async fn text_channels(&self, guild_id: &str) -> Result<Vec<TextChannel>, TransportError> {
        let response = self
            .client
            .post(format!(
                "{}/internal/v1/messages/text-channels",
                self.base_url
            ))
            .bearer_auth(&self.service_token)
            .json(&serde_json::json!({"guild_id":guild_id}))
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if !response.status().is_success() {
            return Err(classify_status(response.status().as_u16()));
        }
        response
            .json()
            .await
            .map_err(|_| TransportError::Unavailable("invalid channel list".to_owned()))
    }

    /// Requests immediate processing of one already-durable message intent.
    /// The Delivery sweep remains the recovery path if this private call fails.
    /// # Errors
    /// Returns a classified error when Delivery cannot accept the request.
    pub async fn create_channel_message(
        &self,
        intent_id: uuid::Uuid,
    ) -> Result<(), TransportError> {
        let response = self
            .client
            .post(format!("{}/internal/v1/messages/create", self.base_url))
            .bearer_auth(&self.service_token)
            .json(&serde_json::json!({"intent_id":intent_id}))
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(classify_status(response.status().as_u16()))
        }
    }
}
