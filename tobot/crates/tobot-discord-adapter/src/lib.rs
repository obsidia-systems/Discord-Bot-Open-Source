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

pub struct OAuthTokenSet {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in_seconds: u64,
    pub scopes: Vec<String>,
    pub guild: Option<DiscordAuthorizedGuild>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DiscordAuthorizedGuild {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DiscordAuthorizationUser {
    pub id: String,
    pub username: String,
    pub global_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DiscordGuildObservation {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub owner: bool,
    pub permissions: String,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    scope: String,
    guild: Option<DiscordAuthorizedGuild>,
}

#[derive(Deserialize)]
struct CurrentAuthorizationResponse {
    scopes: Vec<String>,
    user: Option<DiscordAuthorizationUser>,
}

#[derive(Clone)]
pub struct DiscordOAuthClient {
    client: reqwest::Client,
    client_id: String,
    client_secret: String,
}

impl DiscordOAuthClient {
    /// # Errors
    ///
    /// Returns an error when the bounded HTTP client cannot be constructed.
    pub fn new(client_id: String, client_secret: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(500))
                .timeout(Duration::from_secs(3))
                .build()?,
            client_id,
            client_secret,
        })
    }

    /// Exchanges a single-use authorization code with its server-held PKCE
    /// verifier. Provider response bodies are never included in errors.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error for provider rejection or
    /// unavailability.
    pub async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> Result<OAuthTokenSet, TransportError> {
        let response = self
            .client
            .post("https://discord.com/api/v10/oauth2/token")
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect_uri),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Discord OAuth unavailable".to_owned()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(TransportError::Rejected {
                status: status.as_u16(),
            });
        }
        let token = response.json::<OAuthTokenResponse>().await.map_err(|_| {
            TransportError::Unavailable("Discord OAuth response invalid".to_owned())
        })?;
        Ok(OAuthTokenSet {
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_in_seconds: token.expires_in,
            scopes: canonical_scopes(&token.scope),
            guild: token.guild,
        })
    }

    /// Reads the authorization owner under the OAuth credential class.
    ///
    /// # Errors
    ///
    /// Returns a classified error when Discord rejects or cannot serve the
    /// bearer credential.
    pub async fn current_user(
        &self,
        access_token: &str,
    ) -> Result<(DiscordAuthorizationUser, Vec<String>), TransportError> {
        let response = self
            .client
            .get("https://discord.com/api/v10/oauth2/@me")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Discord OAuth unavailable".to_owned()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(TransportError::Rejected {
                status: status.as_u16(),
            });
        }
        let authorization = response
            .json::<CurrentAuthorizationResponse>()
            .await
            .map_err(|_| {
                TransportError::Unavailable("Discord OAuth response invalid".to_owned())
            })?;
        let user = authorization
            .user
            .ok_or(TransportError::Rejected { status: 403 })?;
        Ok((user, canonical_scope_values(authorization.scopes)))
    }

    /// Reads every guild visible to the current OAuth user. These values are
    /// discovery observations only and must never authorize a mutation.
    ///
    /// # Errors
    ///
    /// Returns a classified error for provider rejection, malformed pages,
    /// transport failure, or an unexpectedly unbounded result set.
    pub async fn current_user_guilds(
        &self,
        access_token: &str,
    ) -> Result<Vec<DiscordGuildObservation>, TransportError> {
        const PAGE_SIZE: usize = 200;
        const MAX_PAGES: usize = 10;
        let mut observations = Vec::new();
        let mut after: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut request = self
                .client
                .get("https://discord.com/api/v10/users/@me/guilds")
                .bearer_auth(access_token)
                .query(&[("limit", PAGE_SIZE)]);
            if let Some(cursor) = after.as_deref() {
                request = request.query(&[("after", cursor)]);
            }
            let response = request.send().await.map_err(|_| {
                TransportError::Unavailable("Discord guild discovery unavailable".to_owned())
            })?;
            let status = response.status();
            if !status.is_success() {
                return Err(TransportError::Rejected {
                    status: status.as_u16(),
                });
            }
            let page = response
                .json::<Vec<DiscordGuildObservation>>()
                .await
                .map_err(|_| {
                    TransportError::Unavailable(
                        "Discord guild discovery response invalid".to_owned(),
                    )
                })?;
            let page_len = page.len();
            after = page.last().map(|guild| guild.id.clone());
            observations.extend(page);
            if page_len < PAGE_SIZE {
                return Ok(observations);
            }
        }
        Err(TransportError::Unavailable(
            "Discord guild discovery exceeded the bounded page limit".to_owned(),
        ))
    }
}

fn canonical_scopes(value: &str) -> Vec<String> {
    canonical_scope_values(value.split_ascii_whitespace().map(str::to_owned).collect())
}

fn canonical_scope_values(mut scopes: Vec<String>) -> Vec<String> {
    scopes.sort_unstable();
    scopes.dedup();
    scopes
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

    #[test]
    fn guild_discovery_preserves_snowflakes_and_permission_bits_as_strings() {
        let Ok(guild): Result<DiscordGuildObservation, _> = serde_json::from_str(
            r#"{
                "id":"80351110224678912",
                "name":"Guild",
                "icon":null,
                "owner":false,
                "permissions":"1125899906842624"
            }"#,
        ) else {
            panic!("fixture must deserialize");
        };
        assert_eq!(guild.id, "80351110224678912");
        assert_eq!(guild.permissions, "1125899906842624");
    }
}
