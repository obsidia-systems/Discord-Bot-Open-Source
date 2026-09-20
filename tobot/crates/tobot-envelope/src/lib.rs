//! Canonical, language-neutral S0 envelopes.
//!
//! Raw bytes are retained with the validated envelope so stores can audit a
//! receipt without treating an unsupported payload as a live fact.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u16 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum S0EventName {
    GatewayEventAccepted,
    InteractionAccepted,
    InstallationStateChanged,
}

impl TryFrom<&str> for S0EventName {
    type Error = EnvelopeError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "GatewayEventAccepted" => Ok(Self::GatewayEventAccepted),
            "InteractionAccepted" => Ok(Self::InteractionAccepted),
            "InstallationStateChanged" => Ok(Self::InstallationStateChanged),
            _ => Err(EnvelopeError::UnsupportedSchemaName(value.to_owned())),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TraceContext {
    pub trace_id: String,
    pub span_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EventEnvelope {
    pub event_id: Uuid,
    pub schema_name: String,
    pub schema_version: u16,
    pub occurred_at: String,
    pub received_at: String,
    pub application_id: String,
    #[serde(default)]
    pub tenant_id: Option<Uuid>,
    #[serde(default)]
    pub guild_id: Option<String>,
    #[serde(default)]
    pub shard_id: Option<u32>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub gateway_sequence: Option<u64>,
    pub correlation_id: Uuid,
    #[serde(default)]
    pub causation_id: Option<Uuid>,
    pub trace_context: TraceContext,
    pub payload: Value,
}

#[derive(Clone, Debug)]
pub struct ParsedEvent {
    pub event: EventEnvelope,
    pub event_name: S0EventName,
    pub raw: Vec<u8>,
}

#[derive(Debug, Error, PartialEq)]
pub enum EnvelopeError {
    #[error("envelope is not valid UTF-8 JSON: {0}")]
    InvalidJson(String),
    #[error("schema version {0} is unsupported")]
    UnsupportedSchemaVersion(u16),
    #[error("S0 does not accept schema name {0}")]
    UnsupportedSchemaName(String),
    #[error("gateway event needs shard, session and sequence")]
    MissingGatewayIdentity,
}

impl EventEnvelope {
    /// Parses an S0 event after preserving its raw bytes for audit.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed JSON, unsupported versions or leaves,
    /// and incomplete Gateway technical identities.
    pub fn parse_s0(raw: &[u8]) -> Result<ParsedEvent, EnvelopeError> {
        let event: Self = serde_json::from_slice(raw)
            .map_err(|error| EnvelopeError::InvalidJson(error.to_string()))?;
        if event.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(EnvelopeError::UnsupportedSchemaVersion(
                event.schema_version,
            ));
        }
        let event_name = S0EventName::try_from(event.schema_name.as_str())?;
        if event_name == S0EventName::GatewayEventAccepted
            && (event.shard_id.is_none()
                || event.session_id.is_none()
                || event.gateway_sequence.is_none())
        {
            return Err(EnvelopeError::MissingGatewayIdentity);
        }

        Ok(ParsedEvent {
            event,
            event_name,
            raw: raw.to_vec(),
        })
    }

    #[must_use]
    pub fn gateway_deduplication_key(&self) -> Option<GatewayDeduplicationKey<'_>> {
        Some(GatewayDeduplicationKey {
            application_id: &self.application_id,
            shard_id: self.shard_id?,
            session_id: self.session_id.as_deref()?,
            sequence: self.gateway_sequence?,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GatewayDeduplicationKey<'a> {
    pub application_id: &'a str,
    pub shard_id: u32,
    pub session_id: &'a str,
    pub sequence: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_GATEWAY: &str = r#"{
        "event_id":"019a3dc6-0989-7000-8000-000000000001",
        "schema_name":"GatewayEventAccepted",
        "schema_version":1,
        "occurred_at":"2026-09-19T00:00:00Z",
        "received_at":"2026-09-19T00:00:01Z",
        "application_id":"123",
        "guild_id":"456",
        "shard_id":0,
        "session_id":"session-a",
        "gateway_sequence":42,
        "correlation_id":"019a3dc6-0989-7000-8000-000000000002",
        "trace_context":{"trace_id":"trace","span_id":"span"},
        "payload":{"kind":"INTERACTION_CREATE"},
        "future_additive_field":true
    }"#;

    #[test]
    fn accepts_known_version_and_additive_fields() {
        let parsed = EventEnvelope::parse_s0(VALID_GATEWAY.as_bytes())
            .unwrap_or_else(|error| panic!("valid envelope rejected: {error}"));
        assert_eq!(parsed.event_name, S0EventName::GatewayEventAccepted);
        let key = parsed
            .event
            .gateway_deduplication_key()
            .unwrap_or_else(|| panic!("gateway event did not produce a technical key"));
        assert_eq!(key.sequence, 42);
        assert_eq!(parsed.raw, VALID_GATEWAY.as_bytes());
    }

    #[test]
    fn rejects_unknown_s0_leaf_and_version() {
        let unknown = VALID_GATEWAY.replace("GatewayEventAccepted", "MessageCreated");
        assert!(matches!(
            EventEnvelope::parse_s0(unknown.as_bytes()),
            Err(EnvelopeError::UnsupportedSchemaName(_))
        ));
        let old = VALID_GATEWAY.replace("\"schema_version\":1", "\"schema_version\":0");
        let Err(error) = EventEnvelope::parse_s0(old.as_bytes()) else {
            panic!("unsupported major must fail closed");
        };
        assert_eq!(error, EnvelopeError::UnsupportedSchemaVersion(0));
    }
}
