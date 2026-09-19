//! Identity primitives. Persistence and Discord token exchange remain ports.

use std::time::{Duration, SystemTime};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;
use uuid::Uuid;

const OAUTH_TTL: Duration = Duration::from_mins(10);
const SESSION_IDLE_TTL: Duration = Duration::from_hours(12);
const SESSION_ABSOLUTE_TTL: Duration = Duration::from_hours(168);

#[derive(Clone, Debug)]
pub struct OAuthTransaction {
    pub id: Uuid,
    pub state: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub expires_at: SystemTime,
    consumed_at: Option<SystemTime>,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum IdentityError {
    #[error("OAuth transaction is expired")]
    Expired,
    #[error("OAuth transaction was already consumed")]
    AlreadyConsumed,
    #[error("OAuth state does not match")]
    StateMismatch,
    #[error("CSRF proof does not match the active session")]
    InvalidCsrf,
    #[error("session is expired or revoked")]
    SessionInactive,
}

impl OAuthTransaction {
    #[must_use]
    pub fn new(redirect_uri: String, scopes: Vec<String>, now: SystemTime) -> Self {
        let state = random_url_safe(32);
        let code_verifier = random_url_safe(64);
        let code_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));
        Self {
            id: Uuid::now_v7(),
            state,
            code_verifier,
            code_challenge,
            redirect_uri,
            scopes,
            expires_at: now + OAUTH_TTL,
            consumed_at: None,
        }
    }

    /// Atomically persisted callers must invoke this before token exchange.
    ///
    /// # Errors
    ///
    /// Rejects a replay, expired transaction, or state mismatch.
    pub fn consume(&mut self, state: &str, now: SystemTime) -> Result<(), IdentityError> {
        if now > self.expires_at {
            return Err(IdentityError::Expired);
        }
        if self.consumed_at.is_some() {
            return Err(IdentityError::AlreadyConsumed);
        }
        if self.state.as_bytes().ct_eq(state.as_bytes()).unwrap_u8() != 1 {
            return Err(IdentityError::StateMismatch);
        }
        self.consumed_at = Some(now);
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct AuthorizationSession {
    pub id: Uuid,
    pub csrf_proof: String,
    pub issued_at: SystemTime,
    pub idle_expires_at: SystemTime,
    pub absolute_expires_at: SystemTime,
    revoked_at: Option<SystemTime>,
}

impl AuthorizationSession {
    #[must_use]
    pub fn new(now: SystemTime) -> Self {
        Self {
            id: Uuid::now_v7(),
            csrf_proof: random_url_safe(32),
            issued_at: now,
            idle_expires_at: now + SESSION_IDLE_TTL,
            absolute_expires_at: now + SESSION_ABSOLUTE_TTL,
            revoked_at: None,
        }
    }

    /// # Errors
    ///
    /// Rejects expired, revoked, or mismatched CSRF state.
    pub fn verify_mutation(&self, csrf: &str, now: SystemTime) -> Result<(), IdentityError> {
        if self.revoked_at.is_some() || now > self.idle_expires_at || now > self.absolute_expires_at
        {
            return Err(IdentityError::SessionInactive);
        }
        if self
            .csrf_proof
            .as_bytes()
            .ct_eq(csrf.as_bytes())
            .unwrap_u8()
            != 1
        {
            return Err(IdentityError::InvalidCsrf);
        }
        Ok(())
    }

    pub fn revoke(&mut self, now: SystemTime) {
        self.revoked_at = Some(now);
    }
}

fn random_url_safe(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    rand::rng().fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_transaction_is_single_use_and_s256() {
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
        let mut transaction = OAuthTransaction::new(
            "https://app.tobot.test/auth/discord/callback".into(),
            vec!["identify".into()],
            now,
        );
        assert_eq!(
            transaction.code_challenge,
            URL_SAFE_NO_PAD.encode(Sha256::digest(transaction.code_verifier.as_bytes()))
        );
        let state = transaction.state.clone();
        assert!(transaction.consume(&state, now).is_ok());
        assert_eq!(
            transaction.consume(&state, now),
            Err(IdentityError::AlreadyConsumed)
        );
    }

    #[test]
    fn csrf_is_session_bound_and_revocation_is_immediate() {
        let now = SystemTime::UNIX_EPOCH;
        let mut session = AuthorizationSession::new(now);
        assert!(session.verify_mutation(&session.csrf_proof, now).is_ok());
        assert_eq!(
            session.verify_mutation("foreign", now),
            Err(IdentityError::InvalidCsrf)
        );
        session.revoke(now);
        assert_eq!(
            session.verify_mutation(&session.csrf_proof, now),
            Err(IdentityError::SessionInactive)
        );
    }
}
