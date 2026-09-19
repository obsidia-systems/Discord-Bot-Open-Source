//! Vault Transit adapter. Database rows retain only Vault's versioned
//! ciphertext; keys and plaintext never become persistence values.

use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SecretStoreError {
    #[error("secret store request failed")]
    Unavailable,
    #[error("secret store rejected the request")]
    Rejected,
    #[error("secret store returned an invalid response")]
    InvalidResponse,
}

#[async_trait]
pub trait SecretStore: Send + Sync {
    async fn encrypt(&self, plaintext: &[u8], context: &[u8]) -> Result<String, SecretStoreError>;
    async fn decrypt(&self, ciphertext: &str, context: &[u8]) -> Result<Vec<u8>, SecretStoreError>;
}

pub struct VaultTransitStore {
    client: reqwest::Client,
    address: String,
    token: String,
    key: String,
}

impl VaultTransitStore {
    /// # Errors
    ///
    /// Returns an error if the bounded Vault HTTP client cannot be built.
    pub fn new(address: &str, token: String, key: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(500))
                .timeout(Duration::from_secs(2))
                .build()?,
            address: address.trim_end_matches('/').to_owned(),
            token,
            key,
        })
    }

    async fn request(
        &self,
        operation: &str,
        payload: TransitRequest<'_>,
    ) -> Result<String, SecretStoreError> {
        let response = self
            .client
            .post(format!(
                "{}/v1/tobot-transit/{operation}/{}",
                self.address, self.key
            ))
            .header("X-Vault-Token", &self.token)
            .json(&payload)
            .send()
            .await
            .map_err(|_| SecretStoreError::Unavailable)?;
        if !response.status().is_success() {
            return Err(SecretStoreError::Rejected);
        }
        response
            .json::<TransitResponse>()
            .await
            .map_err(|_| SecretStoreError::InvalidResponse)?
            .data
            .ciphertext
            .ok_or(SecretStoreError::InvalidResponse)
    }
}

#[derive(Serialize)]
struct TransitRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    plaintext: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ciphertext: Option<&'a str>,
    context: String,
}

#[derive(Deserialize)]
struct TransitResponse {
    data: TransitData,
}

#[derive(Deserialize)]
struct TransitData {
    ciphertext: Option<String>,
    plaintext: Option<String>,
}

#[async_trait]
impl SecretStore for VaultTransitStore {
    async fn encrypt(&self, plaintext: &[u8], context: &[u8]) -> Result<String, SecretStoreError> {
        self.request(
            "encrypt",
            TransitRequest {
                plaintext: Some(&STANDARD.encode(plaintext)),
                ciphertext: None,
                context: STANDARD.encode(context),
            },
        )
        .await
    }

    async fn decrypt(&self, ciphertext: &str, context: &[u8]) -> Result<Vec<u8>, SecretStoreError> {
        if !is_vault_ciphertext(ciphertext) {
            return Err(SecretStoreError::Rejected);
        }
        let response = self
            .client
            .post(format!("{}/v1/tobot-transit/decrypt/{}", self.address, self.key))
            .header("X-Vault-Token", &self.token)
            .json(&TransitRequest {
                plaintext: None,
                ciphertext: Some(ciphertext),
                context: STANDARD.encode(context),
            })
            .send()
            .await
            .map_err(|_| SecretStoreError::Unavailable)?;
        if !response.status().is_success() {
            return Err(SecretStoreError::Rejected);
        }
        let encoded = response
            .json::<TransitResponse>()
            .await
            .map_err(|_| SecretStoreError::InvalidResponse)?
            .data
            .plaintext
            .ok_or(SecretStoreError::InvalidResponse)?;
        STANDARD
            .decode(encoded)
            .map_err(|_| SecretStoreError::InvalidResponse)
    }
}

fn is_vault_ciphertext(value: &str) -> bool {
    value.starts_with("vault:v")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decrypt_only_admits_versioned_vault_ciphertext() {
        assert!(is_vault_ciphertext("vault:v1:opaque"));
        assert!(!is_vault_ciphertext("plaintext"));
        assert!(!is_vault_ciphertext("v1:opaque"));
    }
}
