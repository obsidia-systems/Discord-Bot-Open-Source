use std::time::Duration;

use tobot_discord_adapter::{ModerationPreflightReport, TransportError};

use super::classify_status;

/// Cases may call only these operations. Role add, role remove, and a full
/// role-list replace are not methods of this client.
#[derive(Clone)]
pub struct CasesDeliveryClient {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

#[cfg(test)]
pub const CASES_DELIVERY_OPERATIONS: &[&str] = &[
    "preflight",
    "apply_timeout",
    "clear_timeout",
    "observe_timeout",
];

impl CasesDeliveryClient {
    /// # Errors
    ///
    /// Returns an error if the bounded private HTTP client cannot be built.
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
    ///
    /// Returns a classified error when Delivery cannot complete the read.
    pub async fn preflight(
        &self,
        guild_id: &str,
        actor_user_id: &str,
        target_user_id: &str,
        protected_targets: &[String],
    ) -> Result<ModerationPreflightReport, TransportError> {
        let response = self
            .post(
                "/internal/v1/moderation/preflight",
                &serde_json::json!({
                    "guild_id": guild_id,
                    "actor_user_id": actor_user_id,
                    "target_user_id": target_user_id,
                    "protected_targets": protected_targets,
                }),
            )
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(classify_status(status.as_u16()));
        }
        response
            .json()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()))
    }

    /// # Errors
    ///
    /// Returns a classified error when Discord does not confirm the timeout.
    pub async fn apply_timeout(
        &self,
        guild_id: &str,
        user_id: &str,
        until_unix: i64,
        audit_reason: &str,
    ) -> Result<(), TransportError> {
        let response = self
            .post(
                "/internal/v1/moderation/timeout",
                &timeout_body(guild_id, user_id, Some(until_unix), audit_reason),
            )
            .await?;
        timeout_status(&response)
    }

    /// # Errors
    ///
    /// Returns a classified error when Discord does not confirm the clear.
    pub async fn clear_timeout(
        &self,
        guild_id: &str,
        user_id: &str,
        audit_reason: &str,
    ) -> Result<(), TransportError> {
        let response = self
            .post(
                "/internal/v1/moderation/clear-timeout",
                &timeout_body(guild_id, user_id, None, audit_reason),
            )
            .await?;
        timeout_status(&response)
    }

    /// # Errors
    ///
    /// Returns a classified error when the member cannot be read.
    pub async fn observe_timeout(
        &self,
        guild_id: &str,
        user_id: &str,
    ) -> Result<bool, TransportError> {
        let response = self
            .post(
                "/internal/v1/moderation/observe-timeout",
                &serde_json::json!({ "guild_id": guild_id, "user_id": user_id }),
            )
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(classify_status(status.as_u16()));
        }
        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()))?;
        Ok(body
            .get("active")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false))
    }

    async fn post(
        &self,
        path: &str,
        body: &serde_json::Value,
    ) -> Result<reqwest::Response, TransportError> {
        self.client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.service_token)
            .json(body)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery is unavailable".to_owned()))
    }
}

fn timeout_status(response: &reqwest::Response) -> Result<(), TransportError> {
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    Err(classify_status(status.as_u16()))
}

fn timeout_body(
    guild_id: &str,
    user_id: &str,
    until_unix: Option<i64>,
    audit_reason: &str,
) -> serde_json::Value {
    serde_json::json!({
        "guild_id": guild_id,
        "user_id": user_id,
        "until_unix": until_unix,
        "audit_reason": audit_reason,
    })
}

/// Command-HTTP from Edge to Control Plane. This is not a browser mutation.
#[derive(Clone)]
pub struct ModerationCommandClient {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

#[derive(Clone, Debug, serde::Deserialize, Eq, PartialEq)]
pub struct ModerationCommandResponse {
    pub case_id: Option<uuid::Uuid>,
    pub display_number: Option<i64>,
    pub status: String,
    pub follow_up: String,
}

impl ModerationCommandClient {
    /// # Errors
    ///
    /// Returns an error if the bounded private HTTP client cannot be built.
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
    ///
    /// Returns a classified error when Control Plane rejects the action.
    pub async fn submit(
        &self,
        body: &serde_json::Value,
    ) -> Result<ModerationCommandResponse, TransportError> {
        let response = self
            .client
            .post(format!("{}/internal/v1/moderation/actions", self.base_url))
            .bearer_auth(&self.service_token)
            .json(body)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Control Plane is unavailable".to_owned()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(classify_status(status.as_u16()));
        }
        response
            .json()
            .await
            .map_err(|_| TransportError::Unavailable("Control Plane response invalid".to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::CASES_DELIVERY_OPERATIONS;

    #[test]
    fn cases_delivery_client_has_no_role_mutation() {
        assert_eq!(CASES_DELIVERY_OPERATIONS.len(), 4);
        for name in CASES_DELIVERY_OPERATIONS {
            assert!(!name.contains("role"));
            assert!(!name.contains("replace"));
        }
    }
}
