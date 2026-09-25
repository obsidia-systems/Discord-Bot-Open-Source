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
    ModerationCaseOpened,
    ModerationActionAuthorized,
    ModerationActionRejected,
    ModerationActionFailed,
    ModerationActionApplied,
    LifecycleDecisionCreated,
    LifecycleDeliveryRequested,
    LifecycleEventSuppressed,
    MessageDefinitionPublished,
    DeliveryQueued,
    DeliveryAttempted,
    DeliverySucceeded,
    DeliveryBlocked,
    DeliveryOutcomeUncertain,
    DeliveryDeadLettered,
    RolePolicyPublished,
    RoleAssignmentPlanned,
    RoleAssignmentApplied,
    RoleAssignmentUnchanged,
    RoleAssignmentSkipped,
    RoleAssignmentFailed,
    ProgressionPolicyPublished,
    XpAwardRecorded,
    LevelChanged,
    TicketTemplatePublished,
    SupportPanelPublished,
    SupportPanelInteractionAccepted,
    SupportCaseOpened,
    SupportCaseClaimed,
    SupportCaseClosed,
}

impl TryFrom<&str> for S0EventName {
    type Error = EnvelopeError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "GatewayEventAccepted" => Ok(Self::GatewayEventAccepted),
            "InteractionAccepted" => Ok(Self::InteractionAccepted),
            "InstallationStateChanged" => Ok(Self::InstallationStateChanged),
            "ModerationCaseOpened" => Ok(Self::ModerationCaseOpened),
            "ModerationActionAuthorized" => Ok(Self::ModerationActionAuthorized),
            "ModerationActionRejected" => Ok(Self::ModerationActionRejected),
            "ModerationActionFailed" => Ok(Self::ModerationActionFailed),
            "ModerationActionApplied" => Ok(Self::ModerationActionApplied),
            "LifecycleDecisionCreated" => Ok(Self::LifecycleDecisionCreated),
            "LifecycleDeliveryRequested" => Ok(Self::LifecycleDeliveryRequested),
            "LifecycleEventSuppressed" => Ok(Self::LifecycleEventSuppressed),
            "MessageDefinitionPublished" => Ok(Self::MessageDefinitionPublished),
            "DeliveryQueued" => Ok(Self::DeliveryQueued),
            "DeliveryAttempted" => Ok(Self::DeliveryAttempted),
            "DeliverySucceeded" => Ok(Self::DeliverySucceeded),
            "DeliveryBlocked" => Ok(Self::DeliveryBlocked),
            "DeliveryOutcomeUncertain" => Ok(Self::DeliveryOutcomeUncertain),
            "DeliveryDeadLettered" => Ok(Self::DeliveryDeadLettered),
            "RolePolicyPublished" => Ok(Self::RolePolicyPublished),
            "RoleAssignmentPlanned" => Ok(Self::RoleAssignmentPlanned),
            "RoleAssignmentApplied" => Ok(Self::RoleAssignmentApplied),
            "RoleAssignmentUnchanged" => Ok(Self::RoleAssignmentUnchanged),
            "RoleAssignmentSkipped" => Ok(Self::RoleAssignmentSkipped),
            "RoleAssignmentFailed" => Ok(Self::RoleAssignmentFailed),
            "ProgressionPolicyPublished" => Ok(Self::ProgressionPolicyPublished),
            "XpAwardRecorded" => Ok(Self::XpAwardRecorded),
            "LevelChanged" => Ok(Self::LevelChanged),
            "TicketTemplatePublished" => Ok(Self::TicketTemplatePublished),
            "SupportPanelPublished" => Ok(Self::SupportPanelPublished),
            "SupportPanelInteractionAccepted" => Ok(Self::SupportPanelInteractionAccepted),
            "SupportCaseOpened" => Ok(Self::SupportCaseOpened),
            "SupportCaseClaimed" => Ok(Self::SupportCaseClaimed),
            "SupportCaseClosed" => Ok(Self::SupportCaseClosed),
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
    #[error("welcome body or channel is invalid")]
    InvalidWelcomeBody,
    #[error("automatic role revision is invalid")]
    InvalidAutomaticRole,
    #[error("progression revision is invalid")]
    InvalidProgression,
    #[error("support panel revision is invalid")]
    InvalidSupportPanel,
}

/// Permission bits an automatic role must not grant.
pub const SENSITIVE_ROLE_PERMISSIONS: u64 =
    (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 28) | (1 << 40);

/// Discord Manage Roles. Missing this bit blocks assignment and does not rewrite installation.
pub const MANAGE_ROLES_PERMISSION: u64 = 1 << 28;

/// A plain-text welcome can interpolate only the member mention.
/// # Errors
/// Returns an error for empty, oversized, broad-mention, or unknown placeholders.
pub fn validate_welcome_body(body: &str) -> Result<(), EnvelopeError> {
    if body.trim().is_empty()
        || body.chars().count() > 2000
        || body.contains("@everyone")
        || body.contains("@here")
    {
        return Err(EnvelopeError::InvalidWelcomeBody);
    }
    let remainder = body.replace("{member}", "");
    if remainder.contains('{') || remainder.contains('}') {
        return Err(EnvelopeError::InvalidWelcomeBody);
    }
    // Discord user IDs are at most 20 decimal digits. Reserve the rendered
    // mention length so a valid revision cannot turn into an oversized POST.
    let rendered_max = body.chars().count() + body.matches("{member}").count() * (23 - 8);
    if rendered_max > 2000 {
        return Err(EnvelopeError::InvalidWelcomeBody);
    }
    Ok(())
}

fn snowflake(value: &str) -> bool {
    matches!(value.parse::<u64>(), Ok(1..))
}

/// One immediate human role. `@everyone`, managed, hierarchy, delay, and sensitive bits fail closed.
/// # Errors
/// Returns an error when the payload is not a publishable automatic role.
pub fn validate_automatic_role(payload: &Value) -> Result<(), EnvelopeError> {
    let guild = payload
        .get("guild_id")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidAutomaticRole)?;
    let role = payload
        .get("role_id")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidAutomaticRole)?;
    if !snowflake(guild) || !snowflake(role) || role == guild {
        return Err(EnvelopeError::InvalidAutomaticRole);
    }
    if payload.get("managed").and_then(Value::as_bool) != Some(false) {
        return Err(EnvelopeError::InvalidAutomaticRole);
    }
    let position = payload
        .get("position")
        .and_then(Value::as_i64)
        .ok_or(EnvelopeError::InvalidAutomaticRole)?;
    let bot_highest = payload
        .get("bot_highest_position")
        .and_then(Value::as_i64)
        .ok_or(EnvelopeError::InvalidAutomaticRole)?;
    if position >= bot_highest {
        return Err(EnvelopeError::InvalidAutomaticRole);
    }
    let permissions = payload
        .get("permissions")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidAutomaticRole)?;
    let bits: u64 = permissions
        .parse()
        .map_err(|_| EnvelopeError::InvalidAutomaticRole)?;
    if bits & SENSITIVE_ROLE_PERMISSIONS != 0 {
        return Err(EnvelopeError::InvalidAutomaticRole);
    }
    if payload
        .get("delay_seconds")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        > 0
    {
        return Err(EnvelopeError::InvalidAutomaticRole);
    }
    Ok(())
}

/// One fixed text award in one channel. Cooldown, content, voice, and rewards fail closed.
/// # Errors
/// Returns an error when the payload is not a publishable progression revision.
pub fn validate_progression(payload: &Value) -> Result<(), EnvelopeError> {
    let guild = payload
        .get("guild_id")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidProgression)?;
    let channel = payload
        .get("channel_id")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidProgression)?;
    if !snowflake(guild) || !snowflake(channel) {
        return Err(EnvelopeError::InvalidProgression);
    }
    let award = payload
        .get("award")
        .and_then(Value::as_i64)
        .ok_or(EnvelopeError::InvalidProgression)?;
    if !(1..=100).contains(&award) {
        return Err(EnvelopeError::InvalidProgression);
    }
    if payload
        .get("cooldown_seconds")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        != 0
    {
        return Err(EnvelopeError::InvalidProgression);
    }
    if payload
        .get("multiplier")
        .and_then(Value::as_i64)
        .unwrap_or(1)
        != 1
    {
        return Err(EnvelopeError::InvalidProgression);
    }
    if payload.get("content_rule").is_some()
        || payload.get("voice").and_then(Value::as_bool) == Some(true)
        || payload
            .get("reward_role_id")
            .and_then(Value::as_str)
            .is_some_and(|role| !role.is_empty())
        || payload
            .get("announcement_channel_id")
            .and_then(Value::as_str)
            .is_some_and(|channel| !channel.is_empty())
    {
        return Err(EnvelopeError::InvalidProgression);
    }
    Ok(())
}

/// S5 admite un solo botón de texto, sin formulario, recurso ni espera.
/// # Errors
/// Devuelve un error ante campos no admitidos o valores de Discord inválidos.
pub fn validate_support_panel(payload: &Value) -> Result<(), EnvelopeError> {
    let object = payload
        .as_object()
        .ok_or(EnvelopeError::InvalidSupportPanel)?;
    if object.keys().any(|key| {
        !matches!(
            key.as_str(),
            "guild_id" | "channel_id" | "button_label" | "cooldown_seconds"
        )
    }) {
        return Err(EnvelopeError::InvalidSupportPanel);
    }
    let guild = payload
        .get("guild_id")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidSupportPanel)?;
    let channel = payload
        .get("channel_id")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidSupportPanel)?;
    let label = payload
        .get("button_label")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::InvalidSupportPanel)?;
    if !snowflake(guild)
        || !snowflake(channel)
        || label.trim().is_empty()
        || label.chars().count() > 80
        || label.contains("@everyone")
        || label.contains("@here")
        || payload.get("cooldown_seconds").and_then(Value::as_i64) != Some(0)
    {
        return Err(EnvelopeError::InvalidSupportPanel);
    }
    Ok(())
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

    /// Reads an S0 gateway dispatch. Interaction receipts omit `dispatch` and
    /// return `None` so a consumer does not treat them as presence evidence.
    #[must_use]
    pub fn gateway_dispatch(&self) -> Option<GatewayDispatch> {
        if self.schema_name != "GatewayEventAccepted" {
            return None;
        }
        match self.payload.get("dispatch").and_then(Value::as_str)? {
            "Ready" => {
                let present_guild_ids = string_array(self.payload.get("present_guild_ids")?)?;
                Some(GatewayDispatch::Ready { present_guild_ids })
            }
            "Resumed" => Some(GatewayDispatch::Resumed),
            "GuildCreate" => Some(GatewayDispatch::GuildCreate {
                guild_id: self.guild_id.clone()?,
            }),
            "GuildDelete" => Some(GatewayDispatch::GuildDelete {
                guild_id: self.guild_id.clone()?,
                bot_left: self.payload.get("bot_left").and_then(Value::as_bool)?,
            }),
            _ => None,
        }
    }
}

fn string_array(value: &Value) -> Option<Vec<String>> {
    value
        .as_array()?
        .iter()
        .map(|item| item.as_str().map(ToOwned::to_owned))
        .collect()
}

/// Relevant non-interaction Gateway dispatches. Presence comparison uses the
/// Ready snapshot; Resume carries no guild list.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GatewayDispatch {
    Ready { present_guild_ids: Vec<String> },
    Resumed,
    GuildCreate { guild_id: String },
    GuildDelete { guild_id: String, bot_left: bool },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum S0CommandName {
    AdmitGuildInstall,
    AdmitGuildRepair,
    SubmitModerationAction,
    PublishWelcomeRevision,
    PublishAutomaticRoleRevision,
    PublishProgressionRevision,
    PublishSupportPanel,
}

impl TryFrom<&str> for S0CommandName {
    type Error = EnvelopeError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "AdmitGuildInstall" => Ok(Self::AdmitGuildInstall),
            "AdmitGuildRepair" => Ok(Self::AdmitGuildRepair),
            "SubmitModerationAction" => Ok(Self::SubmitModerationAction),
            "PublishWelcomeRevision" => Ok(Self::PublishWelcomeRevision),
            "PublishAutomaticRoleRevision" => Ok(Self::PublishAutomaticRoleRevision),
            "PublishProgressionRevision" => Ok(Self::PublishProgressionRevision),
            "PublishSupportPanel" => Ok(Self::PublishSupportPanel),
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
        if command_name == S0CommandName::PublishWelcomeRevision {
            let body = command
                .payload
                .get("body")
                .and_then(Value::as_str)
                .ok_or(EnvelopeError::InvalidWelcomeBody)?;
            let channel = command
                .payload
                .get("channel_id")
                .and_then(Value::as_str)
                .ok_or(EnvelopeError::InvalidWelcomeBody)?;
            let guild = command
                .payload
                .get("guild_id")
                .and_then(Value::as_str)
                .ok_or(EnvelopeError::InvalidWelcomeBody)?;
            validate_welcome_body(body)?;
            if !matches!(channel.parse::<u64>(), Ok(1..))
                || !matches!(guild.parse::<u64>(), Ok(1..))
            {
                return Err(EnvelopeError::InvalidWelcomeBody);
            }
        }
        if command_name == S0CommandName::PublishAutomaticRoleRevision {
            validate_automatic_role(&command.payload)?;
        }
        if command_name == S0CommandName::PublishProgressionRevision {
            validate_progression(&command.payload)?;
        }
        if command_name == S0CommandName::PublishSupportPanel {
            validate_support_panel(&command.payload)?;
        }
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

/// The only action types this slice admits. Every other moderation action fails closed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModerationActionType {
    Timeout,
    RemoveTimeout,
}

impl ModerationActionType {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Timeout => "timeout",
            Self::RemoveTimeout => "remove_timeout",
        }
    }
}

impl TryFrom<&str> for ModerationActionType {
    type Error = EnvelopeError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "timeout" => Ok(Self::Timeout),
            "remove_timeout" => Ok(Self::RemoveTimeout),
            _ => Err(EnvelopeError::UnsupportedSchemaName(value.to_owned())),
        }
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

    #[test]
    fn s2_welcome_command_and_fact_allowlist_fail_closed() {
        let tenant = Uuid::now_v7();
        let command = CommandEnvelope {
            command_id: Uuid::now_v7(),
            schema_name: "PublishWelcomeRevision".to_owned(),
            schema_version: 1,
            actor_account_id: Uuid::now_v7(),
            tenant_id: tenant,
            idempotency_key: Uuid::now_v7(),
            deadline_at: "2026-09-23T00:00:00Z".to_owned(),
            correlation_id: Uuid::now_v7(),
            trace_context: TraceContext {
                trace_id: "trace".to_owned(),
                span_id: "span".to_owned(),
            },
            payload: serde_json::json!({"guild_id":"456","channel_id":"123","body":"Hello {member}"}),
        };
        let raw =
            serde_json::to_vec(&command).unwrap_or_else(|error| panic!("encode failed: {error}"));
        assert_eq!(
            CommandEnvelope::parse_s0(&raw).map(|p| p.command_name),
            Ok(S0CommandName::PublishWelcomeRevision)
        );
        for name in [
            "AutoReplyMatched",
            "ScheduleActivated",
            "RolePanelPublished",
            "RoleResourceMutationRequested",
            "RoleAssignmentScheduled",
            "MessageDefinitionRetired",
            "DeliveryRetryScheduled",
            "AutoReplyDeliveryRequested",
            "DeliveryOccurrenceDue",
        ] {
            assert!(matches!(
                S0EventName::try_from(name),
                Err(EnvelopeError::UnsupportedSchemaName(_))
            ));
        }
        for name in [
            "LifecycleDecisionCreated",
            "LifecycleDeliveryRequested",
            "LifecycleEventSuppressed",
            "MessageDefinitionPublished",
            "DeliveryQueued",
            "DeliveryAttempted",
            "DeliverySucceeded",
            "DeliveryBlocked",
            "DeliveryOutcomeUncertain",
            "DeliveryDeadLettered",
            "RolePolicyPublished",
            "RoleAssignmentPlanned",
            "RoleAssignmentApplied",
            "RoleAssignmentUnchanged",
            "RoleAssignmentSkipped",
            "RoleAssignmentFailed",
        ] {
            assert!(S0EventName::try_from(name).is_ok());
            let event = VALID_GATEWAY.replace("GatewayEventAccepted", name);
            assert!(EventEnvelope::parse_s0(event.as_bytes()).is_ok());
        }
        for body in ["@everyone hello", "@here hello", "", "{other}"] {
            let mut rejected = command.clone();
            rejected.payload["body"] = serde_json::json!(body);
            let raw = serde_json::to_vec(&rejected)
                .unwrap_or_else(|error| panic!("encode failed: {error}"));
            assert_eq!(
                CommandEnvelope::parse_s0(&raw).err(),
                Some(EnvelopeError::InvalidWelcomeBody)
            );
        }
    }

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
        assert_eq!(parsed.event.gateway_dispatch(), None);
    }

    #[test]
    fn gateway_dispatch_keeps_ready_guilds_and_a_real_departure() {
        let ready = VALID_GATEWAY.replace(
            r#""payload":{"kind":"INTERACTION_CREATE"}"#,
            r#""payload":{"dispatch":"Ready","present_guild_ids":["222"]}"#,
        );
        let parsed = EventEnvelope::parse_s0(ready.as_bytes())
            .unwrap_or_else(|error| panic!("ready dispatch rejected: {error}"));
        assert_eq!(
            parsed.event.gateway_dispatch(),
            Some(GatewayDispatch::Ready {
                present_guild_ids: vec!["222".to_owned()]
            })
        );
        let left = VALID_GATEWAY.replace(
            r#""payload":{"kind":"INTERACTION_CREATE"}"#,
            r#""payload":{"dispatch":"GuildDelete","bot_left":true}"#,
        );
        let parsed = EventEnvelope::parse_s0(left.as_bytes())
            .unwrap_or_else(|error| panic!("guild delete rejected: {error}"));
        assert_eq!(
            parsed.event.gateway_dispatch(),
            Some(GatewayDispatch::GuildDelete {
                guild_id: "456".to_owned(),
                bot_left: true
            })
        );
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

    #[test]
    fn moderation_action_and_role_assignment_fail_closed() {
        assert_eq!(
            ModerationActionType::try_from("timeout"),
            Ok(ModerationActionType::Timeout)
        );
        assert_eq!(
            ModerationActionType::try_from("remove_timeout"),
            Ok(ModerationActionType::RemoveTimeout)
        );
        for action in ["kick", "ban", "quarantine", "warn", "purge"] {
            assert!(matches!(
                ModerationActionType::try_from(action),
                Err(EnvelopeError::UnsupportedSchemaName(_))
            ));
        }
        let panel = VALID_GATEWAY.replace("GatewayEventAccepted", "RolePanelPublished");
        assert!(matches!(
            EventEnvelope::parse_s0(panel.as_bytes()),
            Err(EnvelopeError::UnsupportedSchemaName(_))
        ));
        let noted = VALID_GATEWAY.replace("GatewayEventAccepted", "ModerationCaseNoted");
        assert!(matches!(
            EventEnvelope::parse_s0(noted.as_bytes()),
            Err(EnvelopeError::UnsupportedSchemaName(_))
        ));
        let opened = VALID_GATEWAY.replace("GatewayEventAccepted", "ModerationCaseOpened");
        let parsed = EventEnvelope::parse_s0(opened.as_bytes())
            .unwrap_or_else(|error| panic!("opened fact rejected: {error}"));
        assert_eq!(parsed.event_name, S0EventName::ModerationCaseOpened);
    }

    #[test]
    fn automatic_role_publish_rejects_sensitive_and_closed_names() {
        let tenant = Uuid::now_v7();
        let mut command = CommandEnvelope {
            command_id: Uuid::now_v7(),
            schema_name: "PublishAutomaticRoleRevision".to_owned(),
            schema_version: 1,
            actor_account_id: Uuid::now_v7(),
            tenant_id: tenant,
            idempotency_key: Uuid::now_v7(),
            deadline_at: "2026-09-23T00:00:00Z".to_owned(),
            correlation_id: Uuid::now_v7(),
            trace_context: TraceContext {
                trace_id: "trace".to_owned(),
                span_id: "span".to_owned(),
            },
            payload: serde_json::json!({
                "guild_id":"100","role_id":"200","managed":false,"position":1,
                "bot_highest_position":5,"permissions":"1024"
            }),
        };
        let raw =
            serde_json::to_vec(&command).unwrap_or_else(|error| panic!("encode failed: {error}"));
        assert_eq!(
            CommandEnvelope::parse_s0(&raw).map(|parsed| parsed.command_name),
            Ok(S0CommandName::PublishAutomaticRoleRevision)
        );
        for payload in [
            serde_json::json!({"guild_id":"100","role_id":"100","managed":false,"position":1,"bot_highest_position":5,"permissions":"0"}),
            serde_json::json!({"guild_id":"100","role_id":"200","managed":true,"position":1,"bot_highest_position":5,"permissions":"0"}),
            serde_json::json!({"guild_id":"100","role_id":"200","managed":false,"position":5,"bot_highest_position":5,"permissions":"0"}),
            serde_json::json!({"guild_id":"100","role_id":"200","managed":false,"position":1,"bot_highest_position":5,"permissions":"8","delay_seconds":0}),
            serde_json::json!({"guild_id":"100","role_id":"200","managed":false,"position":1,"bot_highest_position":5,"permissions":"0","delay_seconds":30}),
        ] {
            command.payload = payload;
            let raw = serde_json::to_vec(&command)
                .unwrap_or_else(|error| panic!("encode failed: {error}"));
            assert_eq!(
                CommandEnvelope::parse_s0(&raw).err(),
                Some(EnvelopeError::InvalidAutomaticRole)
            );
        }
        for name in [
            "RolePanelPublished",
            "RoleResourceMutationRequested",
            "RoleAssignmentScheduled",
            "RoleAssignmentRetryScheduled",
            "RoleAssignmentExpired",
            "RoleReconciliationCompleted",
        ] {
            assert!(matches!(
                S0EventName::try_from(name),
                Err(EnvelopeError::UnsupportedSchemaName(_))
            ));
        }
    }

    #[test]
    fn progression_publish_rejects_closed_sources() {
        let tenant = Uuid::now_v7();
        let mut command = CommandEnvelope {
            command_id: Uuid::now_v7(),
            schema_name: "PublishProgressionRevision".to_owned(),
            schema_version: 1,
            actor_account_id: Uuid::now_v7(),
            tenant_id: tenant,
            idempotency_key: Uuid::now_v7(),
            deadline_at: "2026-09-23T00:00:00Z".to_owned(),
            correlation_id: Uuid::now_v7(),
            trace_context: TraceContext {
                trace_id: "trace".to_owned(),
                span_id: "span".to_owned(),
            },
            payload: serde_json::json!({
                "guild_id":"100","channel_id":"200","award":10,"cooldown_seconds":0,"multiplier":1
            }),
        };
        let raw =
            serde_json::to_vec(&command).unwrap_or_else(|error| panic!("encode failed: {error}"));
        assert_eq!(
            CommandEnvelope::parse_s0(&raw).map(|parsed| parsed.command_name),
            Ok(S0CommandName::PublishProgressionRevision)
        );
        for payload in [
            serde_json::json!({"guild_id":"100","channel_id":"200","award":0}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":101}),
            serde_json::json!({"guild_id":"100","channel_id":"","award":10}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":10,"cooldown_seconds":30}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":10,"multiplier":2}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":10,"content_rule":"words"}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":10,"voice":true}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":10,"reward_role_id":"9"}),
            serde_json::json!({"guild_id":"100","channel_id":"200","award":10,"announcement_channel_id":"8"}),
        ] {
            command.payload = payload;
            let raw = serde_json::to_vec(&command)
                .unwrap_or_else(|error| panic!("encode failed: {error}"));
            assert_eq!(
                CommandEnvelope::parse_s0(&raw).err(),
                Some(EnvelopeError::InvalidProgression)
            );
        }
        for name in [
            "ProgressionPolicyPublished",
            "XpAwardRecorded",
            "LevelChanged",
        ] {
            assert!(S0EventName::try_from(name).is_ok());
        }
        for name in [
            "StarboardPolicyPublished",
            "XpAdjustmentRecorded",
            "LevelRewardRequested",
            "VoiceProgressionSessionChanged",
            "LeaderboardRefreshRequested",
            "CurrencyPolicyPublished",
            "IncomePolicyPublished",
        ] {
            assert!(matches!(
                S0EventName::try_from(name),
                Err(EnvelopeError::UnsupportedSchemaName(_))
            ));
        }
    }

    #[test]
    fn support_panel_contract_is_one_button_and_fail_closed() {
        let mut command = CommandEnvelope {
            command_id: Uuid::now_v7(),
            schema_name: "PublishSupportPanel".to_owned(),
            schema_version: 1,
            actor_account_id: Uuid::now_v7(),
            tenant_id: Uuid::now_v7(),
            idempotency_key: Uuid::now_v7(),
            deadline_at: "2026-09-25T00:00:00Z".to_owned(),
            correlation_id: Uuid::now_v7(),
            trace_context: TraceContext {
                trace_id: "trace".to_owned(),
                span_id: "span".to_owned(),
            },
            payload: serde_json::json!({"guild_id":"100","channel_id":"200",
                "button_label":"Open ticket","cooldown_seconds":0}),
        };
        let raw =
            serde_json::to_vec(&command).unwrap_or_else(|error| panic!("encode failed: {error}"));
        assert_eq!(
            CommandEnvelope::parse_s0(&raw).map(|p| p.command_name),
            Ok(S0CommandName::PublishSupportPanel)
        );
        for (key, value) in [
            ("mode", serde_json::json!("select")),
            ("form_id", serde_json::json!("x")),
            ("staff_role_id", serde_json::json!("300")),
            ("parent_category_id", serde_json::json!("400")),
            ("cooldown_seconds", serde_json::json!(1)),
            ("button_label", serde_json::json!("@everyone")),
            ("channel_id", serde_json::json!("")),
        ] {
            let original = command.payload.clone();
            command.payload[key] = value;
            let raw = serde_json::to_vec(&command)
                .unwrap_or_else(|error| panic!("encode failed: {error}"));
            assert_eq!(
                CommandEnvelope::parse_s0(&raw).err(),
                Some(EnvelopeError::InvalidSupportPanel)
            );
            command.payload = original;
        }
        for name in [
            "TicketTemplatePublished",
            "SupportPanelPublished",
            "SupportPanelInteractionAccepted",
            "SupportCaseOpened",
            "SupportCaseClaimed",
            "SupportCaseClosed",
        ] {
            assert!(S0EventName::try_from(name).is_ok());
        }
        for name in [
            "SupportResourceRequested",
            "SupportTranscriptRequested",
            "SupportArchiveCompleted",
            "SupportCaseWaiting",
            "SupportCaseEscalated",
            "SupportCaseResolved",
            "SupportCaseReopened",
            "SupportCaseBlocked",
            "SupportIntakeRequested",
            "SupportFormPublished",
        ] {
            assert!(S0EventName::try_from(name).is_err());
        }
    }
}
