//! Cliente privado: firma cada solicitud con tenant y operación dentro del cuerpo.

use reqwest::{Client, Method, StatusCode};
use serde_json::Value;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_envelope::{CommandEnvelope, TraceContext, money_request_signature};
use uuid::Uuid;

#[derive(Clone)]
pub struct LedgerClient {
    http: Client,
    base: String,
    token: String,
    key: Vec<u8>,
}

#[derive(Debug)]
pub enum LedgerError {
    Rejected(String),
    Conflict,
    Missing,
    Unavailable,
}

impl LedgerClient {
    pub fn from_env() -> anyhow::Result<Self> {
        let base = std::env::var("TOBOT_LEDGER_URL")?;
        let token = std::env::var("TOBOT_LEDGER_SERVICE_TOKEN")?;
        let key = std::env::var("TOBOT_LEDGER_RECEIPT_KEY")?.into_bytes();
        if token.len() < 32 || key.len() < 32 {
            anyhow::bail!("Ledger credentials must be at least 32 characters");
        }
        Ok(Self {
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()?,
            base: base.trim_end_matches('/').to_owned(),
            token,
            key,
        })
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Vec<u8>,
    ) -> Result<Value, LedgerError> {
        let expiry = OffsetDateTime::now_utc().unix_timestamp() + 30;
        let signature = money_request_signature(&self.key, method.as_str(), path, expiry, &body)
            .map_err(|_| LedgerError::Unavailable)?;
        let response = self
            .http
            .request(method, format!("{}{path}", self.base))
            .bearer_auth(&self.token)
            .header("x-ledger-expires", expiry.to_string())
            .header("x-ledger-signature", signature)
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|_| LedgerError::Unavailable)?;
        let status = response.status();
        if status == StatusCode::NOT_FOUND {
            return Err(LedgerError::Missing);
        }
        if status == StatusCode::NO_CONTENT {
            return Ok(Value::Null);
        }
        let body: Value = response
            .json()
            .await
            .map_err(|_| LedgerError::Unavailable)?;
        if status == StatusCode::UNPROCESSABLE_ENTITY {
            return Err(LedgerError::Rejected(
                body["code"].as_str().unwrap_or("rejected").to_owned(),
            ));
        }
        if status == StatusCode::CONFLICT {
            return Err(LedgerError::Conflict);
        }
        if !status.is_success() {
            return Err(LedgerError::Unavailable);
        }
        Ok(body)
    }

    pub async fn command(
        &self,
        name: &str,
        tenant: Uuid,
        actor: Uuid,
        key: Uuid,
        payload: Value,
    ) -> Result<Value, LedgerError> {
        let deadline = (OffsetDateTime::now_utc() + time::Duration::seconds(30))
            .format(&Rfc3339)
            .map_err(|_| LedgerError::Unavailable)?;
        let correlation = Uuid::now_v7();
        let command = CommandEnvelope {
            command_id: Uuid::now_v7(),
            schema_name: name.to_owned(),
            schema_version: 1,
            schema_family: Some("VirtualPayment".to_owned()),
            actor_account_id: actor,
            tenant_id: tenant,
            idempotency_key: key,
            deadline_at: deadline,
            correlation_id: correlation,
            trace_context: TraceContext {
                trace_id: correlation.to_string(),
                span_id: Uuid::now_v7().to_string(),
            },
            payload,
        };
        let raw = serde_json::to_vec(&command).map_err(|_| LedgerError::Unavailable)?;
        CommandEnvelope::parse_s0(&raw)
            .map_err(|_| LedgerError::Rejected("invalid_money_command".to_owned()))?;
        self.request(Method::POST, "/internal/v1/ledger/command", raw)
            .await
    }

    pub async fn policy(&self, tenant: Uuid) -> Result<Value, LedgerError> {
        self.request(
            Method::GET,
            &format!("/internal/v1/ledger/policy/{tenant}"),
            Vec::new(),
        )
        .await
    }
    pub async fn wallet(&self, tenant: Uuid, member: &str) -> Result<Value, LedgerError> {
        if !matches!(member.parse::<u64>(), Ok(1..)) {
            return Err(LedgerError::Rejected("invalid_member".to_owned()));
        }
        self.request(
            Method::GET,
            &format!("/internal/v1/ledger/wallet/{tenant}/{member}"),
            Vec::new(),
        )
        .await
    }
    pub async fn set_credit_enabled(
        &self,
        tenant: Uuid,
        enabled: bool,
    ) -> Result<Value, LedgerError> {
        self.request(
            Method::POST,
            &format!("/internal/v1/ledger/circuit/{tenant}"),
            serde_json::to_vec(&serde_json::json!({"credit_enabled":enabled}))
                .map_err(|_| LedgerError::Unavailable)?,
        )
        .await
    }
}
