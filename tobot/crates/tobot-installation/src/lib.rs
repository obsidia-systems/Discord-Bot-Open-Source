//! Discord Installation owner primitives for the S0 diagnostic probe.

use std::time::SystemTime;

use serde::Serialize;
use tobot_identity::OAuthTransaction;
use url::Url;
use uuid::Uuid;

const ADMINISTRATOR: u64 = 1 << 3;
const MANAGE_GUILD: u64 = 1 << 5;

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

    /// Creates the named `GuildInstall` preset with an explicit zero
    /// permission union because the S0 probe requires no guild permissions.
    ///
    /// # Errors
    ///
    /// Returns a URL parse error for an invalid Discord authorization base.
    pub fn authorize_url(&self, client_id: &str) -> Result<Url, url::ParseError> {
        let manifest = S0Manifest::default();
        let mut url = Url::parse("https://discord.com/oauth2/authorize")?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("scope", &self.scopes.join(" "))
            .append_pair("state", &self.state)
            .append_pair("code_challenge", &self.code_challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("guild_id", &self.provider_guild_id)
            .append_pair("disable_guild_select", "true")
            .append_pair("integration_type", "0")
            .append_pair("permissions", manifest.guild_permissions);
        Ok(url)
    }
}

#[must_use]
pub fn has_live_guild_install_authority(owner: bool, permissions: &str) -> bool {
    owner
        || permissions
            .parse::<u64>()
            .is_ok_and(|bits| bits & (ADMINISTRATOR | MANAGE_GUILD) != 0)
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
            "https://app.tobot.test/install/discord/callback".to_owned(),
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
        assert_eq!(parameters.get("permissions").map(AsRef::as_ref), Some("0"));
        assert_eq!(
            parameters.get("integration_type").map(AsRef::as_ref),
            Some("0")
        );
        assert_eq!(
            parameters.get("code_challenge_method").map(AsRef::as_ref),
            Some("S256")
        );
    }
}
