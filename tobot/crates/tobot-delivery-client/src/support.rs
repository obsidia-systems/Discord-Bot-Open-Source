//! Cliente interno cerrado para el panel S5 y la respuesta diferida.

use std::time::Duration;
use tobot_discord_adapter::{InteractionCallback, SupportPanelMessage, TransportError};

use crate::classify_status;

#[derive(Clone)]
pub struct SupportDeliveryClient {
    client: reqwest::Client,
    base_url: String,
    token: String,
}

#[derive(serde::Deserialize)]
struct CreatedPanel {
    message_id: String,
}

impl SupportDeliveryClient {
    /// # Errors
    /// Devuelve un error al construir el cliente.
    pub fn new(base_url: &str, token: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(500))
                .timeout(Duration::from_secs(5))
                .build()?,
            base_url: base_url.trim_end_matches('/').to_owned(),
            token,
        })
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn create_panel(
        &self,
        request: &SupportPanelMessage,
    ) -> Result<String, TransportError> {
        let response = self
            .client
            .post(format!("{}/internal/v1/support/panel", self.base_url))
            .bearer_auth(&self.token)
            .json(request)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if !response.status().is_success() {
            return Err(classify_status(response.status().as_u16()));
        }
        response
            .json::<CreatedPanel>()
            .await
            .map(|body| body.message_id)
            .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()))
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn edit_deferred(
        &self,
        callback: InteractionCallback,
        content: &str,
    ) -> Result<(), TransportError> {
        let response = self
            .client
            .post(format!(
                "{}/internal/v1/support/deferred-edit",
                self.base_url
            ))
            .bearer_auth(&self.token)
            .json(&serde_json::json!({"callback":callback,"content":content}))
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
