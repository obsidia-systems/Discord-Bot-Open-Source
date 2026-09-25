//! Diario de moneda virtual. Todas las decisiones de saldo se confirman localmente.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_envelope::{CommandEnvelope, EventEnvelope, TraceContext};
use uuid::Uuid;

const MAX_UNITS: i64 = 9_000_000_000_000;

#[derive(Clone)]
pub struct LedgerStore { pub pool: PgPool, pub application_id: String }

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CurrencyPolicyInput {
    pub guild_id: String,
    pub starting_grant: i64,
    pub wallet_ceiling: i64,
    pub issuance_ceiling: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WalletInput { pub member_id: String }

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IncomeInput {
    pub member_id: String,
    pub income_action_id: Uuid,
    pub policy_revision_id: Uuid,
    pub interaction_id: String,
    pub amount: i64,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct Policy {
    pub tenant_id: Uuid,
    pub currency_id: Uuid,
    pub revision_id: Uuid,
    pub revision: i64,
    pub starting_grant: i64,
    pub wallet_ceiling: i64,
    pub issuance_ceiling: i64,
    pub credit_enabled: bool,
    pub write_ready: bool,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct Wallet {
    pub tenant_id: Uuid,
    pub currency_id: Uuid,
    pub member_id: String,
    pub current: i64,
    pub available: i64,
    pub journal_sequence: i64,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct RecentPosting {
    pub transaction_id: Uuid,
    pub kind: String,
    pub amount: i64,
    pub journal_sequence: i64,
    pub occurred_at: String,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct Receipt {
    pub transaction_id: Uuid,
    pub tenant_id: Uuid,
    pub currency_id: Uuid,
    pub member_id: String,
    pub amount: i64,
    pub balance_after: i64,
    pub journal_sequence: i64,
}

#[derive(sqlx::FromRow)]
struct StoredReceipt {
    transaction_id: Uuid, tenant_id: Uuid, currency_id: Uuid, member_id: String,
    amount: i64, balance_after: i64, journal_sequence: i64, request_hash: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(tag="outcome", rename_all="snake_case")]
pub enum LedgerResponse { Policy(Policy), Wallet(Wallet), Settled(Receipt) }

#[derive(Debug)]
pub enum LedgerFault { Rejected(&'static str), Conflict, Database(sqlx::Error), Other(anyhow::Error) }
impl From<sqlx::Error> for LedgerFault { fn from(error: sqlx::Error) -> Self { Self::Database(error) } }
impl From<anyhow::Error> for LedgerFault { fn from(error: anyhow::Error) -> Self { Self::Other(error) } }

#[derive(sqlx::FromRow)]
struct Account { account_id: Uuid }

fn valid_member(value: &str) -> bool { matches!(value.parse::<u64>(), Ok(1..)) }
fn valid_amount(value: i64) -> bool { (1..=MAX_UNITS).contains(&value) }
fn hash_request(command: &CommandEnvelope) -> Result<Vec<u8>, LedgerFault> {
    let body = serde_json::to_vec(&serde_json::json!({
        "schema_name":command.schema_name,"tenant_id":command.tenant_id,"payload":command.payload,
    })).map_err(|error| LedgerFault::Other(error.into()))?;
    Ok(Sha256::digest(body).to_vec())
}

async fn lock_tenant(tx: &mut Transaction<'_, Postgres>, tenant: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))")
        .bind(tenant).execute(&mut **tx).await?;
    Ok(())
}

impl LedgerStore {
    pub async fn set_credit_enabled(&self,tenant:Uuid,enabled:bool) -> Result<Policy,LedgerFault> {
        let mut tx=self.pool.begin().await?;
        lock_tenant(&mut tx,tenant).await?;
        let changed=sqlx::query("UPDATE ledger.currency SET credit_enabled=$2 WHERE tenant_id=$1")
            .bind(tenant).bind(enabled).execute(&mut *tx).await?.rows_affected();
        if changed!=1 {return Err(LedgerFault::Rejected("currency_not_configured"));}
        tx.commit().await?;
        self.policy(tenant).await?.ok_or(LedgerFault::Rejected("currency_not_configured"))
    }
    pub async fn policy(&self, tenant: Uuid) -> Result<Option<Policy>, sqlx::Error> {
        sqlx::query_as("SELECT c.tenant_id,c.currency_id,p.revision_id,p.revision,p.starting_grant,p.wallet_ceiling,p.issuance_ceiling,c.credit_enabled,c.write_ready FROM ledger.currency c JOIN ledger.currency_policy_revision p ON p.tenant_id=c.tenant_id WHERE c.tenant_id=$1 ORDER BY p.revision DESC LIMIT 1")
            .bind(tenant).fetch_optional(&self.pool).await
    }

    pub async fn wallet(&self, tenant: Uuid, member: &str) -> Result<Option<Wallet>, LedgerFault> {
        if !valid_member(member) { return Err(LedgerFault::Rejected("invalid_member")); }
        let row = sqlx::query_as("SELECT a.tenant_id,a.currency_id,a.member_id,p.current_balance AS current,p.available_balance AS available,p.journal_sequence FROM ledger.account a JOIN ledger.balance_projection p ON p.account_id=a.account_id WHERE a.tenant_id=$1 AND a.member_id=$2 AND a.kind='Wallet'")
            .bind(tenant).bind(member).fetch_optional(&self.pool).await?;
        Ok(row)
    }

    pub async fn recent_postings(&self, tenant: Uuid, member: &str) -> Result<Vec<RecentPosting>, sqlx::Error> {
        sqlx::query_as("SELECT t.transaction_id,t.kind,t.amount,t.journal_sequence,to_char(t.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS occurred_at FROM ledger.monetary_transaction t WHERE t.tenant_id=$1 AND t.member_id=$2 ORDER BY t.journal_sequence DESC LIMIT 10")
            .bind(tenant).bind(member).fetch_all(&self.pool).await
    }

    pub async fn publish_policy(&self, command: &CommandEnvelope) -> Result<Policy, LedgerFault> {
        let input: CurrencyPolicyInput = serde_json::from_value(command.payload.clone())
            .map_err(|_| LedgerFault::Rejected("invalid_currency_policy"))?;
        if !valid_member(&input.guild_id) || input.starting_grant < 0 ||
            !valid_amount(input.wallet_ceiling) || !valid_amount(input.issuance_ceiling) ||
            input.starting_grant > input.wallet_ceiling || input.starting_grant > input.issuance_ceiling {
            return Err(LedgerFault::Rejected("invalid_currency_policy"));
        }
        let mut tx = self.pool.begin().await?;
        lock_tenant(&mut tx, command.tenant_id).await?;
        let existing: Option<(Uuid,String)> = sqlx::query_as("SELECT currency_id,guild_id FROM ledger.currency WHERE tenant_id=$1")
            .bind(command.tenant_id).fetch_optional(&mut *tx).await?;
        if let Some((_,guild)) = &existing { if guild != &input.guild_id { return Err(LedgerFault::Rejected("guild_mismatch")); } }
        let currency_id = existing.map_or_else(Uuid::now_v7, |row| row.0);
        sqlx::query("INSERT INTO ledger.currency (tenant_id,currency_id,application_id,guild_id) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id) DO NOTHING")
            .bind(command.tenant_id).bind(currency_id).bind(&self.application_id).bind(&input.guild_id)
            .execute(&mut *tx).await?;
        let revision_id = command.idempotency_key;
        let existing_revision: Option<(i64,i64,i64,i64)> = sqlx::query_as("SELECT revision,starting_grant,wallet_ceiling,issuance_ceiling FROM ledger.currency_policy_revision WHERE tenant_id=$1 AND revision_id=$2")
            .bind(command.tenant_id).bind(revision_id).fetch_optional(&mut *tx).await?;
        if let Some((_,grant,wallet,issuance)) = existing_revision {
            if grant != input.starting_grant || wallet != input.wallet_ceiling || issuance != input.issuance_ceiling { return Err(LedgerFault::Conflict); }
        } else {
            let issued: i64 = sqlx::query_scalar("SELECT issued FROM ledger.currency WHERE tenant_id=$1")
                .bind(command.tenant_id).fetch_one(&mut *tx).await?;
            let highest_wallet: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(balance),0)::bigint FROM ledger.account WHERE tenant_id=$1 AND kind='Wallet'")
                .bind(command.tenant_id).fetch_one(&mut *tx).await?;
            if issued > input.issuance_ceiling || highest_wallet > input.wallet_ceiling { return Err(LedgerFault::Rejected("ceiling_below_existing_value")); }
            let revision: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(revision),0)+1 FROM ledger.currency_policy_revision WHERE tenant_id=$1")
                .bind(command.tenant_id).fetch_one(&mut *tx).await?;
            sqlx::query("INSERT INTO ledger.currency_policy_revision (revision_id,tenant_id,revision,starting_grant,wallet_ceiling,issuance_ceiling,published_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)")
                .bind(revision_id).bind(command.tenant_id).bind(revision).bind(input.starting_grant)
                .bind(input.wallet_ceiling).bind(input.issuance_ceiling).execute(&mut *tx).await?;
            let issuance_account: Option<Uuid> = sqlx::query_scalar("SELECT account_id FROM ledger.account WHERE tenant_id=$1 AND kind='Issuance'")
                .bind(command.tenant_id).fetch_optional(&mut *tx).await?;
            if issuance_account.is_none() {
                let account_id=Uuid::now_v7();
                sqlx::query("INSERT INTO ledger.account (account_id,tenant_id,currency_id,kind,balance,created_at) VALUES ($1,$2,$3,'Issuance',0,CURRENT_TIMESTAMP)")
                    .bind(account_id).bind(command.tenant_id).bind(currency_id).execute(&mut *tx).await?;
                sqlx::query("INSERT INTO ledger.balance_projection (account_id,tenant_id,currency_id,current_balance,available_balance) VALUES ($1,$2,$3,0,0)")
                    .bind(account_id).bind(command.tenant_id).bind(currency_id).execute(&mut *tx).await?;
            }
            self.append_fact(&mut tx, command, "CurrencyPolicyPublished", serde_json::json!({"currency_id":currency_id,"revision_id":revision_id,"revision":revision})).await?;
        }
        tx.commit().await?;
        self.policy(command.tenant_id).await?.ok_or(LedgerFault::Rejected("policy_missing"))
    }

    pub async fn ensure_wallet(&self, command: &CommandEnvelope) -> Result<Wallet, LedgerFault> {
        let input: WalletInput = serde_json::from_value(command.payload.clone())
            .map_err(|_| LedgerFault::Rejected("invalid_wallet_request"))?;
        if !valid_member(&input.member_id) { return Err(LedgerFault::Rejected("invalid_member")); }
        let mut tx = self.pool.begin().await?;
        lock_tenant(&mut tx, command.tenant_id).await?;
        let policy = self.policy_for_update(&mut tx, command.tenant_id).await?;
        let existing: Option<Account> = sqlx::query_as("SELECT account_id FROM ledger.account WHERE tenant_id=$1 AND member_id=$2 AND kind='Wallet'")
            .bind(command.tenant_id).bind(&input.member_id).fetch_optional(&mut *tx).await?;
        if existing.is_none() {
            if !policy.write_ready || !policy.credit_enabled { return Err(LedgerFault::Rejected("credits_disabled")); }
            let account_id = Uuid::now_v7();
            sqlx::query("INSERT INTO ledger.account (account_id,tenant_id,currency_id,kind,member_id,balance,created_at) VALUES ($1,$2,$3,'Wallet',$4,0,CURRENT_TIMESTAMP)")
                .bind(account_id).bind(command.tenant_id).bind(policy.currency_id).bind(&input.member_id)
                .execute(&mut *tx).await?;
            sqlx::query("INSERT INTO ledger.balance_projection (account_id,tenant_id,currency_id,current_balance,available_balance) VALUES ($1,$2,$3,0,0)")
                .bind(account_id).bind(command.tenant_id).bind(policy.currency_id).execute(&mut *tx).await?;
            self.append_fact(&mut tx, command, "AccountOpened", serde_json::json!({"account_id":account_id,"member_id":input.member_id,"currency_id":policy.currency_id})).await?;
            let first_revision: (Uuid,i64) = sqlx::query_as("SELECT revision_id,starting_grant FROM ledger.currency_policy_revision WHERE tenant_id=$1 ORDER BY revision ASC LIMIT 1")
                .bind(command.tenant_id).fetch_one(&mut *tx).await?;
            let grant_transaction = if first_revision.1 > 0 {
                Some(self.post(&mut tx, command, &policy, &input.member_id, account_id,
                    "StartingGrant", Uuid::new_v5(&Uuid::NAMESPACE_OID, format!("{}:{}:starting-grant",command.tenant_id,input.member_id).as_bytes()),
                    first_revision.0, first_revision.1).await?.transaction_id)
            } else { None };
            sqlx::query("INSERT INTO ledger.starting_grant_receipt (tenant_id,member_id,transaction_id,policy_revision_id) VALUES ($1,$2,$3,$4)")
                .bind(command.tenant_id).bind(&input.member_id).bind(grant_transaction).bind(first_revision.0)
                .execute(&mut *tx).await?;
        }
        tx.commit().await?;
        self.wallet(command.tenant_id, &input.member_id).await?.ok_or(LedgerFault::Rejected("wallet_missing"))
    }

    pub async fn settle_income(&self, command: &CommandEnvelope) -> Result<Receipt, LedgerFault> {
        let input: IncomeInput = serde_json::from_value(command.payload.clone())
            .map_err(|_| LedgerFault::Rejected("invalid_income_request"))?;
        if !valid_member(&input.member_id) || !valid_member(&input.interaction_id) || !valid_amount(input.amount)
            || input.income_action_id.is_nil() || input.policy_revision_id.is_nil() {
            return Err(LedgerFault::Rejected("invalid_income_request"));
        }
        let hash = hash_request(command)?;
        let mut tx = self.pool.begin().await?;
        lock_tenant(&mut tx, command.tenant_id).await?;
        let existing: Option<StoredReceipt> = sqlx::query_as("SELECT transaction_id,tenant_id,currency_id,member_id,amount,balance_after,journal_sequence,request_hash FROM ledger.monetary_transaction WHERE tenant_id=$1 AND idempotency_key=$2")
            .bind(command.tenant_id).bind(command.idempotency_key).fetch_optional(&mut *tx).await?;
        if let Some(old) = existing {
            if old.request_hash != hash { return Err(LedgerFault::Conflict); }
            tx.commit().await?;
            return Ok(Receipt { transaction_id:old.transaction_id,tenant_id:old.tenant_id,
                currency_id:old.currency_id,member_id:old.member_id,amount:old.amount,
                balance_after:old.balance_after,journal_sequence:old.journal_sequence });
        }
        let policy = self.policy_for_update(&mut tx, command.tenant_id).await?;
        if !policy.write_ready || !policy.credit_enabled { return Err(LedgerFault::Rejected("credits_disabled")); }
        let account: Account = sqlx::query_as("SELECT account_id FROM ledger.account WHERE tenant_id=$1 AND member_id=$2 AND kind='Wallet' FOR UPDATE")
            .bind(command.tenant_id).bind(&input.member_id).fetch_optional(&mut *tx).await?
            .ok_or(LedgerFault::Rejected("wallet_missing"))?;
        let receipt = self.post(&mut tx, command, &policy, &input.member_id, account.account_id,
            "DailyIncome", input.income_action_id, input.policy_revision_id, input.amount).await?;
        tx.commit().await?;
        Ok(receipt)
    }

    async fn policy_for_update(&self, tx: &mut Transaction<'_,Postgres>, tenant: Uuid) -> Result<Policy, LedgerFault> {
        sqlx::query_as("SELECT c.tenant_id,c.currency_id,p.revision_id,p.revision,p.starting_grant,p.wallet_ceiling,p.issuance_ceiling,c.credit_enabled,c.write_ready FROM ledger.currency c JOIN ledger.currency_policy_revision p ON p.tenant_id=c.tenant_id WHERE c.tenant_id=$1 ORDER BY p.revision DESC LIMIT 1 FOR UPDATE OF c")
            .bind(tenant).fetch_optional(&mut **tx).await?.ok_or(LedgerFault::Rejected("currency_not_configured"))
    }

    #[allow(clippy::too_many_arguments)]
    async fn post(&self, tx: &mut Transaction<'_,Postgres>, command: &CommandEnvelope,
        policy: &Policy, member: &str, wallet_account: Uuid, kind: &str, source: Uuid,
        policy_revision: Uuid, amount: i64) -> Result<Receipt, LedgerFault> {
        let current: i64 = sqlx::query_scalar("SELECT balance FROM ledger.account WHERE account_id=$1 FOR UPDATE")
            .bind(wallet_account).fetch_one(&mut **tx).await?;
        let issued: i64 = sqlx::query_scalar("SELECT issued FROM ledger.currency WHERE tenant_id=$1 FOR UPDATE")
            .bind(command.tenant_id).fetch_one(&mut **tx).await?;
        let next = current.checked_add(amount).ok_or(LedgerFault::Rejected("wallet_overflow"))?;
        let next_issued = issued.checked_add(amount).ok_or(LedgerFault::Rejected("issuance_overflow"))?;
        if next > policy.wallet_ceiling || next_issued > policy.issuance_ceiling { return Err(LedgerFault::Rejected("ceiling_exceeded")); }
        let issuance: Uuid = sqlx::query_scalar("SELECT account_id FROM ledger.account WHERE tenant_id=$1 AND kind='Issuance'")
            .bind(command.tenant_id).fetch_one(&mut **tx).await?;
        let tx_id = Uuid::now_v7();
        let hash = hash_request(command)?;
        let receipt: Receipt = sqlx::query_as("INSERT INTO ledger.monetary_transaction (transaction_id,tenant_id,currency_id,kind,source_id,policy_revision_id,idempotency_key,request_hash,member_id,amount,balance_after,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP) RETURNING transaction_id,tenant_id,currency_id,member_id,amount,balance_after,journal_sequence")
            .bind(tx_id).bind(command.tenant_id).bind(policy.currency_id).bind(kind).bind(source)
            .bind(policy_revision).bind(if kind=="StartingGrant" { source } else { command.idempotency_key })
            .bind(hash).bind(member).bind(amount).bind(next).fetch_one(&mut **tx).await?;
        for (line,account,direction) in [(1_i16,issuance,"Debit"),(2,wallet_account,"Credit")] {
            sqlx::query("INSERT INTO ledger.monetary_posting (transaction_id,line,account_id,direction,amount) VALUES ($1,$2,$3,$4,$5)")
                .bind(tx_id).bind(line).bind(account).bind(direction).bind(amount).execute(&mut **tx).await?;
        }
        sqlx::query("UPDATE ledger.account SET balance=$2 WHERE account_id=$1")
            .bind(wallet_account).bind(next).execute(&mut **tx).await?;
        sqlx::query("UPDATE ledger.account SET balance=balance-$2 WHERE account_id=$1")
            .bind(issuance).bind(amount).execute(&mut **tx).await?;
        sqlx::query("UPDATE ledger.balance_projection SET current_balance=$2,available_balance=$2,journal_sequence=$3,updated_at=CURRENT_TIMESTAMP WHERE account_id=$1")
            .bind(wallet_account).bind(next).bind(receipt.journal_sequence).execute(&mut **tx).await?;
        sqlx::query("UPDATE ledger.balance_projection SET current_balance=current_balance-$2,available_balance=available_balance-$2,journal_sequence=$3,updated_at=CURRENT_TIMESTAMP WHERE account_id=$1")
            .bind(issuance).bind(amount).bind(receipt.journal_sequence).execute(&mut **tx).await?;
        sqlx::query("UPDATE ledger.currency SET issued=$2 WHERE tenant_id=$1")
            .bind(command.tenant_id).bind(next_issued).execute(&mut **tx).await?;
        self.append_fact(tx, command, "MonetaryTransactionPosted", serde_json::json!({
            "transaction_id":tx_id,"journal_sequence":receipt.journal_sequence,"kind":kind,
            "source_id":source,"member_id":member,"amount":amount,"balance_after":next,
            "currency_id":policy.currency_id,
        })).await?;
        self.append_fact(tx, command, "BalanceProjectionChanged", serde_json::json!({
            "transaction_id":tx_id,"journal_sequence":receipt.journal_sequence,"member_id":member,
            "balance":next,"currency_id":policy.currency_id,
        })).await?;
        Ok(receipt)
    }

    async fn append_fact(&self, tx: &mut Transaction<'_,Postgres>, command: &CommandEnvelope,
        name: &str, payload: serde_json::Value) -> Result<(), LedgerFault> {
        let now = OffsetDateTime::now_utc().format(&Rfc3339)
            .map_err(|error| LedgerFault::Other(error.into()))?;
        let event = EventEnvelope {
            event_id: Uuid::now_v7(), schema_name: name.to_owned(), schema_version: 1,
            schema_family: Some("VirtualPayment".to_owned()), occurred_at: now.clone(), received_at: now,
            application_id: self.application_id.clone(), tenant_id: Some(command.tenant_id),
            guild_id: None, shard_id: None, session_id: None, gateway_sequence: None,
            correlation_id: command.correlation_id, causation_id: Some(command.command_id),
            trace_context: TraceContext { trace_id: command.trace_context.trace_id.clone(), span_id: Uuid::now_v7().to_string() },
            payload,
        };
        let raw = serde_json::to_vec(&event).map_err(|error| LedgerFault::Other(error.into()))?;
        sqlx::query("INSERT INTO ledger.event_outbox (outbox_id,tenant_id,event_id,envelope,created_at) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)")
            .bind(Uuid::now_v7()).bind(command.tenant_id).bind(event.event_id).bind(raw)
            .execute(&mut **tx).await?;
        Ok(())
    }

    pub async fn claim_outbox(&self) -> Result<Option<(Uuid,i64,Vec<u8>)>,sqlx::Error> {
        let row = sqlx::query_as("UPDATE ledger.event_outbox SET fencing_token=fencing_token+1,lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '15 seconds' WHERE outbox_id=(SELECT outbox_id FROM ledger.event_outbox WHERE published_at IS NULL AND (lease_expires_at IS NULL OR lease_expires_at<CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING outbox_id,fencing_token,envelope")
            .fetch_optional(&self.pool).await?;
        Ok(row)
    }
    pub async fn mark_published(&self, id: Uuid, fence: i64) -> Result<(),sqlx::Error> {
        sqlx::query("UPDATE ledger.event_outbox SET published_at=CURRENT_TIMESTAMP WHERE outbox_id=$1 AND fencing_token=$2 AND lease_expires_at>CURRENT_TIMESTAMP AND published_at IS NULL")
            .bind(id).bind(fence).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn reconcile(&self, tenant: Uuid) -> Result<bool,sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        lock_tenant(&mut tx, tenant).await?;
        let bad_transactions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ledger.monetary_transaction t WHERE t.tenant_id=$1 AND ((SELECT COUNT(*) FROM ledger.monetary_posting p WHERE p.transaction_id=t.transaction_id)<>2 OR (SELECT COALESCE(SUM(CASE WHEN p.direction='Credit' THEN p.amount ELSE -p.amount END),0) FROM ledger.monetary_posting p WHERE p.transaction_id=t.transaction_id)<>0 OR EXISTS (SELECT 1 FROM ledger.monetary_posting p JOIN ledger.account a ON a.account_id=p.account_id WHERE p.transaction_id=t.transaction_id AND (a.tenant_id<>t.tenant_id OR a.currency_id<>t.currency_id)))")
            .bind(tenant).fetch_one(&mut *tx).await?;
        let bad_accounts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ledger.account a LEFT JOIN ledger.balance_projection b ON b.account_id=a.account_id WHERE a.tenant_id=$1 AND (b.account_id IS NULL OR a.balance<>b.current_balance OR b.current_balance<>b.available_balance OR a.balance<>COALESCE((SELECT SUM(CASE WHEN p.direction='Credit' THEN p.amount ELSE -p.amount END) FROM ledger.monetary_posting p WHERE p.account_id=a.account_id),0) OR b.journal_sequence<>COALESCE((SELECT MAX(t.journal_sequence) FROM ledger.monetary_posting p JOIN ledger.monetary_transaction t ON t.transaction_id=p.transaction_id WHERE p.account_id=a.account_id),0))")
            .bind(tenant).fetch_one(&mut *tx).await?;
        let issued: Option<i64> = sqlx::query_scalar("SELECT issued FROM ledger.currency WHERE tenant_id=$1")
            .bind(tenant).fetch_optional(&mut *tx).await?;
        let wallet_total: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(balance),0)::bigint FROM ledger.account WHERE tenant_id=$1 AND kind='Wallet'")
            .bind(tenant).fetch_one(&mut *tx).await?;
        let good = bad_transactions==0 && bad_accounts==0 && issued==Some(wallet_total);
        let sequence: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(journal_sequence),0)::bigint FROM ledger.monetary_transaction WHERE tenant_id=$1")
            .bind(tenant).fetch_one(&mut *tx).await?;
        sqlx::query("INSERT INTO ledger.reconciliation (tenant_id,checked_sequence,checked_at,healthy) VALUES ($1,$2,CURRENT_TIMESTAMP,$3) ON CONFLICT (tenant_id) DO UPDATE SET checked_sequence=EXCLUDED.checked_sequence,checked_at=EXCLUDED.checked_at,healthy=EXCLUDED.healthy")
            .bind(tenant).bind(sequence).bind(good).execute(&mut *tx).await?;
        sqlx::query("UPDATE ledger.currency SET write_ready=$2 WHERE tenant_id=$1")
            .bind(tenant).bind(good).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(good)
    }
}
