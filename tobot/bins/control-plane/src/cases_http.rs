use async_trait::async_trait;
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use time::format_description::well_known::Rfc3339;
use tobot_cases::{
    CaseDecision, MemberTimeoutGateway, PreflightQuery, SubmittedAction, TimeoutMutation,
    execute_submitted_action,
};
use tobot_delivery_client::CasesDeliveryClient;
use tobot_discord_adapter::{ModerationPreflightReport, TransportError};
use tobot_core::Clock;
use uuid::Uuid;

use super::{AppState, authorize_browser_session, clear_session_response, ensure_fresh_discovery, session_id};

#[derive(Clone)]
pub struct DeliveryGateway {
    client: CasesDeliveryClient,
}

impl DeliveryGateway {
    pub fn new(client: CasesDeliveryClient) -> Self {
        Self { client }
    }
}

#[async_trait]
impl MemberTimeoutGateway for DeliveryGateway {
    async fn preflight(
        &self,
        query: &PreflightQuery<'_>,
    ) -> Result<ModerationPreflightReport, TransportError> {
        self.client
            .preflight(
                query.guild_id,
                query.actor_user_id,
                query.target_user_id,
                query.protected_targets,
            )
            .await
    }

    async fn apply_timeout(&self, mutation: &TimeoutMutation<'_>) -> Result<(), TransportError> {
        let Some(until_unix) = mutation.until_unix else {
            return Err(TransportError::Rejected { status: 400 });
        };
        self.client
            .apply_timeout(
                mutation.guild_id,
                mutation.user_id,
                until_unix,
                mutation.audit_reason,
            )
            .await
    }

    async fn clear_timeout(&self, mutation: &TimeoutMutation<'_>) -> Result<(), TransportError> {
        self.client
            .clear_timeout(mutation.guild_id, mutation.user_id, mutation.audit_reason)
            .await
    }

    async fn observe_timeout(
        &self,
        guild_id: &str,
        user_id: &str,
    ) -> Result<bool, TransportError> {
        self.client.observe_timeout(guild_id, user_id).await
    }
}

#[derive(serde::Deserialize)]
pub struct SubmitModerationBody {
    pub guild_id: String,
    pub actor_provider_user_id: String,
    pub target_user_id: String,
    pub action_type: String,
    pub duration_text: Option<String>,
    pub reason: String,
    pub interaction_id: String,
    pub correlation_id: Uuid,
    pub deadline_at: String,
}

pub async fn submit_moderation_action(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SubmitModerationBody>,
) -> Response {
    if !super::bearer_matches(&headers, &state.service_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let tenant_id = match state
        .installation
        .installed_guild_tenant(&state.discord_application_id, &body.guild_id)
        .await
    {
        Ok(Some(tenant_id)) => tenant_id,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let now = time::OffsetDateTime::now_utc();
    let deadline_passed = time::OffsetDateTime::parse(&body.deadline_at, &Rfc3339)
        .ok()
        .is_none_or(|deadline| deadline <= now);
    match execute_submitted_action(
        &state.moderation,
        &state.cases_gateway,
        &SubmittedAction {
            tenant_id,
            guild_id: &body.guild_id,
            application_id: &state.discord_application_id,
            actor_provider_user_id: &body.actor_provider_user_id,
            target_user_id: &body.target_user_id,
            action_type: &body.action_type,
            duration_text: body.duration_text.as_deref(),
            reason: &body.reason,
            interaction_id: &body.interaction_id,
            correlation_id: body.correlation_id,
            deadline_passed,
        },
        now,
    )
    .await
    {
        Ok(decision) => Json(decision_body(&decision)).into_response(),
        Err(error) => {
            tracing::error!(error = %error, "moderation action failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

pub async fn list_cases(
    State(state): State<AppState>,
    Path(tenant_id): Path<Uuid>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = authorize_case_read(&state, tenant_id, &headers).await {
        return response;
    }
    match state.query.cases_for_tenant(tenant_id).await {
        Ok(cases) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(serde_json::json!({ "cases": cases.iter().map(case_body).collect::<Vec<_>>() })),
        )
            .into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

pub async fn case_detail(
    State(state): State<AppState>,
    Path((tenant_id, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = authorize_case_read(&state, tenant_id, &headers).await {
        return response;
    }
    match state.query.case_for_tenant(tenant_id, case_id).await {
        Ok(Some(case)) => (
            [(header::CACHE_CONTROL, "private, no-store")],
            Json(case_body(&case)),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

async fn authorize_case_read(
    state: &AppState,
    tenant_id: Uuid,
    headers: &HeaderMap,
) -> Option<Response> {
    let Some(session_id) = session_id(headers) else {
        return Some(StatusCode::UNAUTHORIZED.into_response());
    };
    let now = time::OffsetDateTime::from(state.clock.now());
    let Ok(Some(session)) = authorize_browser_session(state, session_id, now).await else {
        return Some(clear_session_response(StatusCode::UNAUTHORIZED));
    };
    if let Err(status) = ensure_fresh_discovery(state, &session, now).await {
        return Some(status.into_response());
    }
    let Ok(provider_guild_ids) = state
        .identity
        .fresh_discovered_guild_ids(session.account_id, now)
        .await
    else {
        return Some(StatusCode::SERVICE_UNAVAILABLE.into_response());
    };
    let Ok(Some(_)) = state
        .query
        .guild_shell_for_provider_guilds(tenant_id, &provider_guild_ids)
        .await
    else {
        return Some(StatusCode::NOT_FOUND.into_response());
    };
    None
}

fn decision_body(decision: &CaseDecision) -> serde_json::Value {
    serde_json::json!({
        "case_id": decision.case_id,
        "display_number": decision.display_number,
        "status": decision.status,
        "follow_up": decision.follow_up,
    })
}

fn case_body(case: &tobot_persistence::CaseProjection) -> serde_json::Value {
    serde_json::json!({
        "case_id": case.case_id,
        "tenant_id": case.tenant_id,
        "display_number": case.display_number,
        "action": case.action,
        "target_label": case.target_label,
        "target_user_id": case.target_user_id,
        "actor_provider_user_id": case.actor_provider_user_id,
        "reason": case.reason,
        "status": case.status,
        "expires_at_unix": case.expires_at.map(time::OffsetDateTime::unix_timestamp),
        "projection_watermark_unix": case.projection_watermark.unix_timestamp(),
    })
}
