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

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn create_channel(
        &self,
        guild_id: &str,
        name: &str,
        category_id: &str,
        overflow_category_id: Option<&str>,
        opener_id: &str,
        staff_role_id: &str,
    ) -> Result<String, TransportError> {
        let body = self
            .post_json(
                "/internal/v1/support/channel",
                &serde_json::json!({
                    "guild_id": guild_id, "name": name, "category_id": category_id,
                    "overflow_category_id": overflow_category_id, "opener_id": opener_id,
                    "staff_role_id": staff_role_id,
                }),
            )
            .await?;
        body["channel_id"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| TransportError::Unavailable("Delivery response invalid".to_owned()))
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn set_access(
        &self,
        channel_id: &str,
        staff_role_id: &str,
        member_id: Option<&str>,
        mode: &str,
    ) -> Result<(), TransportError> {
        self.post_empty(
            "/internal/v1/support/access",
            &serde_json::json!({
                "channel_id": channel_id, "staff_role_id": staff_role_id,
                "member_id": member_id, "mode": mode,
            }),
        )
        .await
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn post_message(
        &self,
        channel_id: &str,
        content: &str,
        buttons: &[(&str, &str)],
    ) -> Result<(), TransportError> {
        let buttons: Vec<_> = buttons
            .iter()
            .map(|(id, label)| serde_json::json!({"id":id,"label":label}))
            .collect();
        self.post_empty(
            "/internal/v1/support/message",
            &serde_json::json!({"channel_id":channel_id,"content":content,"buttons":buttons}),
        )
        .await
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn messages(
        &self,
        channel_id: &str,
    ) -> Result<Vec<tobot_discord_adapter::TicketMessage>, TransportError> {
        let body = self
            .post_json(
                "/internal/v1/support/messages",
                &serde_json::json!({"channel_id":channel_id}),
            )
            .await?;
        serde_json::from_value(body["messages"].clone())
            .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()))
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn delete_channel(&self, channel_id: &str) -> Result<(), TransportError> {
        match self
            .post_empty(
                "/internal/v1/support/channel-delete",
                &serde_json::json!({"channel_id":channel_id}),
            )
            .await
        {
            // El canal ya no está. El caso sigue cerrado y no hay que reintentar.
            Err(TransportError::Rejected { status: 404 }) => Ok(()),
            other => other,
        }
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn direct_message(
        &self,
        user_id: &str,
        content: &str,
        buttons: &[(&str, &str)],
    ) -> Result<(), TransportError> {
        let buttons: Vec<_> = buttons
            .iter()
            .map(|(id, label)| serde_json::json!({"id":id,"label":label}))
            .collect();
        self.post_empty(
            "/internal/v1/support/direct",
            &serde_json::json!({"user_id":user_id,"content":content,"buttons":buttons}),
        )
        .await
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn modal(
        &self,
        callback: InteractionCallback,
        title: &str,
        custom_id: &str,
        questions: &[(&str, bool)],
    ) -> Result<(), TransportError> {
        let questions: Vec<_> = questions
            .iter()
            .map(|(label, required)| serde_json::json!({"label":label,"required":required}))
            .collect();
        self.post_empty(
            "/internal/v1/support/modal",
            &serde_json::json!({
                "callback": callback, "title": title, "custom_id": custom_id, "questions": questions,
            }),
        )
        .await
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn categories(
        &self,
        guild_id: &str,
    ) -> Result<Vec<tobot_discord_adapter::TextChannel>, TransportError> {
        let body = self
            .post_json(
                "/internal/v1/support/categories",
                &serde_json::json!({"provider_guild_id":guild_id}),
            )
            .await?;
        serde_json::from_value(body["categories"].clone())
            .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()))
    }

    /// # Errors
    /// Devuelve un error clasificado de Delivery o Discord.
    pub async fn member_has_role(
        &self,
        guild_id: &str,
        user_id: &str,
        role_id: &str,
    ) -> Result<bool, TransportError> {
        let body = self
            .post_json(
                "/internal/v1/roles/member",
                &serde_json::json!({"guild_id":guild_id,"user_id":user_id}),
            )
            .await?;
        Ok(body["role_ids"]
            .as_array()
            .is_some_and(|roles| roles.iter().any(|role| role.as_str() == Some(role_id))))
    }

    async fn post_json(
        &self,
        path: &str,
        body: &serde_json::Value,
    ) -> Result<serde_json::Value, TransportError> {
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if !response.status().is_success() {
            return Err(classify_status(response.status().as_u16()));
        }
        response
            .json()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery response invalid".to_owned()))
    }

    async fn post_empty(&self, path: &str, body: &serde_json::Value) -> Result<(), TransportError> {
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Delivery unavailable".to_owned()))?;
        if response.status().is_success() {
            return Ok(());
        }
        Err(classify_status(response.status().as_u16()))
    }
}
