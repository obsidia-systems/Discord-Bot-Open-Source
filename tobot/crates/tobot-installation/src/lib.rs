//! Discord Installation owner primitives for the S0 diagnostic probe.

use std::time::SystemTime;

use serde::Serialize;
use tobot_identity::{OAuthTransaction, pkce_s256};
use url::Url;
use uuid::Uuid;

const ADMINISTRATOR: u64 = 1 << 3;
const MANAGE_GUILD: u64 = 1 << 5;

/// Discord Moderate Members. Administrator stays off this union.
pub const SAFETY_GUILD_PERMISSIONS: &str = "1099511627776";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct S0Manifest {
    pub module: &'static str,
    pub oauth_scopes: [&'static str; 2],
    pub guild_permissions: &'static str,
    pub gateway_intents: [&'static str; 1],
    pub bot_presence_required: bool,
}

impl Default for S0Manifest {
    fn default() -> Self {
        Self {
            module: "platform_probe",
            oauth_scopes: ["applications.commands", "bot"],
            guild_permissions: "0",
            gateway_intents: ["GUILDS"],
            bot_presence_required: true,
        }
    }
}

/// Guild install and repair for the safety operator loop. Verification still
/// uses the two S0 capabilities; a missing Moderate Members bit does not degrade.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SafetyManifest {
    pub module: &'static str,
    pub oauth_scopes: [&'static str; 2],
    pub guild_permissions: &'static str,
    pub gateway_intents: [&'static str; 1],
    pub bot_presence_required: bool,
}

impl Default for SafetyManifest {
    fn default() -> Self {
        Self {
            module: "safety_operator_loop",
            oauth_scopes: ["applications.commands", "bot"],
            guild_permissions: SAFETY_GUILD_PERMISSIONS,
            gateway_intents: ["GUILDS"],
            bot_presence_required: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct GuildInstallAuthorization {
    pub id: Uuid,
    pub state: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub expires_at: SystemTime,
    pub provider_guild_id: String,
}

impl GuildInstallAuthorization {
    #[must_use]
    pub fn new(provider_guild_id: String, redirect_uri: String, now: SystemTime) -> Self {
        let manifest = S0Manifest::default();
        let oauth = OAuthTransaction::new(
            redirect_uri,
            manifest.oauth_scopes.map(str::to_owned).to_vec(),
            now,
        );
        Self {
            id: oauth.id,
            state: oauth.state,
            code_verifier: oauth.code_verifier,
            code_challenge: oauth.code_challenge,
            redirect_uri: oauth.redirect_uri,
            scopes: oauth.scopes,
            expires_at: oauth.expires_at,
            provider_guild_id,
        }
    }

    /// Creates the named `GuildInstall` preset. The permission union is Moderate
    /// Members. Administrator stays off.
    ///
    /// # Errors
    ///
    /// Returns a URL parse error for an invalid Discord authorization base.
    pub fn authorize_url(&self, client_id: &str) -> Result<Url, url::ParseError> {
        guild_authorize_url(
            client_id,
            &self.redirect_uri,
            &self.scopes,
            &self.state,
            &self.code_challenge,
            &self.provider_guild_id,
            SAFETY_GUILD_PERMISSIONS,
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum InstallPreset {
    GuildInstall,
    UserInstall,
    GuildRepair,
}

impl InstallPreset {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GuildInstall => "GuildInstall",
            Self::UserInstall => "UserInstall",
            Self::GuildRepair => "GuildRepair",
        }
    }

    /// `UserInstall` is a named preset with no S0 product outcome.
    #[must_use]
    pub const fn has_product_outcome(self) -> bool {
        matches!(self, Self::GuildInstall | Self::GuildRepair)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CapabilityHealth {
    Healthy,
    Degraded,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CapabilityEvidence {
    pub key: &'static str,
    pub health: CapabilityHealth,
    pub reason: &'static str,
}

/// Evidence written when verification finishes. Install context was already
/// recorded as Healthy at the callback; bot presence comes from Transport.
#[must_use]
pub const fn s0_verification_evidence(bot_present: bool) -> [CapabilityEvidence; 2] {
    [
        CapabilityEvidence {
            key: "application_install_context",
            health: CapabilityHealth::Healthy,
            reason: "oauth_guild_context_observed",
        },
        CapabilityEvidence {
            key: "bot_presence",
            health: if bot_present {
                CapabilityHealth::Healthy
            } else {
                CapabilityHealth::Degraded
            },
            reason: if bot_present {
                "bot_guild_presence_observed"
            } else {
                "bot_guild_presence_absent"
            },
        },
    ]
}

/// `Installed` only when every required S0 capability is present and Healthy.
#[must_use]
pub fn aggregate_installation_state(evidence: &[CapabilityEvidence]) -> &'static str {
    let required = ["application_install_context", "bot_presence"];
    let complete = required.iter().all(|key| {
        evidence
            .iter()
            .any(|row| row.key == *key && row.health == CapabilityHealth::Healthy)
    });
    if complete { "Installed" } else { "Degraded" }
}

/// Repair asks for Moderate Members. It never asks for Administrator.
#[must_use]
pub const fn repair_permission_union() -> &'static str {
    SAFETY_GUILD_PERMISSIONS
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RepairPlan {
    pub permission_union: &'static str,
    pub reasons: Vec<&'static str>,
}

#[must_use]
pub fn repair_plan(evidence: &[CapabilityEvidence]) -> RepairPlan {
    RepairPlan {
        permission_union: repair_permission_union(),
        reasons: evidence
            .iter()
            .filter(|row| row.health != CapabilityHealth::Healthy)
            .map(|row| row.reason)
            .collect(),
    }
}

/// Callback query fields are hints. They never become install authority.
#[must_use]
pub const fn callback_hint_grants_authority(
    _guild_id: Option<&str>,
    _permissions: Option<&str>,
) -> bool {
    false
}

#[derive(Clone, Debug)]
pub struct GuildRepairAuthorization {
    inner: GuildInstallAuthorization,
}

impl GuildRepairAuthorization {
    #[must_use]
    pub fn new(provider_guild_id: String, redirect_uri: String, now: SystemTime) -> Self {
        Self {
            inner: GuildInstallAuthorization::new(provider_guild_id, redirect_uri, now),
        }
    }

    #[must_use]
    pub const fn authorization(&self) -> &GuildInstallAuthorization {
        &self.inner
    }

    /// # Errors
    ///
    /// Returns a URL parse error for an invalid Discord authorization base.
    pub fn authorize_url(&self, client_id: &str) -> Result<Url, url::ParseError> {
        let mut url = guild_authorize_url(
            client_id,
            &self.inner.redirect_uri,
            &self.inner.scopes,
            &self.inner.state,
            &self.inner.code_challenge,
            &self.inner.provider_guild_id,
            repair_permission_union(),
        )?;
        url.query_pairs_mut().append_pair("prompt", "consent");
        Ok(url)
    }
}

#[derive(Clone, Debug)]
pub struct UserInstallAuthorization {
    pub id: Uuid,
    pub state: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub expires_at: SystemTime,
}

impl UserInstallAuthorization {
    #[must_use]
    pub fn new(redirect_uri: String, now: SystemTime) -> Self {
        let oauth =
            OAuthTransaction::new(redirect_uri, vec!["applications.commands".to_owned()], now);
        Self {
            id: oauth.id,
            state: oauth.state,
            code_verifier: oauth.code_verifier,
            code_challenge: oauth.code_challenge,
            redirect_uri: oauth.redirect_uri,
            scopes: oauth.scopes,
            expires_at: oauth.expires_at,
        }
    }

    #[must_use]
    pub const fn product_outcome() -> Option<&'static str> {
        None
    }

    /// # Errors
    ///
    /// Returns a URL parse error for an invalid Discord authorization base.
    pub fn authorize_url(&self, client_id: &str) -> Result<Url, url::ParseError> {
        let mut url = Url::parse("https://discord.com/oauth2/authorize")?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("scope", &self.scopes.join(" "))
            .append_pair("state", &self.state)
            .append_pair("code_challenge", &self.code_challenge)
            .append_pair("code_challenge_method", pkce_s256())
            .append_pair("permissions", "0")
            .append_pair("integration_type", "1");
        Ok(url)
    }
}

fn guild_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    scopes: &[String],
    state: &str,
    code_challenge: &str,
    guild_id: &str,
    permissions: &str,
) -> Result<Url, url::ParseError> {
    let mut url = Url::parse("https://discord.com/oauth2/authorize")?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", &scopes.join(" "))
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", pkce_s256())
        .append_pair("guild_id", guild_id)
        .append_pair("disable_guild_select", "true")
        .append_pair("integration_type", "0")
        .append_pair("permissions", permissions);
    Ok(url)
}

#[must_use]
pub fn has_live_guild_install_authority(owner: bool, permissions: &str) -> bool {
    owner
        || permissions
            .parse::<u64>()
            .is_ok_and(|bits| bits & (ADMINISTRATOR | MANAGE_GUILD) != 0)
}

/// Discord's extended bot code grant lists `bot` and often omits the implied
/// `applications.commands` scope. Any other scope is not that grant.
#[must_use]
pub fn granted_install_scopes_match(requested: &[String], granted: &[String]) -> bool {
    let requested = canonical_scopes(requested);
    let granted = canonical_scopes(granted);
    if granted.iter().any(|scope| !requested.contains(scope)) {
        return false;
    }
    let bot_granted = granted.iter().any(|scope| scope == "bot");
    requested.iter().all(|scope| {
        granted.contains(scope)
            || (scope == "applications.commands"
                && requested.iter().any(|item| item == "bot")
                && bot_granted)
    })
}

/// `bot` and `applications.commands` are passthrough scopes. When the user
/// already holds a login grant, Discord keeps `identify` and `guilds` on the
/// code and still adds the bot. That code is not a bot grant and not proof of
/// the guild; Delivery observes presence after the callback records `Verifying`.
#[must_use]
pub fn is_existing_user_grant(granted: &[String]) -> bool {
    let granted = canonical_scopes(granted);
    !granted.is_empty()
        && granted
            .iter()
            .all(|scope| scope == "identify" || scope == "guilds")
}

fn canonical_scopes(scopes: &[String]) -> Vec<String> {
    let mut scopes = scopes.to_vec();
    scopes.sort_unstable();
    scopes.dedup();
    scopes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn s0_manifest_is_explicitly_minimal() {
        let manifest = S0Manifest::default();
        assert_eq!(manifest.guild_permissions, "0");
        assert_eq!(manifest.gateway_intents, ["GUILDS"]);
        assert!(manifest.bot_presence_required);
        assert!(!has_live_guild_install_authority(false, "0"));
        assert!(has_live_guild_install_authority(false, "8"));
        assert!(has_live_guild_install_authority(false, "32"));
    }

    #[test]
    fn named_guild_install_locks_the_selected_guild_and_uses_pkce() {
        let authorization = GuildInstallAuthorization::new(
            "123".to_owned(),
            "https://dash.tobot.test/install/discord/callback".to_owned(),
            SystemTime::UNIX_EPOCH,
        );
        let Ok(url) = authorization.authorize_url("456") else {
            panic!("static Discord authorize URL must parse");
        };
        let parameters = url
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(parameters.get("guild_id").map(AsRef::as_ref), Some("123"));
        assert_eq!(
            parameters.get("disable_guild_select").map(AsRef::as_ref),
            Some("true")
        );
        assert_eq!(
            parameters.get("permissions").map(AsRef::as_ref),
            Some(SAFETY_GUILD_PERMISSIONS)
        );
        assert_eq!(
            parameters.get("integration_type").map(AsRef::as_ref),
            Some("0")
        );
        assert_eq!(
            parameters.get("scope").map(AsRef::as_ref),
            Some("applications.commands bot")
        );
        assert!(!parameters.contains_key("prompt"));
        assert_eq!(
            parameters.get("code_challenge_method").map(AsRef::as_ref),
            Some("S256")
        );
    }

    #[test]
    fn installed_requires_every_s0_capability() {
        let healthy = s0_verification_evidence(true);
        assert_eq!(aggregate_installation_state(&healthy), "Installed");
        let missing = s0_verification_evidence(false);
        assert_eq!(aggregate_installation_state(&missing), "Degraded");
        let plan = repair_plan(&missing);
        assert_eq!(plan.permission_union, SAFETY_GUILD_PERMISSIONS);
        assert_eq!(plan.reasons, ["bot_guild_presence_absent"]);
        let bits = plan.permission_union.parse::<u64>().unwrap_or(u64::MAX);
        assert_eq!(bits & (1 << 3), 0);
    }

    #[test]
    fn user_install_has_no_product_outcome_and_does_not_lock_a_guild() {
        assert!(!InstallPreset::UserInstall.has_product_outcome());
        assert!(InstallPreset::GuildRepair.has_product_outcome());
        let authorization = UserInstallAuthorization::new(
            "https://dash.tobot.test/install/discord/callback".to_owned(),
            SystemTime::UNIX_EPOCH,
        );
        assert_eq!(UserInstallAuthorization::product_outcome(), None);
        let Ok(url) = authorization.authorize_url("456") else {
            panic!("static Discord authorize URL must parse");
        };
        let parameters = url
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        assert!(!parameters.contains_key("guild_id"));
        assert_eq!(
            parameters.get("integration_type").map(AsRef::as_ref),
            Some("1")
        );
        assert_eq!(parameters.get("permissions").map(AsRef::as_ref), Some("0"));
    }

    #[test]
    fn repair_locks_the_guild_and_ignores_callback_hints() {
        let authorization = GuildRepairAuthorization::new(
            "123".to_owned(),
            "https://dash.tobot.test/install/discord/callback".to_owned(),
            SystemTime::UNIX_EPOCH,
        );
        let Ok(url) = authorization.authorize_url("456") else {
            panic!("static Discord authorize URL must parse");
        };
        let parameters = url
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(parameters.get("guild_id").map(AsRef::as_ref), Some("123"));
        assert_eq!(
            parameters.get("disable_guild_select").map(AsRef::as_ref),
            Some("true")
        );
        assert_eq!(
            parameters.get("permissions").map(AsRef::as_ref),
            Some(SAFETY_GUILD_PERMISSIONS)
        );
        assert_eq!(parameters.get("prompt").map(AsRef::as_ref), Some("consent"));
        assert!(!callback_hint_grants_authority(Some("123"), Some("8")));
        assert_eq!(InstallPreset::GuildRepair.as_str(), "GuildRepair");
    }

    #[test]
    fn bot_grant_may_omit_the_implied_commands_scope() {
        let requested = vec!["applications.commands".to_owned(), "bot".to_owned()];
        assert!(granted_install_scopes_match(
            &requested,
            &["bot".to_owned()]
        ));
        assert!(granted_install_scopes_match(
            &requested,
            &["applications.commands".to_owned(), "bot".to_owned()]
        ));
        assert!(!granted_install_scopes_match(
            &requested,
            &[
                "applications.commands".to_owned(),
                "bot".to_owned(),
                "identify".to_owned()
            ]
        ));
        assert!(!granted_install_scopes_match(
            &requested,
            &["applications.commands".to_owned()]
        ));
        assert!(!granted_install_scopes_match(
            &requested,
            &["guilds".to_owned(), "identify".to_owned()]
        ));
        assert!(is_existing_user_grant(&[
            "identify".to_owned(),
            "guilds".to_owned()
        ]));
        assert!(!is_existing_user_grant(&["bot".to_owned()]));
        assert!(!is_existing_user_grant(&[
            "email".to_owned(),
            "guilds".to_owned(),
            "identify".to_owned()
        ]));
    }
}
