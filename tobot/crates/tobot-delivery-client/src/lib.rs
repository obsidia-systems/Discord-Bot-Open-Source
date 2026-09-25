//! Internal, closed typed client for Delivery. It cannot address Discord or
//! arbitrary service paths.

use async_trait::async_trait;
use std::time::Duration;
use tobot_discord_adapter::GuildPresenceInspection;
use tobot_discord_adapter::{DiscordTransport, InteractionCallback, TransportError};

mod cases;
mod role;
mod support;
mod welcome;

pub use cases::{CasesDeliveryClient, ModerationCommandClient, ModerationCommandResponse};
pub use role::RoleDeliveryClient;
pub use support::SupportDeliveryClient;
pub use welcome::WelcomeDeliveryClient;

pub(crate) fn classify_status(status: u16) -> TransportError {
    if status == 429 {
        return TransportError::RateLimited {
            retry_after_ms: 1_000,
        };
    }
    if (400..500).contains(&status) {
        return TransportError::Rejected { status };
    }
    TransportError::Unavailable(format!("upstream returned HTTP {status}"))
}

#[derive(Clone)]
pub struct InternalDeliveryTransport {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

#[derive(Clone)]
pub struct InstallationInspectionClient {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

impl InstallationInspectionClient {
    /// # Errors
    ///
    /// Returns an error if the bounded private HTTP client cannot be built.
    pub fn new(base_url: &str, service_token: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(500))
                .timeout(Duration::from_secs(2))
                .build()?,
            base_url: base_url.trim_end_matches('/').to_owned(),
            service_token,
        })
    }

    /// # Errors
    ///
    /// Returns a classified error when private Delivery or Discord cannot
    /// produce a bounded presence observation.
    pub async fn inspect_guild_presence(
        &self,
        provider_guild_id: &str,
    ) -> Result<GuildPresenceInspection, TransportError> {
        let response = self
            .client
            .post(format!(
                "{}/internal/v1/installations/inspect-guild",
                self.base_url
            ))
            .bearer_auth(&self.service_token)
            .json(&serde_json::json!({ "provider_guild_id": provider_guild_id }))
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery is unavailable".to_owned()))?;
        let status = response.status();
        if status.is_success() {
            return response
                .json()
                .await
                .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()));
        }
        let body = response.text().await.unwrap_or_default();
        Err(classify_inspection_failure(status.as_u16(), &body))
    }
}

/// Preserves Discord's HTTP status. Delivery used to collapse every provider
/// rejection into 502, and this client then reported that as an outage.
fn classify_inspection_failure(http_status: u16, body: &str) -> TransportError {
    let body = body.trim();
    if http_status == 429 {
        return TransportError::RateLimited {
            retry_after_ms: 1_000,
        };
    }
    if (400..500).contains(&http_status) {
        return TransportError::Rejected {
            status: http_status,
        };
    }
    let detail = if body.is_empty() {
        "no response body"
    } else {
        body
    };
    TransportError::Unavailable(format!("Delivery returned HTTP {http_status}: {detail}"))
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

    /// Asks Delivery to register the guild diagnostic command. This is the only
    /// product Discord HTTP Edge is allowed to trigger.
    ///
    /// # Errors
    ///
    /// Returns a classified error when Delivery or Discord rejects the command.
    pub async fn register_diagnostic_command(
        &self,
        application_id: u64,
        guild_id: u64,
    ) -> Result<(), TransportError> {
        self.post_json(
            "/internal/v1/commands/diagnostic",
            &serde_json::json!({
                "application_id": application_id,
                "guild_id": guild_id
            }),
        )
        .await
    }

    async fn send(&self, path: &str, callback: InteractionCallback) -> Result<(), TransportError> {
        let body = serde_json::to_value(&callback).map_err(|_| {
            TransportError::Unavailable("interaction callback could not be encoded".to_owned())
        })?;
        self.post_json(path, &body).await
    }

    async fn post_json(&self, path: &str, body: &serde_json::Value) -> Result<(), TransportError> {
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.service_token)
            .json(body)
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

    /// # Errors
    ///
    /// Returns a classified error when Discord rejects the follow-up.
    pub async fn follow_up(
        &self,
        callback: InteractionCallback,
        content: &str,
    ) -> Result<(), TransportError> {
        let mut body = serde_json::to_value(&callback).map_err(|_| {
            TransportError::Unavailable("interaction callback could not be encoded".to_owned())
        })?;
        if let Some(object) = body.as_object_mut() {
            object.insert(
                "content".to_owned(),
                serde_json::Value::String(content.to_owned()),
            );
        }
        self.post_json("/internal/v1/interactions/followup", &body)
            .await
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

#[cfg(test)]
mod tests {
    use super::classify_inspection_failure;
    use tobot_discord_adapter::TransportError;

    #[test]
    fn inspection_keeps_discord_client_status() {
        let rejected =
            classify_inspection_failure(401, "Discord rejected the typed operation: 401");
        assert!(matches!(rejected, TransportError::Rejected { status: 401 }));
        let absent = classify_inspection_failure(403, "Discord rejected the typed operation: 403");
        assert!(matches!(absent, TransportError::Rejected { status: 403 }));
    }

    #[test]
    fn inspection_server_failure_includes_delivery_body() {
        let failure = classify_inspection_failure(503, "connection reset by discord");
        let TransportError::Unavailable(detail) = failure else {
            panic!("server failure must stay a transport failure");
        };
        assert!(detail.contains("503"));
        assert!(detail.contains("connection reset by discord"));
        assert!(!detail.contains("Delivery is unavailable"));
    }
}
