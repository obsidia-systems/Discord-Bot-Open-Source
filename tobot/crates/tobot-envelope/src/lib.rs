//! Canonical, language-neutral S0 envelopes.
//!
//! Raw bytes are retained with the validated envelope so stores can audit a
//! receipt without treating an unsupported payload as a live fact.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u16 = 1;

/// A reader at `current` accepts that major and the previous one.
/// Major 0 is never readable. When `current` is 1, only major 1 is readable.
#[must_use]
pub const fn accepts_schema_version(version: u16, current: u16) -> bool {
    if version == 0 || current == 0 {
        return false;
    }
    let oldest = if current == 1 { 1 } else { current - 1 };
    version >= oldest && version <= current
}

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
        Self::parse_s0_at(raw, CURRENT_SCHEMA_VERSION)
    }

    /// Parses an event as a reader whose current major is `current`.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed JSON, an unreadable major, an unknown
    /// leaf, or a Gateway event missing its technical identity.
    pub fn parse_s0_at(raw: &[u8], current: u16) -> Result<ParsedEvent, EnvelopeError> {
        let event: Self = serde_json::from_slice(raw)
            .map_err(|error| EnvelopeError::InvalidJson(error.to_string()))?;
        if !accepts_schema_version(event.schema_version, current) {
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum S0CommandName {
    AdmitGuildInstall,
    AdmitGuildRepair,
}

impl TryFrom<&str> for S0CommandName {
    type Error = EnvelopeError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "AdmitGuildInstall" => Ok(Self::AdmitGuildInstall),
            "AdmitGuildRepair" => Ok(Self::AdmitGuildRepair),
            _ => Err(EnvelopeError::UnsupportedSchemaName(value.to_owned())),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CommandEnvelope {
    pub command_id: Uuid,
    pub schema_name: String,
    pub schema_version: u16,
    pub actor_account_id: Uuid,
    pub tenant_id: Uuid,
    pub idempotency_key: Uuid,
    pub deadline_at: String,
    pub correlation_id: Uuid,
    pub trace_context: TraceContext,
    pub payload: Value,
}

#[derive(Clone, Debug)]
pub struct ParsedCommand {
    pub command: CommandEnvelope,
    pub command_name: S0CommandName,
    pub raw: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommandReject {
    MissingActor,
    TenantMismatch,
    DeadlinePassed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommandAdmission {
    Admit,
    Reject(CommandReject),
}

impl CommandEnvelope {
    /// Parses an S0 command. A `*Requested` name is not a command and fails closed.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed JSON, an unreadable major, or a leaf
    /// outside the S0 command allowlist.
    pub fn parse_s0(raw: &[u8]) -> Result<ParsedCommand, EnvelopeError> {
        Self::parse_s0_at(raw, CURRENT_SCHEMA_VERSION)
    }

    /// # Errors
    ///
    /// Returns an error when `raw` is not a readable command at `current`.
    pub fn parse_s0_at(raw: &[u8], current: u16) -> Result<ParsedCommand, EnvelopeError> {
        let command: Self = serde_json::from_slice(raw)
            .map_err(|error| EnvelopeError::InvalidJson(error.to_string()))?;
        if !accepts_schema_version(command.schema_version, current) {
            return Err(EnvelopeError::UnsupportedSchemaVersion(
                command.schema_version,
            ));
        }
        let command_name = S0CommandName::try_from(command.schema_name.as_str())?;
        Ok(ParsedCommand {
            command,
            command_name,
            raw: raw.to_vec(),
        })
    }

    /// Binds the command to the server-authenticated tenant. The route id is
    /// not authority: it must equal `bound_tenant`.
    #[must_use]
    pub fn admit(&self, bound_tenant: Uuid, deadline_passed: bool) -> CommandAdmission {
        if self.actor_account_id.is_nil() {
            return CommandAdmission::Reject(CommandReject::MissingActor);
        }
        if self.tenant_id != bound_tenant {
            return CommandAdmission::Reject(CommandReject::TenantMismatch);
        }
        if deadline_passed {
            return CommandAdmission::Reject(CommandReject::DeadlinePassed);
        }
        CommandAdmission::Admit
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

    #[test]
    fn reader_accepts_current_and_previous_major_and_rejects_older() {
        assert!(accepts_schema_version(2, 2));
        assert!(accepts_schema_version(1, 2));
        assert!(!accepts_schema_version(0, 2));
        assert!(accepts_schema_version(1, 1));
        assert!(!accepts_schema_version(0, 1));
        assert!(EventEnvelope::parse_s0_at(VALID_GATEWAY.as_bytes(), 2).is_ok());
        let too_old = VALID_GATEWAY.replace("\"schema_version\":1", "\"schema_version\":0");
        assert!(matches!(
            EventEnvelope::parse_s0_at(too_old.as_bytes(), 2),
            Err(EnvelopeError::UnsupportedSchemaVersion(0))
        ));
    }

    #[test]
    fn command_admission_binds_the_authenticated_tenant() {
        let tenant = Uuid::now_v7();
        let raw = format!(
            r#"{{
                "command_id":"019a3dc6-0989-7000-8000-000000000010",
                "schema_name":"AdmitGuildInstall",
                "schema_version":1,
                "actor_account_id":"019a3dc6-0989-7000-8000-000000000011",
                "tenant_id":"{tenant}",
                "idempotency_key":"019a3dc6-0989-7000-8000-000000000012",
                "deadline_at":"2026-09-21T00:00:00Z",
                "correlation_id":"019a3dc6-0989-7000-8000-000000000013",
                "trace_context":{{"trace_id":"trace","span_id":"span"}},
                "payload":{{}},
                "future_additive_field":true
            }}"#
        );
        let parsed = CommandEnvelope::parse_s0(raw.as_bytes())
            .unwrap_or_else(|error| panic!("command rejected: {error}"));
        assert_eq!(parsed.command_name, S0CommandName::AdmitGuildInstall);
        assert_eq!(parsed.command.admit(tenant, false), CommandAdmission::Admit);
        assert_eq!(
            parsed.command.admit(Uuid::now_v7(), false),
            CommandAdmission::Reject(CommandReject::TenantMismatch)
        );
        assert_eq!(
            parsed.command.admit(tenant, true),
            CommandAdmission::Reject(CommandReject::DeadlinePassed)
        );
        let requested = raw.replace("AdmitGuildInstall", "GuildInstallRequested");
        assert!(matches!(
            CommandEnvelope::parse_s0(requested.as_bytes()),
            Err(EnvelopeError::UnsupportedSchemaName(_))
        ));
    }
}
