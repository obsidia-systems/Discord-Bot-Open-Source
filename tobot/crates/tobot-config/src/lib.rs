//! Startup-time configuration validation. Secrets are intentionally never
//! rendered through `Debug` or error messages.

use std::env;

use thiserror::Error;

#[derive(Debug, Error, Eq, PartialEq)]
pub enum ConfigError {
    #[error("missing required configuration: {0}")]
    Missing(&'static str),
    #[error("invalid public origin: {0}")]
    InvalidOrigin(String),
    #[error("OAuth redirect URI must exactly equal {expected}")]
    OAuthRedirectMismatch { expected: String },
}

#[derive(Clone)]
pub struct ControlPlaneConfig {
    pub bind_address: String,
    pub public_origin: String,
    pub discord_oauth_redirect_uri: String,
    pub database_url: Secret,
    pub redis_url: Secret,
    pub discord_application_id: String,
    pub discord_client_id: String,
    pub discord_client_secret: Secret,
    pub vault_addr: String,
    pub vault_token: Secret,
    pub vault_transit_key: String,
}

#[derive(Clone)]
pub struct Secret(String);

impl Secret {
    #[must_use]
    pub fn expose_for_adapter(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Secret([REDACTED])")
    }
}

impl ControlPlaneConfig {
    /// Loads required Control Plane configuration without exposing secret
    /// values in diagnostics.
    ///
    /// # Errors
    ///
    /// Returns an error when a required value is absent or the public origin
    /// does not use an admitted local or HTTPS form.
    pub fn from_env() -> Result<Self, ConfigError> {
        let public_origin = required("TOBOT_PUBLIC_APP_ORIGIN")?;
        if !(public_origin.starts_with("https://") || public_origin.starts_with("http://localhost"))
        {
            return Err(ConfigError::InvalidOrigin(public_origin));
        }
        let discord_oauth_redirect_uri = required("TOBOT_DISCORD_OAUTH_REDIRECT_URI")?;
        validate_oauth_redirect(&public_origin, &discord_oauth_redirect_uri)?;

        Ok(Self {
            bind_address: env::var("TOBOT_CONTROL_BIND")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_owned()),
            public_origin,
            discord_oauth_redirect_uri,
            database_url: Secret(required("TOBOT_DATABASE_URL")?),
            redis_url: Secret(required("TOBOT_REDIS_URL")?),
            discord_application_id: required("TOBOT_DISCORD_APPLICATION_ID")?,
            discord_client_id: required("TOBOT_DISCORD_CLIENT_ID")?,
            discord_client_secret: Secret(required("TOBOT_DISCORD_CLIENT_SECRET")?),
            vault_addr: required("TOBOT_VAULT_ADDR")?,
            vault_token: Secret(required("TOBOT_VAULT_TOKEN")?),
            vault_transit_key: required("TOBOT_VAULT_TRANSIT_KEY")?,
        })
    }
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    env::var(name).map_err(|_| ConfigError::Missing(name))
}

fn validate_oauth_redirect(origin: &str, redirect_uri: &str) -> Result<(), ConfigError> {
    let expected = format!("{}/auth/discord/callback", origin.trim_end_matches('/'));
    if redirect_uri == expected {
        Ok(())
    } else {
        Err(ConfigError::OAuthRedirectMismatch { expected })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_redirect_must_match_the_app_callback_exactly() {
        assert!(
            validate_oauth_redirect(
                "https://app.tobot.test",
                "https://app.tobot.test/auth/discord/callback"
            )
            .is_ok()
        );
        assert!(matches!(
            validate_oauth_redirect(
                "https://app.tobot.test",
                "https://evil.example/auth/discord/callback"
            ),
            Err(ConfigError::OAuthRedirectMismatch { .. })
        ));
    }
}
