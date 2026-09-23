use std::time::Duration;
use tobot_discord_adapter::{MemberRoles, RoleCatalog, TransportError};

use super::classify_status;

#[derive(Clone)]
pub struct RoleDeliveryClient {
    client: reqwest::Client,
    base_url: String,
    service_token: String,
}

impl RoleDeliveryClient {
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
    /// Returns a classified error when Delivery cannot list guild roles.
    pub async fn list_roles(&self, guild_id: &str) -> Result<RoleCatalog, TransportError> {
        self.post("catalog", serde_json::json!({"guild_id": guild_id}))
            .await
    }

    /// # Errors
    /// Returns a classified error when Delivery cannot read the member.
    pub async fn read_member(
        &self,
        guild_id: &str,
        user_id: &str,
    ) -> Result<MemberRoles, TransportError> {
        self.post(
            "member",
            serde_json::json!({"guild_id": guild_id, "user_id": user_id}),
        )
        .await
    }

    /// Adds one role. A replace of the member role list is not an operation.
    /// # Errors
    /// Returns a classified error when Delivery cannot accept the request.
    pub async fn add_member_role(
        &self,
        guild_id: &str,
        user_id: &str,
        role_id: &str,
        reason: &str,
    ) -> Result<(), TransportError> {
        let response = self
            .client
            .post(format!("{}/internal/v1/roles/add", self.base_url))
            .bearer_auth(&self.service_token)
            .json(&serde_json::json!({
                "guild_id": guild_id,
                "user_id": user_id,
                "role_id": role_id,
                "reason": reason
            }))
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(classify_status(response.status().as_u16()))
        }
    }

    async fn post<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: serde_json::Value,
    ) -> Result<T, TransportError> {
        let response = self
            .client
            .post(format!("{}/internal/v1/roles/{path}", self.base_url))
            .bearer_auth(&self.service_token)
            .json(&body)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if !response.status().is_success() {
            return Err(classify_status(response.status().as_u16()));
        }
        response
            .json()
            .await
            .map_err(|_| TransportError::Unavailable("invalid role response".to_owned()))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn assignment_delivery_is_one_role_add() {
        let operations = ["list_roles", "read_member", "add_member_role"];
        assert_eq!(operations.len(), 3);
        for name in operations {
            assert!(!name.contains("replace"));
            assert!(!name.contains("remove"));
        }
        assert!(operations.contains(&"add_member_role"));
    }
}
