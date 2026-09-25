//! Discord SDK containment. Only typed, S0-approved operations cross this
//! boundary; domain crates never receive Twilight values.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::{sync::Mutex, time::Duration};
use thiserror::Error;
use twilight_http::{api_error::ApiError, error::ErrorType, request::AuditLogReason};
use twilight_model::{
    application::{
        command::{Command, CommandOption, CommandOptionType, CommandType},
        interaction::InteractionContextType,
    },
    channel::{
        ChannelType,
        message::{
            AllowedMentions, MessageFlags,
            component::{ActionRow, Button, ButtonStyle, Component},
        },
    },
    guild::Permissions,
    http::interaction::{InteractionResponse, InteractionResponseData, InteractionResponseType},
    id::{
        Id,
        marker::{
            ApplicationMarker, ChannelMarker, CommandVersionMarker, GuildMarker, InteractionMarker,
            RoleMarker, UserMarker,
        },
    },
};

pub const DIAGNOSTIC_COMMAND_NAME: &str = "probe";
pub const TIMEOUT_COMMAND_NAME: &str = "timeout";
pub const DIAGNOSTIC_ACKNOWLEDGEMENT: &str = "Acknowledged.";
pub const SUPPORT_PANEL_CONTENT: &str = "Need help? Open a support ticket.";
pub const INTERACTION_ACK_DEADLINE_MS: u64 = 3_000;
const DISCORD_EPOCH_MS: u64 = 1_420_070_400_000;
const GATEWAY_BOT_PROBE_ATTEMPTS: u8 = 8;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GuildPresenceInspection {
    pub provider_guild_id: String,
    pub present: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TextChannel {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SupportPanelMessage {
    pub application_id: String,
    pub channel_id: String,
    pub content: String,
    pub button_label: String,
    pub custom_id: String,
    pub nonce: u64,
}

fn support_panel_components(label: &str, custom_id: &str) -> [Component; 1] {
    [Component::ActionRow(ActionRow {
        id: None,
        components: vec![Component::Button(Button {
            id: None,
            custom_id: Some(custom_id.to_owned()),
            disabled: false,
            emoji: None,
            label: Some(label.to_owned()),
            style: ButtonStyle::Primary,
            url: None,
            sku_id: None,
        })],
    })]
}

fn deferred_response(ephemeral: bool) -> InteractionResponse {
    InteractionResponse {
        kind: InteractionResponseType::DeferredChannelMessageWithSource,
        data: Some(InteractionResponseData {
            flags: ephemeral.then_some(MessageFlags::EPHEMERAL),
            ..InteractionResponseData::default()
        }),
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GuildRoleView {
    pub id: String,
    pub name: String,
    pub managed: bool,
    pub position: i64,
    pub permissions: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RoleCatalog {
    pub bot_highest_position: i64,
    pub bot_permissions: String,
    pub roles: Vec<GuildRoleView>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct MemberRoles {
    pub role_ids: Vec<String>,
    pub pending: bool,
    pub bot: bool,
}

/// What the executor does before any member-role HTTP call.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RolePreflight {
    Skip,
    Fail,
    Ready,
}

/// The next assignment step. A visible role never produces another PUT.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssignmentStep {
    Skip,
    Fail,
    Unchanged,
    AppliedFromRead,
    Put,
}

#[must_use]
pub fn assignment_step(
    put_count: i32,
    role_present: bool,
    preflight: RolePreflight,
    deadline_passed: bool,
) -> AssignmentStep {
    if deadline_passed {
        return AssignmentStep::Skip;
    }
    if role_present {
        return if put_count == 0 {
            AssignmentStep::Unchanged
        } else {
            AssignmentStep::AppliedFromRead
        };
    }
    match preflight {
        RolePreflight::Skip => AssignmentStep::Skip,
        RolePreflight::Fail => AssignmentStep::Fail,
        RolePreflight::Ready if put_count >= 2 => AssignmentStep::Fail,
        RolePreflight::Ready => AssignmentStep::Put,
    }
}

/// Live hierarchy and permission check. `@everyone` is the role whose id equals the guild id.
#[must_use]
pub fn classify_target_role(
    guild_id: &str,
    role: &GuildRoleView,
    bot_highest_position: i64,
    bot_permissions: u64,
) -> RolePreflight {
    let permissions: u64 = role.permissions.parse().unwrap_or(u64::MAX);
    let sensitive = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 28) | (1 << 40);
    let manage_roles = 1 << 28;
    let administrator = 1 << 3;
    if role.id == guild_id
        || role.managed
        || role.position >= bot_highest_position
        || permissions & sensitive != 0
        || (bot_permissions & manage_roles == 0 && bot_permissions & administrator == 0)
    {
        RolePreflight::Fail
    } else {
        RolePreflight::Ready
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InteractionCallback {
    pub application_id: u64,
    pub interaction_id: u64,
    pub interaction_token: String,
    pub ephemeral: bool,
}

#[derive(Debug, Error)]
pub enum TransportError {
    #[error("Discord request was rate limited; retry after {retry_after_ms} ms")]
    RateLimited { retry_after_ms: u64 },
    #[error("Discord rejected the typed operation: {status}")]
    Rejected { status: u16 },
    #[error("Discord transport failed: {0}")]
    Unavailable(String),
}

/// Separate capability facts. A later field must not overwrite an earlier one.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum CapabilityDecision {
    Allowed,
    Denied,
    Blocked,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ModerationPreflightReport {
    pub actor_permission: CapabilityDecision,
    pub bot_permission: CapabilityDecision,
    pub owner_protection: CapabilityDecision,
    pub hierarchy: CapabilityDecision,
    pub protected_target: CapabilityDecision,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleGrant {
    pub id: u64,
    pub position: i64,
    pub moderate_members: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemberGrant {
    pub user_id: u64,
    pub role_ids: Vec<u64>,
}

/// Read-only guild snapshot. Missing members stay absent instead of being guessed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GuildAccessSnapshot {
    pub guild_id: u64,
    pub owner_id: u64,
    pub roles: Vec<RoleGrant>,
    pub actor: Option<MemberGrant>,
    pub bot: Option<MemberGrant>,
    pub target: Option<MemberGrant>,
    pub protected_targets: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TimeoutOutcome {
    Applied,
    Blocked,
    Failed,
    RateLimited,
    OutcomeUncertain,
}

/// Denied wins over Blocked. Unknown wins over Allowed so a read failure is not permission.
#[must_use]
pub fn combine_preflight(report: &ModerationPreflightReport) -> CapabilityDecision {
    let decisions = [
        report.actor_permission,
        report.owner_protection,
        report.hierarchy,
        report.protected_target,
        report.bot_permission,
    ];
    if decisions.contains(&CapabilityDecision::Denied) {
        return CapabilityDecision::Denied;
    }
    if decisions.contains(&CapabilityDecision::Unknown) {
        return CapabilityDecision::Unknown;
    }
    if decisions.contains(&CapabilityDecision::Blocked) {
        return CapabilityDecision::Blocked;
    }
    CapabilityDecision::Allowed
}

/// Classifies a timeout mutation without a network call.
#[must_use]
pub fn classify_timeout_result(result: Result<(), &TransportError>) -> TimeoutOutcome {
    match result {
        Ok(()) => TimeoutOutcome::Applied,
        Err(TransportError::RateLimited { .. }) => TimeoutOutcome::RateLimited,
        Err(TransportError::Rejected { status: 403 | 404 }) => TimeoutOutcome::Blocked,
        Err(TransportError::Unavailable(_)) => TimeoutOutcome::OutcomeUncertain,
        Err(TransportError::Rejected { .. }) => TimeoutOutcome::Failed,
    }
}

/// Actor permission, bot permission, owner protection, hierarchy, and protected targets stay separate.
#[must_use]
pub fn decide_preflight(snapshot: &GuildAccessSnapshot) -> ModerationPreflightReport {
    let protected = if snapshot
        .protected_targets
        .iter()
        .any(|target| target == &snapshot_target(snapshot))
    {
        CapabilityDecision::Denied
    } else {
        CapabilityDecision::Allowed
    };
    ModerationPreflightReport {
        actor_permission: actor_permission(snapshot),
        bot_permission: bot_permission(snapshot),
        owner_protection: owner_protection(snapshot),
        hierarchy: hierarchy(snapshot),
        protected_target: protected,
    }
}

fn snapshot_target(snapshot: &GuildAccessSnapshot) -> String {
    snapshot
        .target
        .as_ref()
        .map(|member| member.user_id.to_string())
        .unwrap_or_default()
}

fn actor_permission(snapshot: &GuildAccessSnapshot) -> CapabilityDecision {
    let Some(actor) = &snapshot.actor else {
        return CapabilityDecision::Denied;
    };
    if actor.user_id == snapshot.owner_id || holds_moderate(snapshot, actor) {
        CapabilityDecision::Allowed
    } else {
        CapabilityDecision::Denied
    }
}

fn bot_permission(snapshot: &GuildAccessSnapshot) -> CapabilityDecision {
    match &snapshot.bot {
        Some(bot) if holds_moderate(snapshot, bot) => CapabilityDecision::Allowed,
        Some(_) | None => CapabilityDecision::Blocked,
    }
}

fn owner_protection(snapshot: &GuildAccessSnapshot) -> CapabilityDecision {
    match &snapshot.target {
        Some(target) if target.user_id == snapshot.owner_id => CapabilityDecision::Denied,
        Some(_) => CapabilityDecision::Allowed,
        None => CapabilityDecision::Unknown,
    }
}

fn hierarchy(snapshot: &GuildAccessSnapshot) -> CapabilityDecision {
    let (Some(actor), Some(bot), Some(target)) = (&snapshot.actor, &snapshot.bot, &snapshot.target)
    else {
        return CapabilityDecision::Unknown;
    };
    let actor_outranks = actor.user_id == snapshot.owner_id
        || top_position(snapshot, actor) > top_position(snapshot, target);
    let bot_outranks = top_position(snapshot, bot) > top_position(snapshot, target);
    if actor_outranks && bot_outranks {
        CapabilityDecision::Allowed
    } else {
        CapabilityDecision::Denied
    }
}

fn holds_moderate(snapshot: &GuildAccessSnapshot, member: &MemberGrant) -> bool {
    let mut roles = member.role_ids.clone();
    if !roles.contains(&snapshot.guild_id) {
        roles.push(snapshot.guild_id);
    }
    snapshot
        .roles
        .iter()
        .any(|role| roles.contains(&role.id) && role.moderate_members)
}

fn top_position(snapshot: &GuildAccessSnapshot, member: &MemberGrant) -> i64 {
    snapshot
        .roles
        .iter()
        .filter(|role| member.role_ids.contains(&role.id))
        .map(|role| role.position)
        .max()
        .unwrap_or(0)
}

pub struct OAuthTokenSet {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in_seconds: u64,
    pub scopes: Vec<String>,
    pub guild: Option<DiscordAuthorizedGuild>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DiscordAuthorizedGuild {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DiscordAuthorizationUser {
    pub id: String,
    pub username: String,
    pub global_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DiscordGuildObservation {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub owner: bool,
    pub permissions: String,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    scope: String,
    guild: Option<DiscordAuthorizedGuild>,
}

#[derive(Deserialize)]
struct GatewayRateLimitBody {
    retry_after: f64,
    global: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProviderRateLimit {
    pub retry_after_ms: u64,
    pub global: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SessionStartBudget {
    pub remaining: u32,
    pub reset_after_ms: u64,
    pub max_concurrency: u16,
}

#[derive(Deserialize)]
struct CurrentAuthorizationResponse {
    scopes: Vec<String>,
    user: Option<DiscordAuthorizationUser>,
}

#[derive(Clone)]
pub struct DiscordOAuthClient {
    client: reqwest::Client,
    client_id: String,
    client_secret: String,
}

impl DiscordOAuthClient {
    /// # Errors
    ///
    /// Returns an error when the bounded HTTP client cannot be constructed.
    pub fn new(client_id: String, client_secret: String) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_millis(500))
                .timeout(Duration::from_secs(3))
                .build()?,
            client_id,
            client_secret,
        })
    }

    /// Exchanges a single-use authorization code with its server-held PKCE
    /// verifier. Provider response bodies are never included in errors.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error for provider rejection or
    /// unavailability.
    pub async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> Result<OAuthTokenSet, TransportError> {
        let response = self
            .client
            .post("https://discord.com/api/v10/oauth2/token")
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect_uri),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Discord OAuth unavailable".to_owned()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(TransportError::Rejected {
                status: status.as_u16(),
            });
        }
        let token = response.json::<OAuthTokenResponse>().await.map_err(|_| {
            TransportError::Unavailable("Discord OAuth response invalid".to_owned())
        })?;
        Ok(OAuthTokenSet {
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_in_seconds: token.expires_in,
            scopes: canonical_scopes(&token.scope),
            guild: token.guild,
        })
    }

    /// Exchanges a refresh token. The caller must not move the session's
    /// absolute expiry when it stores the new credential.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error. The response body is not included.
    pub async fn refresh_access_token(
        &self,
        refresh_token: &str,
    ) -> Result<OAuthTokenSet, TransportError> {
        let response = self
            .client
            .post("https://discord.com/api/v10/oauth2/token")
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&refresh_grant_form(refresh_token))
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Discord OAuth unavailable".to_owned()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(TransportError::Rejected {
                status: status.as_u16(),
            });
        }
        let token = response.json::<OAuthTokenResponse>().await.map_err(|_| {
            TransportError::Unavailable("Discord OAuth response invalid".to_owned())
        })?;
        Ok(OAuthTokenSet {
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_in_seconds: token.expires_in,
            scopes: canonical_scopes(&token.scope),
            guild: token.guild,
        })
    }

    /// Reads the authorization owner under the OAuth credential class.
    ///
    /// # Errors
    ///
    /// Returns a classified error when Discord rejects or cannot serve the
    /// bearer credential.
    pub async fn current_user(
        &self,
        access_token: &str,
    ) -> Result<(DiscordAuthorizationUser, Vec<String>), TransportError> {
        let response = self
            .client
            .get("https://discord.com/api/v10/oauth2/@me")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Discord OAuth unavailable".to_owned()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(TransportError::Rejected {
                status: status.as_u16(),
            });
        }
        let authorization = response
            .json::<CurrentAuthorizationResponse>()
            .await
            .map_err(|_| {
                TransportError::Unavailable("Discord OAuth response invalid".to_owned())
            })?;
        let user = authorization
            .user
            .ok_or(TransportError::Rejected { status: 403 })?;
        Ok((user, canonical_scope_values(authorization.scopes)))
    }

    /// Reads every guild visible to the current OAuth user. These values are
    /// discovery observations only and must never authorize a mutation.
    ///
    /// # Errors
    ///
    /// Returns a classified error for provider rejection, malformed pages,
    /// transport failure, or an unexpectedly unbounded result set.
    pub async fn current_user_guilds(
        &self,
        access_token: &str,
    ) -> Result<Vec<DiscordGuildObservation>, TransportError> {
        const PAGE_SIZE: usize = 200;
        const MAX_PAGES: usize = 10;
        let mut observations = Vec::new();
        let mut after: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut request = self
                .client
                .get("https://discord.com/api/v10/users/@me/guilds")
                .bearer_auth(access_token)
                .query(&[("limit", PAGE_SIZE)]);
            if let Some(cursor) = after.as_deref() {
                request = request.query(&[("after", cursor)]);
            }
            let response = request.send().await.map_err(|_| {
                TransportError::Unavailable("Discord guild discovery unavailable".to_owned())
            })?;
            let status = response.status();
            if !status.is_success() {
                return Err(TransportError::Rejected {
                    status: status.as_u16(),
                });
            }
            let page = response
                .json::<Vec<DiscordGuildObservation>>()
                .await
                .map_err(|_| {
                    TransportError::Unavailable(
                        "Discord guild discovery response invalid".to_owned(),
                    )
                })?;
            let page_len = page.len();
            after = page.last().map(|guild| guild.id.clone());
            observations.extend(page);
            if page_len < PAGE_SIZE {
                return Ok(observations);
            }
        }
        Err(TransportError::Unavailable(
            "Discord guild discovery exceeded the bounded page limit".to_owned(),
        ))
    }

    /// Revokes an OAuth authorization after its one-purpose installation
    /// evidence has been persisted. Discord revokes the associated access and
    /// refresh tokens together.
    ///
    /// # Errors
    ///
    /// Returns a classified error without including credential material.
    pub async fn revoke_token(&self, token: &str) -> Result<(), TransportError> {
        let response = self
            .client
            .post("https://discord.com/api/v10/oauth2/token/revoke")
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&[("token", token), ("token_type_hint", "access_token")])
            .send()
            .await
            .map_err(|_| TransportError::Unavailable("Discord OAuth unavailable".to_owned()))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(TransportError::Rejected {
                status: response.status().as_u16(),
            })
        }
    }
}

fn canonical_scopes(value: &str) -> Vec<String> {
    canonical_scope_values(value.split_ascii_whitespace().map(str::to_owned).collect())
}

fn canonical_scope_values(mut scopes: Vec<String>) -> Vec<String> {
    scopes.sort_unstable();
    scopes.dedup();
    scopes
}

#[async_trait]
pub trait DiscordTransport: Send + Sync {
    async fn respond_to_interaction(
        &self,
        request: InteractionCallback,
    ) -> Result<(), TransportError>;
    async fn defer_interaction(&self, request: InteractionCallback) -> Result<(), TransportError>;
}

/// Session-start budget for Edge. This type cannot register commands or inspect
/// guilds; those calls stay on the Delivery transport.
pub struct GatewaySessionStart {
    client: twilight_http::Client,
    governor: Mutex<TransportGovernor>,
    token: String,
}

impl GatewaySessionStart {
    #[must_use]
    pub fn new(bot_token: String) -> Self {
        let _ = rustls::crypto::ring::default_provider().install_default();
        Self {
            client: twilight_http::Client::new(bot_token.clone()),
            governor: Mutex::new(TransportGovernor::default()),
            token: bot_token,
        }
    }

    fn governor(&self) -> std::sync::MutexGuard<'_, TransportGovernor> {
        self.governor
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn preflight(&self) -> Result<(), TransportError> {
        self.governor().preflight(unix_now_ms())
    }

    fn note(&self, error: &TransportError) {
        self.governor().note(error, unix_now_ms());
    }

    /// Reads `GET /gateway/bot` session-start budget before a shard connects.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error. The response body is not included.
    pub async fn session_start_budget(&self) -> Result<SessionStartBudget, TransportError> {
        self.preflight()?;
        let response = self.client.gateway().authed().await.map_err(|error| {
            let mapped = TwilightTransport::map_error(&error);
            self.note(&mapped);
            mapped
        })?;
        let info = response.model().await.map_err(|_| {
            TransportError::Unavailable("gateway bot response unavailable".to_owned())
        })?;
        Ok(SessionStartBudget {
            remaining: info.session_start_limit.remaining,
            reset_after_ms: info.session_start_limit.reset_after,
            max_concurrency: info.session_start_limit.max_concurrency,
        })
    }

    /// Sends at most eight `GET /gateway/bot` requests with no local limiter,
    /// and stops at the first Discord HTTP 429. This is the sandbox proof that
    /// a real `retry_after` was observed. It does not keep requesting after that.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error. The response body is not included
    /// except for `retry_after` and `global`.
    pub async fn observe_gateway_bot_limit(
        &self,
    ) -> Result<Option<ProviderRateLimit>, TransportError> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(500))
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| {
                TransportError::Unavailable("rate-limit probe client unavailable".to_owned())
            })?;
        for _ in 0..GATEWAY_BOT_PROBE_ATTEMPTS {
            self.preflight()?;
            let response = http
                .get("https://discord.com/api/v10/gateway/bot")
                .header("authorization", format!("Bot {}", self.token))
                .header("user-agent", "DiscordBot (https://www.tobot.test, 0.1.0)")
                .send()
                .await
                .map_err(|_| {
                    TransportError::Unavailable("gateway bot probe unavailable".to_owned())
                })?;
            if response.status().as_u16() == 429 {
                let body = response.json::<GatewayRateLimitBody>().await.map_err(|_| {
                    TransportError::Unavailable("rate-limit body unavailable".to_owned())
                })?;
                let retry_after_ms = TwilightTransport::retry_after_ms(body.retry_after);
                let TransportAdmission::Wait { retry_after_ms } =
                    admission_after_limit(body.global, false, retry_after_ms)
                else {
                    return Ok(Some(ProviderRateLimit {
                        retry_after_ms,
                        global: body.global,
                    }));
                };
                self.note(&TransportError::RateLimited { retry_after_ms });
                return Ok(Some(ProviderRateLimit {
                    retry_after_ms,
                    global: body.global,
                }));
            }
            let status = response.status();
            if !status.is_success() {
                let error = TransportError::Rejected {
                    status: status.as_u16(),
                };
                self.note(&error);
                return Err(error);
            }
        }
        Ok(None)
    }
}

/// Holds the bot-token HTTP client privately. Concrete response mapping is
/// added only to the two trait methods; there is intentionally no `client()`
/// escape hatch for arbitrary REST paths.
pub struct TwilightTransport {
    client: twilight_http::Client,
    governor: Mutex<TransportGovernor>,
}

impl TwilightTransport {
    /// Lists only guild text channels for the welcome form.
    /// # Errors
    /// Returns a classified Discord transport error.
    pub async fn list_text_channels(&self, guild: u64) -> Result<Vec<TextChannel>, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild)?;
        self.preflight()?;
        let response = self
            .client
            .guild_channels(guild_id)
            .await
            .map_err(|error| self.noted(&error))?;
        let channels = response
            .models()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(channels
            .into_iter()
            .filter(|channel| channel.kind == ChannelType::GuildText)
            .map(|channel| TextChannel {
                id: channel.id.to_string(),
                name: channel.name.unwrap_or_else(|| "text-channel".to_owned()),
            })
            .collect())
    }

    /// Creates one plain-text message with its durable numeric nonce.
    /// # Errors
    /// Returns a classified Discord transport error. Callers must reconcile
    /// any uncertain result by nonce before considering another POST.
    pub async fn create_channel_message(
        &self,
        channel: u64,
        member: u64,
        content: &str,
        nonce: u64,
    ) -> Result<String, TransportError> {
        let channel_id = snowflake::<ChannelMarker>(channel)?;
        let member_id = snowflake::<UserMarker>(member)?;
        let mentions = AllowedMentions {
            users: vec![member_id],
            ..AllowedMentions::default()
        };
        self.preflight()?;
        let response = self
            .client
            .create_message(channel_id)
            .content(content)
            .nonce(nonce)
            .allowed_mentions(Some(&mentions))
            .await
            .map_err(|error| self.noted(&error))?;
        let message = response
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(message.id.to_string())
    }

    /// Envía un mensaje de texto con exactamente un botón primario.
    /// # Errors
    /// Devuelve un error clasificado; no se repite un POST de resultado incierto sin reconciliarlo.
    pub async fn create_support_panel(
        &self,
        request: &SupportPanelMessage,
    ) -> Result<String, TransportError> {
        let channel = request
            .channel_id
            .parse::<u64>()
            .map_err(|_| TransportError::Rejected { status: 400 })?;
        let channel = snowflake::<ChannelMarker>(channel)?;
        let components = support_panel_components(&request.button_label, &request.custom_id);
        self.preflight()?;
        let response = self
            .client
            .create_message(channel)
            .content(&request.content)
            .nonce(request.nonce)
            .allowed_mentions(Some(&AllowedMentions::default()))
            .components(&components)
            .await
            .map_err(|error| {
                tracing::warn!(discord_error=%error, "Discord support panel create failed");
                self.noted(&error)
            })?;
        let message = response
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        let button_confirmed = matches!(message.components.as_slice(), [Component::ActionRow(row)]
            if matches!(row.components.as_slice(), [Component::Button(button)]
                if button.style == ButtonStyle::Primary
                    && !button.disabled
                    && button.custom_id.as_deref() == Some(request.custom_id.as_str())
                    && button.label.as_deref() == Some(request.button_label.as_str())));
        if message.channel_id != channel
            || message.author.id.to_string() != request.application_id
            || message.content != request.content
            || !button_confirmed
        {
            return Err(TransportError::Unavailable(
                "Discord panel confirmation did not match the requested binding".to_owned(),
            ));
        }
        Ok(message.id.to_string())
    }

    /// Sustituye el mensaje efímero de espera.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn edit_deferred_support_response(
        &self,
        callback: &InteractionCallback,
        content: &str,
    ) -> Result<(), TransportError> {
        let application = snowflake::<ApplicationMarker>(callback.application_id)?;
        if callback.interaction_token.is_empty() || !callback.ephemeral {
            return Err(TransportError::Rejected { status: 400 });
        }
        self.preflight()?;
        self.client
            .interaction(application)
            .update_response(&callback.interaction_token)
            .content(Some(content))
            .await
            .map_err(|error| self.noted(&error))?;
        Ok(())
    }

    /// Disposable guild-role read for publish and execution. This is not a catalog write.
    /// # Errors
    /// Returns a classified Discord transport error.
    pub async fn role_catalog(&self, guild: u64) -> Result<RoleCatalog, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild)?;
        self.preflight()?;
        let roles = self
            .client
            .roles(guild_id)
            .await
            .map_err(|error| self.noted(&error))?
            .models()
            .await
            .map_err(|error| self.note_text(error))?;
        let me = self
            .client
            .current_user()
            .await
            .map_err(|error| self.noted(&error))?
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        let member = self.member_model(guild_id, me.id).await?;
        let mut bits = 0u64;
        let mut highest = 0i64;
        for role in &roles {
            if role.id.get() == guild || member.roles.contains(&role.id) {
                bits |= role.permissions.bits();
                highest = highest.max(role.position);
            }
        }
        Ok(RoleCatalog {
            bot_highest_position: highest,
            bot_permissions: bits.to_string(),
            roles: roles
                .into_iter()
                .map(|role| GuildRoleView {
                    id: role.id.to_string(),
                    name: role.name,
                    managed: role.managed,
                    position: role.position,
                    permissions: role.permissions.bits().to_string(),
                })
                .collect(),
        })
    }

    /// # Errors
    /// Returns a classified Discord transport error. `404` means the member is gone.
    pub async fn member_roles(&self, guild: u64, user: u64) -> Result<MemberRoles, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild)?;
        let user_id = snowflake::<UserMarker>(user)?;
        self.preflight()?;
        let member = self.member_model(guild_id, user_id).await?;
        Ok(MemberRoles {
            role_ids: member
                .roles
                .into_iter()
                .map(|role| role.to_string())
                .collect(),
            pending: member.pending,
            bot: member.user.bot,
        })
    }

    /// Adds one role. There is no replace of the member's role list.
    /// # Errors
    /// Returns a classified Discord transport error.
    pub async fn add_member_role(
        &self,
        guild: u64,
        user: u64,
        role: u64,
        reason: &str,
    ) -> Result<(), TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild)?;
        let user_id = snowflake::<UserMarker>(user)?;
        let role_id = snowflake::<RoleMarker>(role)?;
        self.preflight()?;
        let request = self
            .client
            .add_guild_member_role(guild_id, user_id, role_id)
            .reason(reason);
        request
            .await
            .map(|_| ())
            .map_err(|error| self.noted(&error))
    }

    #[must_use]
    pub fn new(bot_token: String) -> Self {
        // Twilight selects rustls without installing a process crypto provider.
        // HTTPS to Discord then fails before a status exists.
        let _ = rustls::crypto::ring::default_provider().install_default();
        Self {
            client: twilight_http::Client::new(bot_token),
            governor: Mutex::new(TransportGovernor::default()),
        }
    }

    /// Invalid responses counted in the current ten-minute window.
    #[must_use]
    pub fn invalid_request_count(&self) -> i64 {
        i64::from(self.governor().budget.count(unix_now_ms()))
    }

    /// HTTP 429 responses observed by this process.
    #[must_use]
    pub fn http_429_count(&self) -> i64 {
        i64::try_from(self.governor().http_429).unwrap_or(i64::MAX)
    }

    fn governor(&self) -> std::sync::MutexGuard<'_, TransportGovernor> {
        self.governor
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn preflight(&self) -> Result<(), TransportError> {
        self.governor().preflight(unix_now_ms())
    }

    fn note(&self, error: &TransportError) {
        self.governor().note(error, unix_now_ms());
    }

    fn response_data(ephemeral: bool, content: Option<&str>) -> InteractionResponseData {
        InteractionResponseData {
            content: content.map(ToOwned::to_owned),
            flags: ephemeral.then_some(MessageFlags::EPHEMERAL),
            ..InteractionResponseData::default()
        }
    }

    /// Registers the single guild-scoped diagnostic command. Unchanged
    /// registrations are not a command edit, so this can run on each guild
    /// arrival.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error when Discord rejects the command.
    pub async fn register_diagnostic_command(
        &self,
        application_id: u64,
        guild_id: u64,
    ) -> Result<(), TransportError> {
        let application_id = Id::<ApplicationMarker>::new_checked(application_id)
            .ok_or(TransportError::Rejected { status: 400 })?;
        let guild_id = Id::<GuildMarker>::new_checked(guild_id)
            .ok_or(TransportError::Rejected { status: 400 })?;
        let commands = [diagnostic_command(), timeout_command()];
        self.preflight()?;
        let result = self
            .client
            .interaction(application_id)
            .set_guild_commands(guild_id, &commands)
            .await
            .map(|_| ())
            .map_err(|error| Self::map_error(&error));
        if let Err(error) = &result {
            self.note(error);
        }
        result
    }

    fn ids(
        request: &InteractionCallback,
    ) -> Result<(Id<ApplicationMarker>, Id<InteractionMarker>), TransportError> {
        let application_id = Id::new_checked(request.application_id)
            .ok_or(TransportError::Rejected { status: 400 })?;
        let interaction_id = Id::new_checked(request.interaction_id)
            .ok_or(TransportError::Rejected { status: 400 })?;

        if request.interaction_token.is_empty() {
            return Err(TransportError::Rejected { status: 400 });
        }

        Ok((application_id, interaction_id))
    }

    async fn create_response(
        &self,
        request: InteractionCallback,
        response: InteractionResponse,
    ) -> Result<(), TransportError> {
        let (application_id, interaction_id) = Self::ids(&request)?;
        self.preflight()?;
        let result = self
            .client
            .interaction(application_id)
            .create_response(interaction_id, &request.interaction_token, &response)
            .await
            .map(|_| ())
            .map_err(|error| Self::map_error(&error));
        if let Err(error) = &result {
            self.note(error);
        }
        result
    }

    fn map_error(error: &twilight_http::Error) -> TransportError {
        match error.kind() {
            ErrorType::Response {
                error: ApiError::Ratelimited(rate_limit),
                ..
            } => TransportError::RateLimited {
                retry_after_ms: Self::retry_after_ms(rate_limit.retry_after),
            },
            ErrorType::Response { status, .. } => TransportError::Rejected {
                status: status.get(),
            },
            _ => {
                let mut detail = error.to_string();
                if let Some(source) = std::error::Error::source(error) {
                    detail.push_str(": ");
                    detail.push_str(&source.to_string());
                }
                TransportError::Unavailable(detail)
            }
        }
    }

    fn retry_after_ms(seconds: f64) -> u64 {
        match Duration::try_from_secs_f64(seconds.max(0.0)) {
            Ok(duration) => match u64::try_from(duration.as_millis()) {
                Ok(milliseconds) => milliseconds.max(1),
                Err(_) => u64::MAX,
            },
            Err(_) => 1_000,
        }
    }

    /// Inspects whether the bot credential can currently observe one guild.
    /// This is evidence only; Installation remains responsible for aggregate
    /// capability evaluation.
    ///
    /// # Errors
    ///
    /// Returns a classified provider or transport error. Discord 403/404 are
    /// represented as an absent observation rather than transport failure.
    pub async fn inspect_guild_presence(
        &self,
        provider_guild_id: &str,
    ) -> Result<GuildPresenceInspection, TransportError> {
        let raw_id = provider_guild_id
            .parse::<u64>()
            .map_err(|_| TransportError::Rejected { status: 400 })?;
        let guild_id = Id::<GuildMarker>::new_checked(raw_id)
            .ok_or(TransportError::Rejected { status: 400 })?;
        self.preflight()?;
        match self.client.guild(guild_id).await {
            Ok(_) => Ok(GuildPresenceInspection {
                provider_guild_id: provider_guild_id.to_owned(),
                present: true,
            }),
            Err(error) => match error.kind() {
                ErrorType::Response { status, .. } if status.get() == 404 => {
                    Ok(GuildPresenceInspection {
                        provider_guild_id: provider_guild_id.to_owned(),
                        present: false,
                    })
                }
                ErrorType::Response { status, .. } if status.get() == 403 => {
                    self.note(&TransportError::Rejected { status: 403 });
                    Ok(GuildPresenceInspection {
                        provider_guild_id: provider_guild_id.to_owned(),
                        present: false,
                    })
                }
                _ => {
                    let mapped = Self::map_error(&error);
                    self.note(&mapped);
                    Err(mapped)
                }
            },
        }
    }
}

impl TwilightTransport {
    /// Read-only preflight. It does not change the member.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error. A rate limit is not turned into a permission.
    pub async fn moderation_preflight(
        &self,
        guild_id: u64,
        actor_user_id: u64,
        target_user_id: u64,
        protected_targets: &[String],
    ) -> Result<ModerationPreflightReport, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild_id)?;
        let actor_user_id = snowflake::<UserMarker>(actor_user_id)?;
        let target_user_id = snowflake::<UserMarker>(target_user_id)?;
        self.preflight()?;
        let guild = self.guild_model(guild_id).await?;
        let bot_user = self.current_bot_user().await?;
        let actor = self.member_grant(guild_id, actor_user_id).await?;
        let bot = self.member_grant(guild_id, bot_user).await?;
        let target = self.member_grant(guild_id, target_user_id).await?;
        Ok(decide_preflight(&GuildAccessSnapshot {
            guild_id: guild.id.get(),
            owner_id: guild.owner_id.get(),
            roles: guild
                .roles
                .iter()
                .map(|role| RoleGrant {
                    id: role.id.get(),
                    position: role.position,
                    moderate_members: role.permissions.contains(Permissions::MODERATE_MEMBERS),
                })
                .collect(),
            actor,
            bot,
            target,
            protected_targets: protected_targets.to_vec(),
        }))
    }

    /// # Errors
    ///
    /// Returns a classified transport error when Discord does not confirm the timeout.
    pub async fn apply_member_timeout(
        &self,
        guild_id: u64,
        user_id: u64,
        until_unix: i64,
        reason: &str,
    ) -> Result<(), TransportError> {
        let until = twilight_model::util::Timestamp::from_secs(until_unix)
            .map_err(|_| TransportError::Rejected { status: 400 })?;
        self.patch_timeout(guild_id, user_id, Some(until), reason)
            .await
    }

    /// An already clear timeout is a no-op.
    ///
    /// # Errors
    ///
    /// Returns a classified transport error when Discord does not confirm the clear.
    pub async fn clear_member_timeout(
        &self,
        guild_id: u64,
        user_id: u64,
        reason: &str,
    ) -> Result<(), TransportError> {
        if !self.member_timeout_active(guild_id, user_id).await? {
            return Ok(());
        }
        self.patch_timeout(guild_id, user_id, None, reason).await
    }

    /// # Errors
    ///
    /// Returns a classified transport error when the member cannot be read.
    pub async fn member_timeout_active(
        &self,
        guild_id: u64,
        user_id: u64,
    ) -> Result<bool, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild_id)?;
        let user_id = snowflake::<UserMarker>(user_id)?;
        self.preflight()?;
        let member = self.member_model(guild_id, user_id).await?;
        let Some(until) = member.communication_disabled_until else {
            return Ok(false);
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| {
                i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX)
            });
        Ok(until.as_secs() > now)
    }

    /// # Errors
    ///
    /// Returns a classified transport error when Discord rejects the follow-up.
    pub async fn create_followup(
        &self,
        request: InteractionCallback,
        content: &str,
    ) -> Result<(), TransportError> {
        let (application_id, _) = Self::ids(&request)?;
        self.preflight()?;
        let result = self
            .client
            .interaction(application_id)
            .create_followup(&request.interaction_token)
            .content(content)
            .flags(MessageFlags::EPHEMERAL)
            .await
            .map(|_| ())
            .map_err(|error| Self::map_error(&error));
        if let Err(error) = &result {
            self.note(error);
        }
        result
    }

    async fn patch_timeout(
        &self,
        guild_id: u64,
        user_id: u64,
        until: Option<twilight_model::util::Timestamp>,
        reason: &str,
    ) -> Result<(), TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild_id)?;
        let user_id = snowflake::<UserMarker>(user_id)?;
        self.preflight()?;
        let reason = bounded_audit_reason(reason);
        let result = self
            .client
            .update_guild_member(guild_id, user_id)
            .communication_disabled_until(until)
            .reason(&reason)
            .await
            .map(|_| ())
            .map_err(|error| Self::map_error(&error));
        if let Err(error) = &result {
            self.note(error);
        }
        result
    }

    async fn guild_model(
        &self,
        guild_id: Id<GuildMarker>,
    ) -> Result<twilight_model::guild::Guild, TransportError> {
        let response = self
            .client
            .guild(guild_id)
            .await
            .map_err(|error| self.noted(&error))?;
        response
            .model()
            .await
            .map_err(|error| self.note_text(error))
    }

    async fn current_bot_user(&self) -> Result<Id<UserMarker>, TransportError> {
        let response = self
            .client
            .current_user()
            .await
            .map_err(|error| self.noted(&error))?;
        let user = response
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(user.id)
    }

    async fn member_grant(
        &self,
        guild_id: Id<GuildMarker>,
        user_id: Id<UserMarker>,
    ) -> Result<Option<MemberGrant>, TransportError> {
        match self.member_model(guild_id, user_id).await {
            Ok(member) => Ok(Some(MemberGrant {
                user_id: user_id.get(),
                role_ids: member.roles.iter().map(|role| role.get()).collect(),
            })),
            Err(TransportError::Rejected { status: 404 }) => Ok(None),
            Err(error) => Err(error),
        }
    }

    async fn member_model(
        &self,
        guild_id: Id<GuildMarker>,
        user_id: Id<UserMarker>,
    ) -> Result<twilight_model::guild::Member, TransportError> {
        let response = self
            .client
            .guild_member(guild_id, user_id)
            .await
            .map_err(|error| self.noted(&error))?;
        response
            .model()
            .await
            .map_err(|error| self.note_text(error))
    }

    fn noted(&self, error: &twilight_http::Error) -> TransportError {
        let mapped = Self::map_error(error);
        self.note(&mapped);
        mapped
    }

    fn note_text(&self, error: impl std::fmt::Display) -> TransportError {
        let mapped = TransportError::Unavailable(error.to_string());
        self.note(&mapped);
        mapped
    }
}

fn snowflake<T>(raw: u64) -> Result<Id<T>, TransportError> {
    Id::new_checked(raw).ok_or(TransportError::Rejected { status: 400 })
}

fn bounded_audit_reason(reason: &str) -> String {
    let mut bounded = String::new();
    for character in reason.chars() {
        if bounded.len() + character.len_utf8() > 500 {
            break;
        }
        bounded.push(character);
    }
    bounded
}

#[async_trait]
impl DiscordTransport for TwilightTransport {
    async fn respond_to_interaction(
        &self,
        request: InteractionCallback,
    ) -> Result<(), TransportError> {
        let response = InteractionResponse {
            kind: InteractionResponseType::ChannelMessageWithSource,
            data: Some(Self::response_data(
                request.ephemeral,
                Some(DIAGNOSTIC_ACKNOWLEDGEMENT),
            )),
        };

        self.create_response(request, response).await
    }

    async fn defer_interaction(&self, request: InteractionCallback) -> Result<(), TransportError> {
        let response = deferred_response(request.ephemeral);

        self.create_response(request, response).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn support_panel_has_one_primary_button_and_no_select() {
        let value = serde_json::to_value(support_panel_components("Open ticket", "support:abc"))
            .unwrap_or_else(|error| panic!("componentes inválidos: {error}"));
        assert_eq!(value[0]["type"], 1);
        assert_eq!(value[0]["components"].as_array().map(Vec::len), Some(1));
        assert_eq!(value[0]["components"][0]["type"], 2);
        assert_eq!(value[0]["components"][0]["style"], 1);
        assert_eq!(value[0]["components"][0]["custom_id"], "support:abc");
    }

    #[test]
    fn support_defer_is_type_five_and_ephemeral() {
        let response = serde_json::to_value(deferred_response(true))
            .unwrap_or_else(|error| panic!("respuesta inválida: {error}"));
        assert_eq!(response["type"], 5);
        assert_eq!(response["data"]["flags"], 64);
    }

    #[test]
    fn assignment_step_reads_before_a_second_put() {
        assert_eq!(
            assignment_step(1, true, RolePreflight::Ready, false),
            AssignmentStep::AppliedFromRead
        );
        assert_eq!(
            assignment_step(0, true, RolePreflight::Ready, false),
            AssignmentStep::Unchanged
        );
        assert_eq!(
            assignment_step(1, false, RolePreflight::Ready, false),
            AssignmentStep::Put
        );
        assert_eq!(
            assignment_step(2, false, RolePreflight::Ready, false),
            AssignmentStep::Fail
        );
        assert_eq!(
            assignment_step(0, false, RolePreflight::Ready, true),
            AssignmentStep::Skip
        );
        let above = GuildRoleView {
            id: "9".to_owned(),
            name: "staff".to_owned(),
            managed: false,
            position: 5,
            permissions: "0".to_owned(),
        };
        assert_eq!(
            classify_target_role("1", &above, 5, 1 << 28),
            RolePreflight::Fail
        );
        let safe = GuildRoleView {
            position: 1,
            ..above
        };
        assert_eq!(
            classify_target_role("1", &safe, 5, 1 << 28),
            RolePreflight::Ready
        );
        assert_eq!(classify_target_role("1", &safe, 5, 0), RolePreflight::Fail);
    }

    #[test]
    fn timeout_classification_does_not_call_discord() {
        assert_eq!(classify_timeout_result(Ok(())), TimeoutOutcome::Applied);
        assert_eq!(
            classify_timeout_result(Err(&TransportError::Rejected { status: 403 })),
            TimeoutOutcome::Blocked
        );
        assert_eq!(
            classify_timeout_result(Err(&TransportError::RateLimited { retry_after_ms: 1 })),
            TimeoutOutcome::RateLimited
        );
        assert_eq!(
            classify_timeout_result(Err(&TransportError::Unavailable("lost".to_owned()))),
            TimeoutOutcome::OutcomeUncertain
        );
        let denied = decide_preflight(&GuildAccessSnapshot {
            guild_id: 1,
            owner_id: 9,
            roles: vec![RoleGrant {
                id: 2,
                position: 1,
                moderate_members: true,
            }],
            actor: Some(MemberGrant {
                user_id: 3,
                role_ids: vec![2],
            }),
            bot: Some(MemberGrant {
                user_id: 4,
                role_ids: vec![2],
            }),
            target: Some(MemberGrant {
                user_id: 9,
                role_ids: vec![],
            }),
            protected_targets: Vec::new(),
        });
        assert_eq!(denied.owner_protection, CapabilityDecision::Denied);
        assert_eq!(denied.actor_permission, CapabilityDecision::Allowed);
        assert_eq!(combine_preflight(&denied), CapabilityDecision::Denied);
    }

    #[test]
    fn response_data_only_sets_ephemeral_when_requested() {
        let acknowledged = TwilightTransport::response_data(true, Some(DIAGNOSTIC_ACKNOWLEDGEMENT));
        assert_eq!(acknowledged.flags, Some(MessageFlags::EPHEMERAL));
        assert_eq!(
            acknowledged.content.as_deref(),
            Some(DIAGNOSTIC_ACKNOWLEDGEMENT)
        );
        assert_eq!(TwilightTransport::response_data(false, None).flags, None);
        assert!(
            TwilightTransport::response_data(false, None)
                .content
                .is_none()
        );
    }

    #[test]
    fn zero_ids_and_empty_tokens_are_rejected_before_network_io() {
        let request = InteractionCallback {
            application_id: 0,
            interaction_id: 1,
            interaction_token: "token".to_owned(),
            ephemeral: false,
        };
        assert!(matches!(
            TwilightTransport::ids(&request),
            Err(TransportError::Rejected { status: 400 })
        ));

        let request = InteractionCallback {
            application_id: 1,
            interaction_id: 1,
            interaction_token: String::new(),
            ephemeral: false,
        };
        assert!(matches!(
            TwilightTransport::ids(&request),
            Err(TransportError::Rejected { status: 400 })
        ));
    }

    #[test]
    fn retry_duration_is_rounded_without_overflowing() {
        assert_eq!(TwilightTransport::retry_after_ms(0.0001), 1);
        assert_eq!(TwilightTransport::retry_after_ms(1.5), 1_500);
        assert_eq!(TwilightTransport::retry_after_ms(f64::INFINITY), 1_000);
    }

    #[test]
    fn guild_discovery_preserves_snowflakes_and_permission_bits_as_strings() {
        let Ok(guild): Result<DiscordGuildObservation, _> = serde_json::from_str(
            r#"{
                "id":"80351110224678912",
                "name":"Guild",
                "icon":null,
                "owner":false,
                "permissions":"1125899906842624"
            }"#,
        ) else {
            panic!("fixture must deserialize");
        };
        assert_eq!(guild.id, "80351110224678912");
        assert_eq!(guild.permissions, "1125899906842624");
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RateSnapshot {
    pub remaining: u32,
    pub retry_after_ms: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransportAdmission {
    Admit,
    Wait { retry_after_ms: u64 },
}

/// Discord counts HTTP 401, 403, and 429 toward `10_000` invalid requests in
/// ten minutes. The circuit opens before that ban.
pub const INVALID_REQUEST_WINDOW_MS: u64 = 600_000;
pub const INVALID_REQUEST_LIMIT: u32 = 10_000;
pub const INVALID_REQUEST_CIRCUIT: u32 = 8_000;

#[derive(Clone, Debug, Default)]
pub struct InvalidRequestBudget {
    observed_at_ms: Vec<u64>,
    credentials_rejected: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EgressGuard {
    Open,
    CredentialsRejected,
    CircuitOpen { retry_after_ms: u64 },
}

impl InvalidRequestBudget {
    /// Drops hits outside the ten-minute window and reports whether egress may continue.
    pub fn guard(&mut self, now_ms: u64) -> EgressGuard {
        self.prune(now_ms);
        if self.credentials_rejected {
            return EgressGuard::CredentialsRejected;
        }
        let count = self.count(now_ms);
        if count < INVALID_REQUEST_CIRCUIT {
            return EgressGuard::Open;
        }
        let oldest = self.observed_at_ms.first().copied().unwrap_or(now_ms);
        EgressGuard::CircuitOpen {
            retry_after_ms: INVALID_REQUEST_WINDOW_MS
                .saturating_sub(now_ms.saturating_sub(oldest))
                .max(1),
        }
    }

    /// Records a provider status. Only 401, 403, and 429 count. 401 stops later egress.
    pub fn observe_status(&mut self, status: u16, now_ms: u64) {
        if status == 401 {
            self.credentials_rejected = true;
        }
        if matches!(status, 401 | 403 | 429) {
            self.observed_at_ms.push(now_ms);
        }
    }

    #[must_use]
    pub fn count(&mut self, now_ms: u64) -> u32 {
        self.prune(now_ms);
        u32::try_from(self.observed_at_ms.len()).unwrap_or(u32::MAX)
    }

    fn prune(&mut self, now_ms: u64) {
        self.observed_at_ms
            .retain(|observed| now_ms.saturating_sub(*observed) < INVALID_REQUEST_WINDOW_MS);
    }
}

#[derive(Debug, Default)]
struct TransportGovernor {
    budget: InvalidRequestBudget,
    http_429: u64,
    blocked_until_ms: u64,
}

impl TransportGovernor {
    fn preflight(&mut self, now_ms: u64) -> Result<(), TransportError> {
        if now_ms < self.blocked_until_ms {
            return Err(TransportError::RateLimited {
                retry_after_ms: self.blocked_until_ms - now_ms,
            });
        }
        match self.budget.guard(now_ms) {
            EgressGuard::Open => Ok(()),
            EgressGuard::CredentialsRejected => Err(TransportError::Rejected { status: 401 }),
            EgressGuard::CircuitOpen { retry_after_ms } => {
                Err(TransportError::RateLimited { retry_after_ms })
            }
        }
    }

    fn note(&mut self, error: &TransportError, now_ms: u64) {
        match error {
            TransportError::RateLimited { retry_after_ms } => {
                self.http_429 = self.http_429.saturating_add(1);
                self.blocked_until_ms = now_ms.saturating_add(*retry_after_ms);
                self.budget.observe_status(429, now_ms);
            }
            TransportError::Rejected { status } => self.budget.observe_status(*status, now_ms),
            TransportError::Unavailable(_) => {}
        }
    }
}

fn unix_now_ms() -> u64 {
    u64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_millis()),
    )
    .unwrap_or(u64::MAX)
}

/// Form body for a refresh-token grant. It does not carry an authorization code.
#[must_use]
pub fn refresh_grant_form(refresh_token: &str) -> [(&str, &str); 2] {
    [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
    ]
}

/// Maps one Discord limit onto the global, route, or shared-resource window.
/// The channel window stays open until a channel limit is observed.
#[must_use]
pub fn admission_after_limit(
    global: bool,
    shared_resource: bool,
    retry_after_ms: u64,
) -> TransportAdmission {
    let blocked = RateSnapshot {
        remaining: 0,
        retry_after_ms,
    };
    let open = RateSnapshot {
        remaining: 1,
        retry_after_ms: 0,
    };
    if global {
        admit_discord_request(blocked, open, open, open)
    } else if shared_resource {
        admit_discord_request(open, open, blocked, open)
    } else {
        admit_discord_request(open, blocked, open, open)
    }
}

/// Admits work only when global, route, guild, and channel windows all have remaining budget.
#[must_use]
pub fn admit_discord_request(
    global: RateSnapshot,
    route: RateSnapshot,
    guild: RateSnapshot,
    channel: RateSnapshot,
) -> TransportAdmission {
    let windows = [global, route, guild, channel];
    let blocked = windows.iter().filter(|window| window.remaining == 0);
    let mut retry_after_ms = 0_u64;
    let mut waiting = false;
    for window in blocked {
        waiting = true;
        retry_after_ms = retry_after_ms.max(window.retry_after_ms);
    }
    if waiting {
        TransportAdmission::Wait { retry_after_ms }
    } else {
        TransportAdmission::Admit
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GatewayPhase {
    Resume,
    Identify,
    IdentifyDeferred,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ShardReadiness {
    pub session_established: bool,
    pub heartbeat_alive: bool,
}

/// Prefers Resume. Identify runs only when a concurrency slot is free.
#[must_use]
pub const fn plan_gateway_session(
    has_resumable_session: bool,
    identify_slots_available: u32,
) -> GatewayPhase {
    if has_resumable_session {
        GatewayPhase::Resume
    } else if identify_slots_available == 0 {
        GatewayPhase::IdentifyDeferred
    } else {
        GatewayPhase::Identify
    }
}

#[must_use]
pub const fn shard_is_ready(readiness: ShardReadiness) -> bool {
    readiness.session_established && readiness.heartbeat_alive
}

/// Discord snowflake timestamp, in Unix milliseconds.
#[must_use]
pub const fn interaction_created_ms(interaction_id: u64) -> u64 {
    (interaction_id >> 22).saturating_add(DISCORD_EPOCH_MS)
}

/// The initial callback is due only while the interaction is younger than three seconds.
#[must_use]
pub const fn acknowledgement_deadline_open(interaction_id: u64, now_ms: u64) -> bool {
    now_ms.saturating_sub(interaction_created_ms(interaction_id)) < INTERACTION_ACK_DEADLINE_MS
}

#[allow(deprecated)]
fn diagnostic_command() -> Command {
    Command {
        application_id: None,
        contexts: Some(vec![InteractionContextType::Guild]),
        default_member_permissions: None,
        dm_permission: None,
        description: "Acknowledge a platform diagnostic.".to_owned(),
        description_localizations: None,
        guild_id: None,
        id: None,
        integration_types: None,
        kind: CommandType::ChatInput,
        name: DIAGNOSTIC_COMMAND_NAME.to_owned(),
        name_localizations: None,
        nsfw: Some(false),
        options: Vec::new(),
        version: Id::<CommandVersionMarker>::new(1),
    }
}

#[allow(deprecated)]
fn timeout_command() -> Command {
    Command {
        application_id: None,
        contexts: Some(vec![InteractionContextType::Guild]),
        default_member_permissions: Some(Permissions::MODERATE_MEMBERS),
        dm_permission: Some(false),
        description: "Time out a member, or clear that timeout.".to_owned(),
        description_localizations: None,
        guild_id: None,
        id: None,
        integration_types: None,
        kind: CommandType::ChatInput,
        name: TIMEOUT_COMMAND_NAME.to_owned(),
        name_localizations: None,
        nsfw: Some(false),
        options: vec![
            timeout_subcommand("set", true),
            timeout_subcommand("clear", false),
        ],
        version: Id::<CommandVersionMarker>::new(1),
    }
}

fn timeout_subcommand(name: &str, with_duration: bool) -> CommandOption {
    let mut options = vec![command_option(
        "user",
        "Member",
        CommandOptionType::User,
        Some(true),
        None,
    )];
    if with_duration {
        options.push(command_option(
            "duration",
            "Duration, for example 10m or 10 minutos",
            CommandOptionType::String,
            Some(true),
            None,
        ));
    }
    options.push(command_option(
        "reason",
        "Reason shown on the case",
        CommandOptionType::String,
        Some(false),
        None,
    ));
    command_option(
        name,
        if with_duration {
            "Apply a timeout"
        } else {
            "Clear a timeout"
        },
        CommandOptionType::SubCommand,
        None,
        Some(options),
    )
}

fn command_option(
    name: &str,
    description: &str,
    kind: CommandOptionType,
    required: Option<bool>,
    options: Option<Vec<CommandOption>>,
) -> CommandOption {
    CommandOption {
        autocomplete: None,
        channel_types: None,
        choices: None,
        description: description.to_owned(),
        description_localizations: None,
        kind,
        max_length: None,
        max_value: None,
        min_length: None,
        min_value: None,
        name: name.to_owned(),
        name_localizations: None,
        options,
        required,
    }
}

#[cfg(test)]
mod governance_tests {
    use super::{
        DIAGNOSTIC_COMMAND_NAME, DISCORD_EPOCH_MS, EgressGuard, GatewayPhase,
        INVALID_REQUEST_CIRCUIT, INVALID_REQUEST_LIMIT, INVALID_REQUEST_WINDOW_MS,
        InvalidRequestBudget, RateSnapshot, ShardReadiness, TransportAdmission,
        acknowledgement_deadline_open, admission_after_limit, admit_discord_request,
        diagnostic_command, interaction_created_ms, plan_gateway_session, refresh_grant_form,
        shard_is_ready,
    };

    fn open() -> RateSnapshot {
        RateSnapshot {
            remaining: 1,
            retry_after_ms: 0,
        }
    }

    #[test]
    fn a_blocked_bucket_waits_for_the_longest_retry_after() {
        let admission = admit_discord_request(
            open(),
            RateSnapshot {
                remaining: 0,
                retry_after_ms: 200,
            },
            RateSnapshot {
                remaining: 0,
                retry_after_ms: 1_500,
            },
            open(),
        );
        assert_eq!(
            admission,
            TransportAdmission::Wait {
                retry_after_ms: 1_500
            }
        );
        assert_eq!(
            admit_discord_request(open(), open(), open(), open()),
            TransportAdmission::Admit
        );
        assert_eq!(
            admission_after_limit(true, false, 400),
            TransportAdmission::Wait {
                retry_after_ms: 400
            }
        );
        assert_eq!(
            admission_after_limit(false, true, 250),
            TransportAdmission::Wait {
                retry_after_ms: 250
            }
        );
    }

    #[test]
    fn invalid_requests_open_the_circuit_before_the_ban_and_a_401_stops_egress() {
        let mut budget = InvalidRequestBudget::default();
        budget.observe_status(400, 0);
        assert_eq!(budget.guard(0), EgressGuard::Open);
        for index in 0..INVALID_REQUEST_CIRCUIT {
            budget.observe_status(403, u64::from(index));
        }
        let now = u64::from(INVALID_REQUEST_CIRCUIT);
        assert!(matches!(budget.guard(now), EgressGuard::CircuitOpen { .. }));
        assert!(budget.count(now) < INVALID_REQUEST_LIMIT);
        let mut rejected = InvalidRequestBudget::default();
        rejected.observe_status(401, 0);
        assert_eq!(rejected.guard(1), EgressGuard::CredentialsRejected);
        rejected.observe_status(429, INVALID_REQUEST_WINDOW_MS);
        assert_eq!(rejected.count(INVALID_REQUEST_WINDOW_MS), 1);
    }

    #[test]
    fn refresh_grant_is_not_an_authorization_code() {
        let form = refresh_grant_form("refresh-token");
        assert_eq!(form[0], ("grant_type", "refresh_token"));
        assert_eq!(form[1].0, "refresh_token");
    }

    #[test]
    fn gateway_prefers_resume_and_defers_identify_without_a_slot() {
        assert_eq!(plan_gateway_session(true, 0), GatewayPhase::Resume);
        assert_eq!(
            plan_gateway_session(false, 0),
            GatewayPhase::IdentifyDeferred
        );
        assert_eq!(plan_gateway_session(false, 1), GatewayPhase::Identify);
        assert!(!shard_is_ready(ShardReadiness {
            session_established: false,
            heartbeat_alive: true,
        }));
        assert!(shard_is_ready(ShardReadiness {
            session_established: true,
            heartbeat_alive: true,
        }));
    }

    #[test]
    fn acknowledgement_closes_at_three_seconds() {
        let created = 1_700_000_000_000_u64;
        let id = (created - DISCORD_EPOCH_MS) << 22;
        assert!(acknowledgement_deadline_open(id, created));
        assert!(acknowledgement_deadline_open(id, created + 2_999));
        assert!(!acknowledgement_deadline_open(id, created + 3_000));
        assert_eq!(interaction_created_ms(id), created);
        assert_eq!(diagnostic_command().name, DIAGNOSTIC_COMMAND_NAME);
    }
}
