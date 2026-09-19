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
}

#[derive(Clone)]
pub struct ControlPlaneConfig {
    pub bind_address: String,
    pub public_origin: String,
    pub database_url: Secret,
    pub redis_url: Secret,
    pub discord_application_id: String,
    pub discord_client_id: String,
    pub discord_client_secret: Secret,
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

        Ok(Self {
            bind_address: env::var("TOBOT_CONTROL_BIND")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_owned()),
            public_origin,
            database_url: Secret(required("TOBOT_DATABASE_URL")?),
            redis_url: Secret(required("TOBOT_REDIS_URL")?),
            discord_application_id: required("TOBOT_DISCORD_APPLICATION_ID")?,
            discord_client_id: required("TOBOT_DISCORD_CLIENT_ID")?,
            discord_client_secret: Secret(required("TOBOT_DISCORD_CLIENT_SECRET")?),
        })
    }
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    env::var(name).map_err(|_| ConfigError::Missing(name))
}
