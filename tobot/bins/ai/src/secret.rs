//! Cifrado de la clave del proveedor. Solo vive en este proceso y no se registra.

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct SecretBox {
    key: [u8; 32],
}

impl SecretBox {
    /// Deriva la clave desde el entorno. Menos de 32 caracteres no cifra nada.
    #[must_use]
    pub fn from_env() -> Option<Self> {
        let raw = std::env::var("TOBOT_AI_SECRET_KEY").unwrap_or_default();
        Self::from_passphrase(raw.trim())
    }

    fn from_passphrase(raw: &str) -> Option<Self> {
        if raw.len() < 32 {
            return None;
        }
        let digest = Sha256::digest(raw.as_bytes());
        let mut key = [0_u8; 32];
        key.copy_from_slice(&digest);
        Some(Self { key })
    }

    /// Sella el secreto. El resultado es nonce y ciphertext, nunca el texto.
    /// # Errors
    /// Devuelve error si el cifrado no puede completarse.
    pub fn seal(&self, plain: &str) -> Result<Vec<u8>, ()> {
        let mut nonce_bytes = [0_u8; 12];
        getrandom::getrandom(&mut nonce_bytes).map_err(|_| ())?;
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|_| ())?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let sealed = cipher
            .encrypt(
                nonce,
                Payload {
                    msg: plain.as_bytes(),
                    aad: b"tobot-ai-provider",
                },
            )
            .map_err(|_| ())?;
        let mut packed = Vec::with_capacity(12 + sealed.len());
        packed.extend(nonce_bytes);
        packed.extend(sealed);
        Ok(packed)
    }

    /// Abre un secreto sellado por este mismo proceso.
    /// # Errors
    /// Devuelve error si el paquete o la clave no coinciden.
    pub fn open(&self, packed: &[u8]) -> Result<String, ()> {
        if packed.len() <= 12 {
            return Err(());
        }
        let (nonce_bytes, sealed) = packed.split_at(12);
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|_| ())?;
        let nonce = Nonce::from_slice(nonce_bytes);
        let plain = cipher
            .decrypt(
                nonce,
                Payload {
                    msg: sealed,
                    aad: b"tobot-ai-provider",
                },
            )
            .map_err(|_| ())?;
        String::from_utf8(plain).map_err(|_| ())
    }
}

#[must_use]
pub fn hint(secret: &str) -> String {
    let chars = secret.chars().count();
    if chars < 8 {
        return "set".to_owned();
    }
    secret.chars().skip(chars - 4).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_key_is_not_the_plaintext_and_roundtrips() {
        let Some(secrets) = SecretBox::from_passphrase("0123456789abcdef0123456789abcdef") else {
            return;
        };
        let plain = "sk-live-provider-key-abcdwxyz";
        let packed = secrets.seal(plain).ok().unwrap_or_default();
        assert!(packed.len() > plain.len());
        assert!(
            !packed
                .windows(plain.len())
                .any(|window| window == plain.as_bytes())
        );
        assert_eq!(secrets.open(&packed).ok().as_deref(), Some(plain));
        assert_eq!(hint(plain), "wxyz");
        assert_eq!(hint("short"), "set");
        assert!(SecretBox::from_passphrase("too-short").is_none());
    }
}
