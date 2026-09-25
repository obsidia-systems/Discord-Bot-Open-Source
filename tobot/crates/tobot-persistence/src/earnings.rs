//! Decisiones de `/daily`; el diario monetario conserva la autoridad sobre saldos.

use time::OffsetDateTime;
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

use super::{EarningsStore, QueryStore, messaging::append_fact};

#[derive(Clone, Debug, sqlx::FromRow, serde::Serialize)]
pub struct DailyPolicy {
    pub revision_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub revision: i64,
    pub currency_revision_id: Uuid,
    pub amount: i64,
    pub cooldown_seconds: i32,
    pub enabled: bool,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct DailyAction {
    pub action_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub application_id: String,
    pub member_id: String,
    pub interaction_id: String,
    pub policy_revision_id: Uuid,
    pub amount: i64,
    pub ledger_key: Uuid,
    pub state: String,
    pub next_available_at: OffsetDateTime,
    pub ledger_transaction_id: Option<Uuid>,
    pub balance_after: Option<i64>,
    pub rejection_code: Option<String>,
    pub claim_token: Option<Uuid>,
    pub fencing_token: i64,
}

pub enum DailyDecision {
    Admitted(DailyAction),
    Duplicate(DailyAction),
    Ineligible(OffsetDateTime),
    Pending,
    NotConfigured,
}

const ACTION_COLUMNS: &str = "action_id,tenant_id,guild_id,application_id,member_id,interaction_id,policy_revision_id,amount,ledger_key,state,next_available_at,ledger_transaction_id,balance_after,rejection_code,claim_token,fencing_token";
const POLICY_COLUMNS: &str = "revision_id,tenant_id,guild_id,revision,currency_revision_id,amount,cooldown_seconds,enabled";
const PUBLISHED_COLUMNS: &str = "p.revision_id,p.tenant_id,p.guild_id,p.revision,p.currency_revision_id,p.amount,p.cooldown_seconds,COALESCE(s.enabled,p.enabled) AS enabled";

impl EarningsStore {
    /// # Errors
    /// Devuelve el error de almacenamiento o de tenant.
    pub async fn published_daily(&self, tenant: Uuid) -> Result<Option<DailyPolicy>, sqlx::Error> {
        sqlx::query_as(&format!("SELECT {PUBLISHED_COLUMNS} FROM earnings.daily_policy_revision p LEFT JOIN earnings.daily_circuit s ON s.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.state='Published'"))
            .bind(tenant).fetch_optional(&self.pool).await
    }

    /// # Errors
    /// Devuelve error de consulta para el recibo de interacción existente.
    pub async fn action_for_interaction(&self,tenant:Uuid,interaction:&str) -> Result<Option<DailyAction>,sqlx::Error> {
        sqlx::query_as(&format!("SELECT {ACTION_COLUMNS} FROM earnings.income_action WHERE tenant_id=$1 AND interaction_id=$2"))
            .bind(tenant).bind(interaction).fetch_optional(&self.pool).await
    }

    /// # Errors
    /// Devuelve error si el tenant instalado o la política son inválidos.
    pub async fn publish_daily(&self, tenant: Uuid, guild: &str, application: &str,
        currency_revision: Uuid, amount: i64, now: OffsetDateTime) -> Result<DailyPolicy, sqlx::Error> {
        if amount<=0 || amount>9_000_000_000_000 || currency_revision.is_nil() {
            return Err(sqlx::Error::Protocol("invalid daily policy".to_owned()));
        }
        let mut tx = self.pool.begin().await?;
        let actual: Option<String> = sqlx::query_scalar("SELECT provider_tenant_ref FROM installation.tenant WHERE tenant_id=$1 AND state='Active' FOR UPDATE")
            .bind(tenant).fetch_optional(&mut *tx).await?;
        if actual.as_deref()!=Some(guild) { return Err(sqlx::Error::Protocol("tenant/guild mismatch".to_owned())); }
        let revision: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(revision),0)+1 FROM earnings.daily_policy_revision WHERE tenant_id=$1")
            .bind(tenant).fetch_one(&mut *tx).await?;
        sqlx::query("UPDATE earnings.daily_policy_revision SET state='Superseded' WHERE tenant_id=$1 AND state='Published'")
            .bind(tenant).execute(&mut *tx).await?;
        let id = Uuid::now_v7();
        let policy: DailyPolicy = sqlx::query_as(&format!("INSERT INTO earnings.daily_policy_revision (revision_id,tenant_id,guild_id,revision,currency_revision_id,amount,cooldown_seconds,enabled,state,published_at) VALUES ($1,$2,$3,$4,$5,$6,86400,TRUE,'Published',$7) RETURNING {POLICY_COLUMNS}"))
            .bind(id).bind(tenant).bind(guild).bind(revision).bind(currency_revision).bind(amount).bind(now)
            .fetch_one(&mut *tx).await?;
        append_fact(&mut tx,"earnings",tenant,guild,application,"IncomePolicyPublished",
            serde_json::json!({"revision_id":id,"revision":revision,"amount":amount,"currency_revision_id":currency_revision}),now).await?;
        tx.commit().await?;
        Ok(policy)
    }

    /// # Errors
    /// Devuelve error de almacenamiento; nunca liquida dinero durante la admisión.
    pub async fn admit_daily(&self, tenant: Uuid, guild: &str, application: &str,
        member: &str, interaction: &str, now: OffsetDateTime) -> Result<DailyDecision, sqlx::Error> {
        if !matches!(member.parse::<u64>(),Ok(1..)) || !matches!(interaction.parse::<u64>(),Ok(1..)) {
            return Err(sqlx::Error::Protocol("invalid interaction identity".to_owned()));
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("daily:{tenant}:{member}")).execute(&mut *tx).await?;
        let installed: Option<String> = sqlx::query_scalar("SELECT t.provider_tenant_ref FROM installation.tenant t JOIN installation.installation i ON i.tenant_id=t.tenant_id AND i.state='Installed' WHERE t.tenant_id=$1 AND t.state='Active' ORDER BY i.generation DESC LIMIT 1")
            .bind(tenant).fetch_optional(&mut *tx).await?;
        if installed.as_deref()!=Some(guild) { return Err(sqlx::Error::Protocol("installation mismatch".to_owned())); }
        let old: Option<DailyAction> = sqlx::query_as(&format!("SELECT {ACTION_COLUMNS} FROM earnings.income_action WHERE tenant_id=$1 AND interaction_id=$2"))
            .bind(tenant).bind(interaction).fetch_optional(&mut *tx).await?;
        if let Some(action) = old {
            if action.guild_id!=guild || action.member_id!=member || action.application_id!=application {
                return Err(sqlx::Error::Protocol("interaction identity mismatch".to_owned()));
            }
            tx.commit().await?; return Ok(DailyDecision::Duplicate(action));
        }
        let policy: Option<DailyPolicy> = sqlx::query_as(&format!("SELECT {PUBLISHED_COLUMNS} FROM earnings.daily_policy_revision p LEFT JOIN earnings.daily_circuit s ON s.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.state='Published'"))
            .bind(tenant).fetch_optional(&mut *tx).await?;
        let Some(policy) = policy.filter(|p| p.enabled && p.guild_id==guild) else { return Ok(DailyDecision::NotConfigured); };
        let latest: Option<DailyAction> = sqlx::query_as(&format!("SELECT {ACTION_COLUMNS} FROM earnings.income_action WHERE tenant_id=$1 AND member_id=$2 AND state IN ('Pending','Settled') ORDER BY admitted_at DESC LIMIT 1"))
            .bind(tenant).bind(member).fetch_optional(&mut *tx).await?;
        if let Some(action) = latest {
            if action.state=="Pending" { return Ok(DailyDecision::Pending); }
            if action.next_available_at>now { return Ok(DailyDecision::Ineligible(action.next_available_at)); }
        }
        let id = Uuid::now_v7();
        let action: DailyAction = sqlx::query_as(&format!("INSERT INTO earnings.income_action (action_id,tenant_id,guild_id,application_id,member_id,interaction_id,policy_revision_id,amount,ledger_key,state,next_available_at,admitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$1,'Pending',$9,$10) RETURNING {ACTION_COLUMNS}"))
            .bind(id).bind(tenant).bind(guild).bind(application).bind(member).bind(interaction)
            .bind(policy.revision_id).bind(policy.amount).bind(now+time::Duration::hours(24)).bind(now)
            .fetch_one(&mut *tx).await?;
        append_fact(&mut tx,"earnings",tenant,guild,application,"IncomeActionAdmitted",
            serde_json::json!({"action_id":id,"member_id":member,"amount":policy.amount,"policy_revision_id":policy.revision_id,"interaction_id":interaction}),now).await?;
        tx.commit().await?;
        Ok(DailyDecision::Admitted(action))
    }

    /// # Errors
    /// Devuelve error si no puede reclamar un trabajo pendiente con cerca de un tenant por ciclo.
    pub async fn claim_pending(&self, now: OffsetDateTime, token: Uuid) -> Result<Vec<DailyAction>,sqlx::Error> {
        sqlx::query_as(&format!("WITH due AS (SELECT DISTINCT ON (tenant_id) action_id,tenant_id,admitted_at FROM earnings.income_action WHERE state='Pending' AND (lease_expires_at IS NULL OR lease_expires_at<$1) ORDER BY tenant_id,admitted_at), chosen AS (SELECT a.action_id FROM earnings.income_action a JOIN due d ON d.action_id=a.action_id ORDER BY d.admitted_at LIMIT 20 FOR UPDATE OF a SKIP LOCKED) UPDATE earnings.income_action a SET claim_token=$2,lease_expires_at=$3,fencing_token=fencing_token+1 FROM chosen WHERE a.action_id=chosen.action_id RETURNING {}", ACTION_COLUMNS.split(',').map(|name|format!("a.{name}")).collect::<Vec<_>>().join(",")))
            .bind(now).bind(token).bind(now+time::Duration::seconds(15)).fetch_all(&self.pool).await
    }

    /// # Errors
    /// Devuelve error si no se puede registrar el recibo del Ledger.
    pub async fn complete(&self, action: &DailyAction, transaction: Option<Uuid>, balance: Option<i64>,
        rejection: Option<&str>, now: OffsetDateTime) -> Result<bool,sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let updated = sqlx::query("UPDATE earnings.income_action SET state=$4,ledger_transaction_id=$5,balance_after=$6,rejection_code=$7,settled_at=$8,claim_token=NULL,lease_expires_at=NULL WHERE action_id=$1 AND claim_token=$2 AND fencing_token=$3 AND state='Pending'")
            .bind(action.action_id).bind(action.claim_token).bind(action.fencing_token)
            .bind(if rejection.is_some(){"Rejected"}else{"Settled"}).bind(transaction).bind(balance).bind(rejection).bind(now)
            .execute(&mut *tx).await?.rows_affected()==1;
        if updated {
            append_fact(&mut tx,"earnings",action.tenant_id,&action.guild_id,&action.application_id,
                if rejection.is_some(){"IncomeActionRejected"}else{"IncomeActionSettled"},
                serde_json::json!({"action_id":action.action_id,"member_id":action.member_id,
                    "ledger_transaction_id":transaction,"balance_after":balance,"rejection_code":rejection}),now).await?;
        }
        tx.commit().await?;
        Ok(updated)
    }

    /// # Errors
    /// Devuelve un error si el recibo de Edge no se puede consultar.
    pub async fn interaction_token(&self, tenant: Uuid, interaction: &str) -> Result<Option<String>,sqlx::Error> {
        sqlx::query_scalar("SELECT interaction_token FROM edge.interaction_receipt WHERE tenant_id=$1 AND interaction_id=$2 AND expires_at>CURRENT_TIMESTAMP")
            .bind(tenant).bind(interaction).fetch_optional(&self.pool).await
    }

    /// # Errors
    /// Devuelve error si no hay política que controlar o no puede auditarse el cambio.
    pub async fn set_daily_enabled(&self, tenant:Uuid, actor:Uuid, enabled:bool,
        now:OffsetDateTime) -> Result<(),sqlx::Error> {
        let mut tx=self.pool.begin().await?;
        let active:Option<Uuid>=sqlx::query_scalar("SELECT revision_id FROM earnings.daily_policy_revision WHERE tenant_id=$1 AND state='Published' FOR UPDATE")
            .bind(tenant).fetch_optional(&mut *tx).await?;
        if active.is_none(){return Err(sqlx::Error::Protocol("daily policy missing".to_owned()));}
        sqlx::query("INSERT INTO earnings.daily_circuit (tenant_id,enabled,changed_by,changed_at) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled,changed_by=EXCLUDED.changed_by,changed_at=EXCLUDED.changed_at")
            .bind(tenant).bind(enabled).bind(actor).bind(now).execute(&mut *tx).await?;
        tx.commit().await
    }

    /// # Errors
    /// Registra la intención antes de tocar los dos dueños de escritura.
    pub async fn request_circuit_change(&self, tenant:Uuid,actor:Uuid,credit:bool,daily:bool,
        now:OffsetDateTime) -> Result<Uuid,sqlx::Error> {
        let id=Uuid::now_v7();
        sqlx::query("INSERT INTO earnings.circuit_audit (audit_id,tenant_id,actor_account_id,credit_enabled,daily_enabled,state,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'Requested',$6,$6)")
            .bind(id).bind(tenant).bind(actor).bind(credit).bind(daily).bind(now).execute(&self.pool).await?;
        Ok(id)
    }

    /// # Errors
    /// Registra el resultado del cambio de controles.
    pub async fn finish_circuit_change(&self,id:Uuid,applied:bool,error_code:Option<&str>,
        now:OffsetDateTime) -> Result<(),sqlx::Error> {
        sqlx::query("UPDATE earnings.circuit_audit SET state=$2,error_code=$3,updated_at=$4 WHERE audit_id=$1 AND state='Requested'")
            .bind(id).bind(if applied{"Applied"}else{"Failed"}).bind(error_code).bind(now).execute(&self.pool).await?;
        Ok(())
    }

    /// # Errors
    /// Reclama respuestas terminales, una por tenant en cada ciclo.
    pub async fn claim_responses(&self,now:OffsetDateTime,token:Uuid) -> Result<Vec<DailyAction>,sqlx::Error> {
        sqlx::query_as(&format!("WITH due AS (SELECT DISTINCT ON (tenant_id) action_id,tenant_id,settled_at FROM earnings.income_action WHERE state IN ('Settled','Rejected') AND response_state='Pending' AND (lease_expires_at IS NULL OR lease_expires_at<$1) ORDER BY tenant_id,settled_at), chosen AS (SELECT a.action_id FROM earnings.income_action a JOIN due d ON d.action_id=a.action_id ORDER BY d.settled_at LIMIT 20 FOR UPDATE OF a SKIP LOCKED) UPDATE earnings.income_action a SET claim_token=$2,lease_expires_at=$3,fencing_token=fencing_token+1 FROM chosen WHERE a.action_id=chosen.action_id RETURNING {}",ACTION_COLUMNS.split(',').map(|name|format!("a.{name}")).collect::<Vec<_>>().join(",")))
            .bind(now).bind(token).bind(now+time::Duration::seconds(15)).fetch_all(&self.pool).await
    }

    /// # Errors
    /// Marca una respuesta después de confirmar Discord o expirar el token.
    pub async fn finish_response(&self,action:&DailyAction,delivered:bool,
        now:OffsetDateTime) -> Result<bool,sqlx::Error> {
        Ok(sqlx::query("UPDATE earnings.income_action SET response_state=$4,response_finished_at=$5,claim_token=NULL,lease_expires_at=NULL WHERE action_id=$1 AND claim_token=$2 AND fencing_token=$3 AND response_state='Pending'")
            .bind(action.action_id).bind(action.claim_token).bind(action.fencing_token)
            .bind(if delivered{"Delivered"}else{"Expired"}).bind(now).execute(&self.pool).await?.rows_affected()==1)
    }
}

impl QueryStore {
    /// # Errors
    /// Devuelve error ante un hecho inválido o fallo de la proyección.
    pub async fn apply_wallet(&self, event: &EventEnvelope, raw: &[u8], stream: &str,
        now: OffsetDateTime) -> Result<(),sqlx::Error> {
        let tenant = event.tenant_id.ok_or_else(||sqlx::Error::Protocol("wallet fact missing tenant".to_owned()))?;
        if event.schema_family.as_deref()!=Some("VirtualPayment") || event.schema_name!="BalanceProjectionChanged" {
            return Err(sqlx::Error::Protocol("wrong wallet fact".to_owned()));
        }
        let member = event.payload["member_id"].as_str().ok_or_else(||sqlx::Error::Protocol("missing member".to_owned()))?;
        let currency: Uuid = event.payload["currency_id"].as_str().ok_or_else(||sqlx::Error::Protocol("missing currency".to_owned()))?
            .parse().map_err(|e:uuid::Error|sqlx::Error::Protocol(e.to_string()))?;
        let balance = event.payload["balance"].as_i64().ok_or_else(||sqlx::Error::Protocol("missing balance".to_owned()))?;
        let sequence = event.payload["journal_sequence"].as_i64().ok_or_else(||sqlx::Error::Protocol("missing sequence".to_owned()))?;
        if balance<0 || sequence<=0 { return Err(sqlx::Error::Protocol("invalid wallet fact".to_owned())); }
        let mut tx = self.pool.begin().await?;
        let known_tenant: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM installation.tenant WHERE tenant_id=$1)")
            .bind(tenant).fetch_one(&mut *tx).await?;
        if !known_tenant { return Ok(()); }
        let inserted = sqlx::query("INSERT INTO query_status.event_inbox (event_id,schema_name,raw_envelope,stream_position,received_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING")
            .bind(event.event_id).bind(&event.schema_name).bind(raw).bind(stream).bind(now)
            .execute(&mut *tx).await?.rows_affected()==1;
        if inserted {
            sqlx::query("INSERT INTO query_status.wallet (tenant_id,member_id,currency_id,balance,journal_sequence,projection_watermark,last_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id,member_id) DO UPDATE SET currency_id=EXCLUDED.currency_id,balance=EXCLUDED.balance,journal_sequence=EXCLUDED.journal_sequence,projection_watermark=EXCLUDED.projection_watermark,last_event_id=EXCLUDED.last_event_id WHERE query_status.wallet.journal_sequence<EXCLUDED.journal_sequence")
                .bind(tenant).bind(member).bind(currency).bind(balance).bind(sequence).bind(now).bind(event.event_id)
                .execute(&mut *tx).await?;
        }
        tx.commit().await
    }

    /// # Errors
    /// Devuelve error de lectura de la proyección.
    pub async fn wallet_projection(&self, tenant: Uuid, member: &str) -> Result<Option<(Uuid,i64,i64,OffsetDateTime)>,sqlx::Error> {
        sqlx::query_as("SELECT currency_id,balance,journal_sequence,projection_watermark FROM query_status.wallet WHERE tenant_id=$1 AND member_id=$2")
            .bind(tenant).bind(member).fetch_optional(&self.pool).await
    }
}
