//! Identity application service coordinating domain primitives, the owner
//! store, and protected secret storage.

use std::time::SystemTime;
use thiserror::Error;
use time::OffsetDateTime;
use tobot_identity::{OAuthTransaction, oauth_state_hash};
use tobot_persistence::{NewOAuthTransaction, Store};
use tobot_secret_store::SecretStore;
use uuid::Uuid;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OAuthAuthorizationStart {
    pub state: String,
    pub code_challenge: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConsumedOAuthAuthorization {
    pub code_verifier: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Error)]
pub enum OAuthServiceError {
    #[error("OAuth transaction persistence failed")]
    Persistence,
    #[error("OAuth secret protection failed")]
    SecretStore,
    #[error("OAuth transaction is invalid, expired, or already consumed")]
    InvalidTransaction,
    #[error("OAuth protected verifier is invalid")]
    InvalidVerifier,
}

#[derive(Clone)]
pub struct OAuthService<S> {
    store: Store,
    secrets: S,
}

impl<S> OAuthService<S>
where
    S: SecretStore,
{
    #[must_use]
    pub fn new(store: Store, secrets: S) -> Self {
        Self { store, secrets }
    }

    /// Creates a transaction while exposing only state and the S256 challenge.
    ///
    /// # Errors
    ///
    /// Returns a classified error when Vault or PostgreSQL cannot durably
    /// accept the transaction.
    pub async fn begin(
        &self,
        redirect_uri: String,
        scopes: Vec<String>,
        now: SystemTime,
    ) -> Result<OAuthAuthorizationStart, OAuthServiceError> {
        let transaction = OAuthTransaction::new(redirect_uri, scopes, now);
        let context = verifier_context(transaction.id);
        let ciphertext = self
            .secrets
            .encrypt(transaction.code_verifier.as_bytes(), &context)
            .await
            .map_err(|_| OAuthServiceError::SecretStore)?;
        self.store
            .create_oauth_transaction(NewOAuthTransaction {
                transaction_id: transaction.id,
                state_hash: &transaction.state_hash(),
                verifier_ciphertext: ciphertext.as_bytes(),
                redirect_uri: &transaction.redirect_uri,
                requested_scopes: &transaction.scopes,
                expires_at: OffsetDateTime::from(transaction.expires_at),
            })
            .await
            .map_err(|_| OAuthServiceError::Persistence)?;
        Ok(OAuthAuthorizationStart {
            state: transaction.state,
            code_challenge: transaction.code_challenge,
            redirect_uri: transaction.redirect_uri,
            scopes: transaction.scopes,
        })
    }

    /// Consumes state before any provider exchange and decrypts the verifier
    /// using transaction-bound Vault context.
    ///
    /// # Errors
    ///
    /// Returns a fail-closed error for replay/expiry, persistence failure,
    /// Vault failure, or malformed protected data.
    pub async fn consume(
        &self,
        state: &str,
        now: SystemTime,
    ) -> Result<ConsumedOAuthAuthorization, OAuthServiceError> {
        let record = self
            .store
            .consume_oauth_transaction(&oauth_state_hash(state), OffsetDateTime::from(now))
            .await
            .map_err(|_| OAuthServiceError::Persistence)?
            .ok_or(OAuthServiceError::InvalidTransaction)?;
        let ciphertext = std::str::from_utf8(&record.verifier_ciphertext)
            .map_err(|_| OAuthServiceError::InvalidVerifier)?;
        let plaintext = self
            .secrets
            .decrypt(ciphertext, &verifier_context(record.transaction_id))
            .await
            .map_err(|_| OAuthServiceError::SecretStore)?;
        let code_verifier =
            String::from_utf8(plaintext).map_err(|_| OAuthServiceError::InvalidVerifier)?;
        Ok(ConsumedOAuthAuthorization {
            code_verifier,
            redirect_uri: record.redirect_uri,
            scopes: record.requested_scopes,
        })
    }
}

fn verifier_context(transaction_id: Uuid) -> Vec<u8> {
    format!("tobot:oauth-pkce:{transaction_id}").into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_context_is_transaction_specific() {
        assert_ne!(
            verifier_context(Uuid::now_v7()),
            verifier_context(Uuid::now_v7())
        );
    }
}
