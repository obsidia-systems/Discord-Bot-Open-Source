//! Diario de créditos y ejecución de texto. Los bytes viven en Asset.

use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use time::OffsetDateTime;
use tobot_envelope::{EventEnvelope, TraceContext};
use uuid::Uuid;

use crate::{
    provider::TextProvider,
    rules::{self, AttemptClass, LotView},
};

#[derive(Debug)]
pub enum AiError {
    Rejected(&'static str),
    Conflict,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for AiError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

#[derive(Clone, Debug)]
pub struct PricingInput {
    pub pricing_revision_id: Uuid,
    pub model_class: String,
    pub estimate_amount: i64,
    pub maximum_amount: i64,
    pub unit_charge: i64,
    pub user_daily_ceiling: i64,
    pub guild_daily_ceiling: i64,
}

#[derive(Clone, Debug)]
pub struct GrantInput {
    pub source_ref: Uuid,
    pub credit_minors: i64,
    pub expires_at: Option<OffsetDateTime>,
}

#[derive(Clone, Debug)]
pub struct TextInput {
    pub operation_id: Uuid,
    pub semantic_key: Uuid,
    pub actor_id: String,
    pub pricing_revision_id: Uuid,
    pub prompt: String,
    pub script: Vec<AttemptClass>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct TextOutcome {
    pub operation_id: Uuid,
    pub operation_state: String,
    pub reservation_state: String,
    pub reserved: i64,
    pub captured: i64,
    pub completed: bool,
    pub reply: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct UsageView {
    pub available: i64,
    pub reserved: i64,
    pub operations: Vec<TextOutcome>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct CreditReview {
    pub reservation_id: Uuid,
    pub operation_id: Uuid,
    pub actor_id: String,
    pub reservation_state: String,
    pub estimated_amount: i64,
    pub captured_amount: i64,
    pub review_at: Option<String>,
    pub model_class: String,
}

#[derive(Clone)]
pub struct AiStore {
    pub pool: PgPool,
    pub application_id: String,
}

struct Price {
    model_class: String,
    estimate: i64,
    unit_charge: i64,
}

impl AiStore {
    /// Publica una revisión inmutable y retira solo la revisión activa anterior.
    /// # Errors
    /// Devuelve un error si la revisión contradice una fila ya guardada.
    pub async fn publish_pricing(
        &self,
        pricing: &PricingInput,
        now: OffsetDateTime,
    ) -> Result<(), AiError> {
        let mut tx = self.pool.begin().await?;
        let previous: Option<(i64, i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT estimate_amount,maximum_amount,unit_charge,user_daily_ceiling,guild_daily_ceiling FROM ai_ledger.pricing WHERE pricing_revision_id=$1",
        )
        .bind(pricing.pricing_revision_id)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(existing) = previous {
            let same = existing
                == (
                    pricing.estimate_amount,
                    pricing.maximum_amount,
                    pricing.unit_charge,
                    pricing.user_daily_ceiling,
                    pricing.guild_daily_ceiling,
                );
            if !same {
                return Err(AiError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        sqlx::query(
            "UPDATE ai_ledger.pricing SET active=false WHERE operation_class='text' AND active",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO ai_ledger.pricing (pricing_revision_id,operation_class,model_class,estimate_amount,maximum_amount,unit_charge,user_daily_ceiling,guild_daily_ceiling,active,published_at) VALUES ($1,'text',$2,$3,$4,$5,$6,$7,true,$8)")
            .bind(pricing.pricing_revision_id)
            .bind(&pricing.model_class)
            .bind(pricing.estimate_amount)
            .bind(pricing.maximum_amount)
            .bind(pricing.unit_charge)
            .bind(pricing.user_daily_ceiling)
            .bind(pricing.guild_daily_ceiling)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Acuña un lote desde un hecho de concesión. Una repetición no crea otro.
    /// # Errors
    /// Rechaza un mismo origen con otro importe.
    pub async fn apply_grant(
        &self,
        tenant: Uuid,
        grant: &GrantInput,
        now: OffsetDateTime,
    ) -> Result<Uuid, AiError> {
        let mut tx = self.pool.begin().await?;
        let account = ensure_account(&mut tx, tenant).await?;
        let existing: Option<(Uuid, i64)> =
            sqlx::query_as("SELECT lot_id,granted_amount FROM ai_ledger.lot WHERE source_ref=$1")
                .bind(grant.source_ref)
                .fetch_optional(&mut *tx)
                .await?;
        if let Some((lot_id, amount)) = existing {
            if amount != grant.credit_minors {
                return Err(AiError::Conflict);
            }
            tx.commit().await?;
            return Ok(lot_id);
        }
        let lot_id = Uuid::now_v7();
        sqlx::query("INSERT INTO ai_ledger.lot (lot_id,account_id,tenant_id,source_ref,granted_amount,available_amount,granted_at,expires_at,state) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,'Active')")
            .bind(lot_id)
            .bind(account)
            .bind(tenant)
            .bind(grant.source_ref)
            .bind(grant.credit_minors)
            .bind(now)
            .bind(grant.expires_at)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE ai_ledger.account SET posted_balance=posted_balance+$2 WHERE account_id=$1",
        )
        .bind(account)
        .bind(grant.credit_minors)
        .execute(&mut *tx)
        .await?;
        journal(
            &mut tx,
            account,
            "Grant",
            grant.credit_minors,
            grant.source_ref,
            format!("grant:{source}", source = grant.source_ref),
        )
        .await?;
        tx.commit().await?;
        Ok(lot_id)
    }

    /// Reserva el máximo de la revisión y solo entonces clasifica el intento.
    /// # Errors
    /// Rechaza saldo, techo o precio insuficiente sin llamar al proveedor.
    pub async fn run_text(
        &self,
        tenant: Uuid,
        input: &TextInput,
        now: OffsetDateTime,
        provider: Option<&TextProvider>,
    ) -> Result<TextOutcome, AiError> {
        if let Some(existing) = self
            .outcome(tenant, &input.actor_id, input.semantic_key)
            .await?
        {
            return Ok(existing);
        }
        let price = self.reserve(tenant, input, now).await?;
        if input.script.is_empty()
            && let Some(provider) = provider
        {
            self.complete_with_provider(input, now, &price, provider)
                .await?;
            return self
                .outcome(tenant, &input.actor_id, input.semantic_key)
                .await?
                .ok_or(AiError::Rejected("operation missing after reserve"));
        }
        let script = if input.script.is_empty() {
            vec![AttemptClass::ConfirmedResult]
        } else {
            input.script.clone()
        };
        let mut attempt_number = 0_i32;
        for class in &script {
            attempt_number += 1;
            if attempt_number > 3 {
                break;
            }
            self.record_attempt(input.operation_id, attempt_number, *class)
                .await?;
            if class.may_retry()
                && attempt_number < 3
                && usize::try_from(attempt_number).unwrap_or(3) < script.len()
            {
                continue;
            }
            if *class == AttemptClass::ConfirmedResult {
                let characters = i64::try_from(input.prompt.chars().count()).unwrap_or(i64::MAX);
                let Some(charge) =
                    rules::rated_charge(price.estimate, price.unit_charge, characters)
                else {
                    self.mark_uncertain(input.operation_id, now).await?;
                    break;
                };
                self.capture(
                    input.operation_id,
                    charge,
                    &fixture_reply(&input.prompt),
                    now,
                )
                .await?;
            } else if matches!(
                class,
                AttemptClass::TimeoutAfterSend | AttemptClass::Uncertain
            ) {
                self.mark_uncertain(input.operation_id, now).await?;
            } else {
                self.release(input.operation_id, "Failed", now).await?;
            }
            break;
        }
        self.outcome(tenant, &input.actor_id, input.semantic_key)
            .await?
            .ok_or(AiError::Rejected("operation missing after reserve"))
    }

    async fn complete_with_provider(
        &self,
        input: &TextInput,
        now: OffsetDateTime,
        price: &Price,
        provider: &TextProvider,
    ) -> Result<(), AiError> {
        let mut attempt_number = 0_i32;
        loop {
            attempt_number += 1;
            if attempt_number > 3 {
                self.mark_uncertain(input.operation_id, now).await?;
                break;
            }
            let outcome = provider.generate(&price.model_class, &input.prompt).await;
            tracing::info!(
                operation_id = %input.operation_id,
                class = outcome.class.as_str(),
                "text provider attempt finished"
            );
            self.record_attempt(input.operation_id, attempt_number, outcome.class)
                .await?;
            if outcome.class.may_retry() && attempt_number < 3 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                continue;
            }
            if outcome.class == AttemptClass::ConfirmedResult {
                let Some(charge) =
                    rules::rated_charge(price.estimate, price.unit_charge, outcome.characters)
                else {
                    self.mark_uncertain(input.operation_id, now).await?;
                    break;
                };
                if charge <= 0 {
                    self.release(input.operation_id, "Failed", now).await?;
                    break;
                }
                self.capture(
                    input.operation_id,
                    charge,
                    outcome.reply.as_deref().unwrap_or_default(),
                    now,
                )
                .await?;
            } else if matches!(
                outcome.class,
                AttemptClass::TimeoutAfterSend | AttemptClass::Uncertain
            ) {
                self.mark_uncertain(input.operation_id, now).await?;
            } else {
                self.release(input.operation_id, "Failed", now).await?;
            }
            break;
        }
        Ok(())
    }

    /// Pasa reservas vencidas a revisión sin liberarlas.
    /// # Errors
    /// Devuelve un error si el barrido no puede confirmarse.
    pub async fn sweep(&self, now: OffsetDateTime) -> Result<u64, AiError> {
        let mut tx = self.pool.begin().await?;
        let expired: Vec<Uuid> = sqlx::query_scalar(
            "SELECT reservation_id FROM ai_ledger.reservation WHERE state='Reserved' AND expires_at<=$1 FOR UPDATE",
        )
        .bind(now)
        .fetch_all(&mut *tx)
        .await?;
        let mut changed = 0_u64;
        for reservation in expired {
            let deadline = now + time::Duration::hours(24);
            let reservation_state = rules::reservation_after_ttl("Reserved");
            let operation_state = rules::operation_while_reviewing(reservation_state, "Reserved");
            sqlx::query("UPDATE ai_ledger.reservation SET state=$2,uncertainty_deadline_at=$3 WHERE reservation_id=$1")
                .bind(reservation)
                .bind(reservation_state)
                .bind(deadline)
                .execute(&mut *tx)
                .await?;
            sqlx::query("UPDATE ai_execution.operation SET state=$2 WHERE reservation_id=$1")
                .bind(reservation)
                .bind(operation_state)
                .execute(&mut *tx)
                .await?;
            self.record_reservation_fact(&mut tx, reservation, "AiCreditUncertain", now)
                .await?;
            changed += 1;
        }
        let due: Vec<Uuid> = sqlx::query_scalar(
            "SELECT reservation_id FROM ai_ledger.reservation WHERE state='Uncertain' AND uncertainty_deadline_at<=$1 FOR UPDATE",
        )
        .bind(now)
        .fetch_all(&mut *tx)
        .await?;
        for reservation in due {
            let reservation_state = rules::reservation_after_deadline("Uncertain");
            let operation_state = rules::operation_while_reviewing(reservation_state, "Succeeded");
            sqlx::query("UPDATE ai_ledger.reservation SET state=$2 WHERE reservation_id=$1")
                .bind(reservation)
                .bind(reservation_state)
                .execute(&mut *tx)
                .await?;
            sqlx::query("UPDATE ai_execution.operation SET state=$2 WHERE reservation_id=$1")
                .bind(reservation)
                .bind(operation_state)
                .execute(&mut *tx)
                .await?;
            self.record_reservation_fact(&mut tx, reservation, "AiCreditDisputed", now)
                .await?;
            changed += 1;
        }
        tx.commit().await?;
        Ok(changed)
    }

    /// Cierra una reserva en revisión solo con evidencia de uso o de ausencia.
    /// # Errors
    /// Rechaza una reserva que no está en `Disputed`.
    pub async fn reconcile(
        &self,
        tenant: Uuid,
        reservation_id: Uuid,
        evidence: &str,
        now: OffsetDateTime,
    ) -> Result<TextOutcome, AiError> {
        let row: Option<(Uuid, String, i64, String)> = sqlx::query_as(
            "SELECT o.operation_id,r.state,r.estimated_amount,o.actor_id FROM ai_ledger.reservation r JOIN ai_execution.operation o ON o.operation_id=r.operation_id WHERE r.reservation_id=$1 AND r.tenant_id=$2",
        )
        .bind(reservation_id)
        .bind(tenant)
        .fetch_optional(&self.pool)
        .await?;
        let Some((operation_id, state, estimated, actor)) = row else {
            return Err(AiError::Rejected("reservation not found"));
        };
        if state != "Disputed" {
            return Err(AiError::Rejected("reservation is not in review"));
        }
        if evidence == "usage" {
            self.capture(
                operation_id,
                estimated,
                "Usage confirmed by reconciliation.",
                now,
            )
            .await?;
        } else if evidence == "absence" {
            self.release(operation_id, "Failed", now).await?;
        } else {
            return Err(AiError::Rejected("unknown reconciliation evidence"));
        }
        let semantic: Uuid = sqlx::query_scalar(
            "SELECT semantic_key FROM ai_execution.operation WHERE operation_id=$1",
        )
        .bind(operation_id)
        .fetch_one(&self.pool)
        .await?;
        self.outcome(tenant, &actor, semantic)
            .await?
            .ok_or(AiError::Rejected("reconciled operation missing"))
    }

    /// # Errors
    /// Devuelve error si el precio activo no se puede leer.
    pub async fn active_pricing(&self) -> Result<Option<Uuid>, AiError> {
        sqlx::query_scalar("SELECT pricing_revision_id FROM ai_ledger.pricing WHERE operation_class='text' AND active")
            .fetch_optional(&self.pool)
            .await
            .map_err(AiError::from)
    }

    /// Lectura del miembro. `Disputed` no se informa como completado.
    /// # Errors
    /// Devuelve un error si la lectura no puede confirmarse.
    pub async fn usage(&self, tenant: Uuid, actor: &str) -> Result<UsageView, AiError> {
        let balances: Option<(i64, i64)> = sqlx::query_as(
            "SELECT COALESCE(SUM(l.available_amount),0)::bigint, COALESCE((SELECT SUM(estimated_amount-captured_amount) FROM ai_ledger.reservation r WHERE r.tenant_id=$1 AND r.state IN ('Reserved','Uncertain','Disputed')),0)::bigint FROM ai_ledger.lot l WHERE l.tenant_id=$1 AND l.state='Active'",
        )
        .bind(tenant)
        .fetch_optional(&self.pool)
        .await?;
        let (available, reserved) = balances.unwrap_or((0, 0));
        let rows = sqlx::query(
            "SELECT o.operation_id,o.state,COALESCE(r.state,'Rejected'),COALESCE(r.estimated_amount,0),COALESCE(r.captured_amount,0) FROM ai_execution.operation o LEFT JOIN ai_ledger.reservation r ON r.reservation_id=o.reservation_id WHERE o.tenant_id=$1 AND o.actor_id=$2 ORDER BY o.operation_id",
        )
        .bind(tenant)
        .bind(actor)
        .fetch_all(&self.pool)
        .await?;
        let mut operations = Vec::new();
        for row in rows {
            let operation_id: Uuid = row.try_get(0)?;
            let operation_state: String = row.try_get(1)?;
            let reservation_state: String = row.try_get(2)?;
            let reserved_amount: i64 = row.try_get(3)?;
            let captured: i64 = row.try_get(4)?;
            let reply = self.reply_text(operation_id).await?;
            operations.push(outcome_from(
                operation_id,
                &operation_state,
                &reservation_state,
                reserved_amount,
                captured,
                reply,
            ));
        }
        Ok(UsageView {
            available,
            reserved,
            operations,
        })
    }

    /// Lista reservas en verificación o en revisión, sin el texto de la operación.
    /// # Errors
    /// Devuelve un error si la lectura no puede confirmarse.
    pub async fn open_reviews(&self, tenant: Uuid) -> Result<Vec<CreditReview>, AiError> {
        let rows = sqlx::query(
            "SELECT r.reservation_id, o.operation_id, r.actor_id, r.state, r.estimated_amount, r.captured_amount, r.uncertainty_deadline_at, COALESCE(p.model_class, '') AS model_class FROM ai_ledger.reservation r JOIN ai_execution.operation o ON o.operation_id = r.operation_id LEFT JOIN ai_ledger.pricing p ON p.pricing_revision_id = o.pricing_revision_id WHERE r.tenant_id = $1 AND r.state IN ('Uncertain', 'Disputed') ORDER BY r.uncertainty_deadline_at NULLS LAST, r.reservation_id",
        )
        .bind(tenant)
        .fetch_all(&self.pool)
        .await?;
        rows.iter()
            .map(|row| {
                let deadline: Option<OffsetDateTime> = row.try_get("uncertainty_deadline_at")?;
                Ok(CreditReview {
                    reservation_id: row.try_get("reservation_id")?,
                    operation_id: row.try_get("operation_id")?,
                    actor_id: row.try_get("actor_id")?,
                    reservation_state: row.try_get("state")?,
                    estimated_amount: row.try_get("estimated_amount")?,
                    captured_amount: row.try_get("captured_amount")?,
                    review_at: deadline.and_then(|moment| {
                        moment
                            .format(&time::format_description::well_known::Rfc3339)
                            .ok()
                    }),
                    model_class: row.try_get("model_class")?,
                })
            })
            .collect()
    }

    #[allow(clippy::too_many_lines)]
    async fn reserve(
        &self,
        tenant: Uuid,
        input: &TextInput,
        now: OffsetDateTime,
    ) -> Result<Price, AiError> {
        let mut tx = self.pool.begin().await?;
        let price_row: Option<(String, i64, i64, i64, i64, bool)> = sqlx::query_as(
            "SELECT model_class,estimate_amount,unit_charge,user_daily_ceiling,guild_daily_ceiling,active FROM ai_ledger.pricing WHERE pricing_revision_id=$1",
        )
        .bind(input.pricing_revision_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((model_class, estimate, unit_charge, user_ceiling, guild_ceiling, active)) =
            price_row
        else {
            return Err(AiError::Rejected("pricing revision is not active"));
        };
        if !active {
            return Err(AiError::Rejected("pricing revision is not active"));
        }
        let day_start = now.replace_time(time::Time::MIDNIGHT);
        let user_spent: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(r.captured_amount),0)::bigint FROM ai_ledger.reservation r WHERE r.tenant_id=$1 AND r.actor_id=$2 AND r.state='Captured' AND r.settled_at>=$3",
        )
        .bind(tenant)
        .bind(&input.actor_id)
        .bind(day_start)
        .fetch_one(&mut *tx)
        .await?;
        let guild_spent: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(captured_amount),0)::bigint FROM ai_ledger.reservation WHERE tenant_id=$1 AND state='Captured' AND settled_at>=$2",
        )
        .bind(tenant)
        .bind(day_start)
        .fetch_one(&mut *tx)
        .await?;
        if user_spent.saturating_add(estimate) > user_ceiling
            || guild_spent.saturating_add(estimate) > guild_ceiling
        {
            return Err(AiError::Rejected("spending ceiling"));
        }
        let account = ensure_account(&mut tx, tenant).await?;
        let lot_rows = sqlx::query(
            "SELECT lot_id,available_amount,expires_at,granted_at FROM ai_ledger.lot WHERE account_id=$1 AND state='Active' AND available_amount>0 ORDER BY expires_at NULLS LAST,granted_at,lot_id FOR UPDATE",
        )
        .bind(account)
        .fetch_all(&mut *tx)
        .await?;
        let lots = lot_rows
            .iter()
            .map(|row| {
                Ok::<_, sqlx::Error>(LotView {
                    id: row.try_get("lot_id")?,
                    available: row.try_get("available_amount")?,
                    expires_at: row.try_get("expires_at")?,
                    granted_at: row.try_get("granted_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let ordered = rules::allocation_order(lots, now);
        let Some(shares) = rules::allocate(&ordered, estimate) else {
            return Err(AiError::Rejected("insufficient credits"));
        };
        let reservation_id = Uuid::now_v7();
        let input_ref = Uuid::now_v7();
        let asset_id = Uuid::now_v7();
        store_bytes(
            &mut tx,
            tenant,
            asset_id,
            input_ref,
            input.operation_id,
            "OperationInput",
            input.prompt.as_bytes(),
        )
        .await?;
        sqlx::query("INSERT INTO ai_execution.operation (operation_id,tenant_id,actor_id,semantic_key,pricing_revision_id,reservation_id,input_ref,state) VALUES ($1,$2,$3,$4,$5,$6,$7,'Executing')")
            .bind(input.operation_id)
            .bind(tenant)
            .bind(&input.actor_id)
            .bind(input.semantic_key)
            .bind(input.pricing_revision_id)
            .bind(reservation_id)
            .bind(input_ref)
            .execute(&mut *tx)
            .await?;
        let expires = now + time::Duration::minutes(15);
        sqlx::query("INSERT INTO ai_ledger.reservation (reservation_id,operation_id,tenant_id,actor_id,estimated_amount,state,expires_at) VALUES ($1,$2,$3,$4,$5,'Reserved',$6)")
            .bind(reservation_id)
            .bind(input.operation_id)
            .bind(tenant)
            .bind(&input.actor_id)
            .bind(estimate)
            .bind(expires)
            .execute(&mut *tx)
            .await?;
        for (lot_id, amount) in shares {
            sqlx::query("INSERT INTO ai_ledger.allocation (allocation_id,reservation_id,lot_id,reserved_amount) VALUES ($1,$2,$3,$4)")
                .bind(Uuid::now_v7())
                .bind(reservation_id)
                .bind(lot_id)
                .bind(amount)
                .execute(&mut *tx)
                .await?;
            sqlx::query(
                "UPDATE ai_ledger.lot SET available_amount=available_amount-$2 WHERE lot_id=$1",
            )
            .bind(lot_id)
            .bind(amount)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query(
            "UPDATE ai_ledger.account SET reserved_balance=reserved_balance+$2 WHERE account_id=$1",
        )
        .bind(account)
        .bind(estimate)
        .execute(&mut *tx)
        .await?;
        journal(
            &mut tx,
            account,
            "Reserve",
            estimate,
            reservation_id,
            format!("reserve:{reservation_id}"),
        )
        .await?;
        self.record_reservation_fact(&mut tx, reservation_id, "AiCreditReserved", now)
            .await?;
        tx.commit().await?;
        Ok(Price {
            model_class,
            estimate,
            unit_charge,
        })
    }

    async fn record_attempt(
        &self,
        operation_id: Uuid,
        number: i32,
        class: AttemptClass,
    ) -> Result<(), AiError> {
        sqlx::query("INSERT INTO ai_execution.attempt (attempt_id,operation_id,attempt_number,result_class) VALUES ($1,$2,$3,$4)")
            .bind(Uuid::now_v7())
            .bind(operation_id)
            .bind(number)
            .bind(class.as_str())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    #[allow(clippy::too_many_lines)]
    async fn capture(
        &self,
        operation_id: Uuid,
        charge: i64,
        reply: &str,
        now: OffsetDateTime,
    ) -> Result<(), AiError> {
        let mut tx = self.pool.begin().await?;
        let reservation: Option<(Uuid, Uuid, i64, String)> = sqlx::query_as(
            "SELECT r.reservation_id,a.account_id,r.estimated_amount,r.state FROM ai_ledger.reservation r JOIN ai_execution.operation o ON o.operation_id=r.operation_id JOIN ai_ledger.account a ON a.tenant_id=r.tenant_id WHERE r.operation_id=$1 FOR UPDATE OF r",
        )
        .bind(operation_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((reservation_id, account, estimated, state)) = reservation else {
            return Err(AiError::Rejected("reservation missing"));
        };
        if !matches!(state.as_str(), "Reserved" | "Uncertain" | "Disputed")
            || charge <= 0
            || charge > estimated
        {
            return Err(AiError::Rejected("capture is not admissible"));
        }
        let mut remaining = charge;
        let allocations = sqlx::query("SELECT allocation_id,lot_id,reserved_amount FROM ai_ledger.allocation WHERE reservation_id=$1 ORDER BY allocation_id FOR UPDATE")
            .bind(reservation_id)
            .fetch_all(&mut *tx)
            .await?;
        for allocation in allocations {
            let allocation_id: Uuid = allocation.try_get("allocation_id")?;
            let lot_id: Uuid = allocation.try_get("lot_id")?;
            let reserved_amount: i64 = allocation.try_get("reserved_amount")?;
            let take = remaining.min(reserved_amount);
            let give_back = reserved_amount - take;
            sqlx::query(
                "UPDATE ai_ledger.allocation SET captured_amount=$2 WHERE allocation_id=$1",
            )
            .bind(allocation_id)
            .bind(take)
            .execute(&mut *tx)
            .await?;
            if give_back > 0 {
                sqlx::query(
                    "UPDATE ai_ledger.lot SET available_amount=available_amount+$2 WHERE lot_id=$1",
                )
                .bind(lot_id)
                .bind(give_back)
                .execute(&mut *tx)
                .await?;
            }
            remaining -= take;
        }
        sqlx::query("UPDATE ai_ledger.reservation SET state='Captured',captured_amount=$2,settled_at=$3 WHERE reservation_id=$1")
            .bind(reservation_id)
            .bind(charge)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE ai_ledger.account SET posted_balance=posted_balance-$2,reserved_balance=reserved_balance-$3 WHERE account_id=$1")
            .bind(account)
            .bind(charge)
            .bind(estimated)
            .execute(&mut *tx)
            .await?;
        journal(
            &mut tx,
            account,
            "Capture",
            charge,
            reservation_id,
            format!("capture:{reservation_id}"),
        )
        .await?;
        if estimated > charge {
            journal(
                &mut tx,
                account,
                "Release",
                estimated - charge,
                reservation_id,
                format!("remainder:{reservation_id}"),
            )
            .await?;
        }
        let tenant: Uuid = sqlx::query_scalar(
            "SELECT tenant_id FROM ai_execution.operation WHERE operation_id=$1",
        )
        .bind(operation_id)
        .fetch_one(&mut *tx)
        .await?;
        let result_ref = Uuid::now_v7();
        let asset_id = Uuid::now_v7();
        store_bytes(
            &mut tx,
            tenant,
            asset_id,
            result_ref,
            operation_id,
            "OperationOutput",
            reply.as_bytes(),
        )
        .await?;
        sqlx::query(
            "UPDATE ai_execution.operation SET state='Settled',result_ref=$2 WHERE operation_id=$1",
        )
        .bind(operation_id)
        .bind(result_ref)
        .execute(&mut *tx)
        .await?;
        self.record_reservation_fact(&mut tx, reservation_id, "AiCreditCaptured", now)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn release(
        &self,
        operation_id: Uuid,
        operation_state: &str,
        now: OffsetDateTime,
    ) -> Result<(), AiError> {
        let mut tx = self.pool.begin().await?;
        let reservation: Option<(Uuid, Uuid, i64, String)> = sqlx::query_as(
            "SELECT r.reservation_id,a.account_id,r.estimated_amount,r.state FROM ai_ledger.reservation r JOIN ai_execution.operation o ON o.operation_id=r.operation_id JOIN ai_ledger.account a ON a.tenant_id=r.tenant_id WHERE r.operation_id=$1 FOR UPDATE OF r",
        )
        .bind(operation_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((reservation_id, account, estimated, state)) = reservation else {
            return Err(AiError::Rejected("reservation missing"));
        };
        if !matches!(state.as_str(), "Reserved" | "Uncertain" | "Disputed") {
            return Err(AiError::Rejected("release is not admissible"));
        }
        let allocations = sqlx::query(
            "SELECT lot_id,reserved_amount FROM ai_ledger.allocation WHERE reservation_id=$1",
        )
        .bind(reservation_id)
        .fetch_all(&mut *tx)
        .await?;
        for allocation in allocations {
            let lot_id: Uuid = allocation.try_get("lot_id")?;
            let amount: i64 = allocation.try_get("reserved_amount")?;
            sqlx::query(
                "UPDATE ai_ledger.lot SET available_amount=available_amount+$2 WHERE lot_id=$1",
            )
            .bind(lot_id)
            .bind(amount)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query("UPDATE ai_ledger.reservation SET state='Released' WHERE reservation_id=$1")
            .bind(reservation_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE ai_ledger.account SET reserved_balance=reserved_balance-$2 WHERE account_id=$1",
        )
        .bind(account)
        .bind(estimated)
        .execute(&mut *tx)
        .await?;
        journal(
            &mut tx,
            account,
            "Release",
            estimated,
            reservation_id,
            format!("release:{reservation_id}"),
        )
        .await?;
        sqlx::query("UPDATE ai_execution.operation SET state='Settled' WHERE operation_id=$1 AND $2 IN ('Failed','Settled')")
            .bind(operation_id)
            .bind(operation_state)
            .execute(&mut *tx)
            .await?;
        self.record_reservation_fact(&mut tx, reservation_id, "AiCreditReleased", now)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn mark_uncertain(&self, operation_id: Uuid, now: OffsetDateTime) -> Result<(), AiError> {
        let mut tx = self.pool.begin().await?;
        let reservation: Option<Uuid> = sqlx::query_scalar(
            "SELECT reservation_id FROM ai_ledger.reservation WHERE operation_id=$1 AND state='Reserved' FOR UPDATE",
        )
        .bind(operation_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(reservation_id) = reservation else {
            return Err(AiError::Rejected("reservation is not open"));
        };
        let deadline = now + time::Duration::hours(24);
        let reservation_state = rules::reservation_after_ttl("Reserved");
        let operation_state = rules::operation_while_reviewing(reservation_state, "Reserved");
        sqlx::query("UPDATE ai_ledger.reservation SET state=$2,uncertainty_deadline_at=$3 WHERE reservation_id=$1")
            .bind(reservation_id)
            .bind(reservation_state)
            .bind(deadline)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE ai_execution.operation SET state=$2 WHERE operation_id=$1")
            .bind(operation_id)
            .bind(operation_state)
            .execute(&mut *tx)
            .await?;
        self.record_reservation_fact(&mut tx, reservation_id, "AiCreditUncertain", now)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn outcome(
        &self,
        tenant: Uuid,
        actor: &str,
        semantic: Uuid,
    ) -> Result<Option<TextOutcome>, AiError> {
        let row = sqlx::query(
            "SELECT o.operation_id,o.state,COALESCE(r.state,'Rejected'),COALESCE(r.estimated_amount,0),COALESCE(r.captured_amount,0) FROM ai_execution.operation o LEFT JOIN ai_ledger.reservation r ON r.reservation_id=o.reservation_id WHERE o.tenant_id=$1 AND o.actor_id=$2 AND o.semantic_key=$3",
        )
        .bind(tenant)
        .bind(actor)
        .bind(semantic)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let operation_id: Uuid = row.try_get(0)?;
        let reply = self.reply_text(operation_id).await?;
        Ok(Some(outcome_from(
            operation_id,
            &row.try_get::<String, _>(1)?,
            &row.try_get::<String, _>(2)?,
            row.try_get(3)?,
            row.try_get(4)?,
            reply,
        )))
    }

    async fn reply_text(&self, operation_id: Uuid) -> Result<Option<String>, AiError> {
        let body: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT body FROM asset.object WHERE asset_id=(SELECT asset_id FROM ai_execution.protected_content WHERE operation_id=$1 AND purpose='OperationOutput')",
        )
        .bind(operation_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(body.and_then(|bytes| String::from_utf8(bytes).ok()))
    }

    async fn record_reservation_fact(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        reservation_id: Uuid,
        name: &str,
        now: OffsetDateTime,
    ) -> Result<(), AiError> {
        let tenant: Uuid = sqlx::query_scalar(
            "SELECT tenant_id FROM ai_ledger.reservation WHERE reservation_id=$1",
        )
        .bind(reservation_id)
        .fetch_one(&mut **tx)
        .await?;
        let event = EventEnvelope {
            event_id: Uuid::now_v7(),
            schema_name: name.to_owned(),
            schema_version: 1,
            schema_family: Some("AiCreditReservation".to_owned()),
            occurred_at: now
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            received_at: now
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            application_id: self.application_id.clone(),
            tenant_id: Some(tenant),
            guild_id: None,
            shard_id: None,
            session_id: None,
            gateway_sequence: None,
            correlation_id: reservation_id,
            causation_id: None,
            trace_context: TraceContext {
                trace_id: reservation_id.to_string(),
                span_id: "ai".to_owned(),
            },
            payload: serde_json::json!({"reservation_id": reservation_id}),
        };
        let raw = serde_json::to_string(&event).map_err(|_| AiError::Rejected("fact encoding"))?;
        sqlx::query("INSERT INTO ai_ledger.outbox (outbox_id,envelope) VALUES ($1,$2)")
            .bind(Uuid::now_v7())
            .bind(raw)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }
}

fn outcome_from(
    operation_id: Uuid,
    operation_state: &str,
    reservation_state: &str,
    reserved: i64,
    captured: i64,
    reply: Option<String>,
) -> TextOutcome {
    let shown = rules::operation_while_reviewing(reservation_state, operation_state);
    let completed = rules::review_is_completed(reservation_state) && shown == "Settled";
    TextOutcome {
        operation_id,
        operation_state: shown.to_owned(),
        reservation_state: reservation_state.to_owned(),
        reserved,
        captured,
        completed,
        reply: completed.then_some(reply).flatten(),
    }
}

fn fixture_reply(prompt: &str) -> String {
    format!("Counted {} characters.", prompt.chars().count())
}

async fn ensure_account(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant: Uuid,
) -> Result<Uuid, AiError> {
    let existing: Option<Uuid> =
        sqlx::query_scalar("SELECT account_id FROM ai_ledger.account WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_optional(&mut **tx)
            .await?;
    if let Some(account) = existing {
        return Ok(account);
    }
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO ai_ledger.account (account_id,tenant_id,posted_balance,reserved_balance) VALUES ($1,$2,0,0)")
        .bind(account)
        .bind(tenant)
        .execute(&mut **tx)
        .await?;
    Ok(account)
}

async fn journal(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    account: Uuid,
    kind: &str,
    amount: i64,
    source: Uuid,
    key: String,
) -> Result<(), AiError> {
    sqlx::query("INSERT INTO ai_ledger.journal (entry_id,account_id,entry_type,amount,source_ref,semantic_key) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(Uuid::now_v7())
        .bind(account)
        .bind(kind)
        .bind(amount)
        .bind(source)
        .bind(key)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn store_bytes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant: Uuid,
    asset_id: Uuid,
    protected_id: Uuid,
    operation_id: Uuid,
    purpose: &str,
    body: &[u8],
) -> Result<(), AiError> {
    let digest = Sha256::digest(body);
    let encoded = format!("{digest:x}");
    sqlx::query("INSERT INTO asset.object (asset_id,tenant_id,sha256,mime,body) VALUES ($1,$2,$3,'text/plain',$4)")
        .bind(asset_id)
        .bind(tenant)
        .bind(encoded)
        .bind(body)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO ai_execution.protected_content (protected_content_id,tenant_id,purpose,asset_id,operation_id,state) VALUES ($1,$2,$3,$4,$5,'Available')")
        .bind(protected_id)
        .bind(tenant)
        .bind(purpose)
        .bind(asset_id)
        .bind(operation_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn database() -> Option<PgPool> {
        let url = std::env::var("TOBOT_AI_TEST_DATABASE_URL").ok()?;
        let pool = PgPool::connect(&url).await.ok()?;
        sqlx::migrate!().run(&pool).await.ok()?;
        Some(pool)
    }

    fn pricing(id: Uuid) -> PricingInput {
        PricingInput {
            pricing_revision_id: id,
            model_class: "text-test".to_owned(),
            estimate_amount: 10,
            maximum_amount: 10,
            unit_charge: 1,
            user_daily_ceiling: 100,
            guild_daily_ceiling: 100,
        }
    }

    #[tokio::test]
    async fn one_grant_reserves_once_and_dispute_is_not_complete() {
        let Some(pool) = database().await else {
            return;
        };
        let store = AiStore {
            pool,
            application_id: "ai-test".to_owned(),
        };
        let tenant = Uuid::now_v7();
        let now = OffsetDateTime::now_utc();
        let price = Uuid::now_v7();
        store
            .publish_pricing(&pricing(price), now)
            .await
            .expect("price");
        let source = Uuid::now_v7();
        store
            .apply_grant(
                tenant,
                &GrantInput {
                    source_ref: source,
                    credit_minors: 25,
                    expires_at: None,
                },
                now,
            )
            .await
            .expect("grant");
        let again = store
            .apply_grant(
                tenant,
                &GrantInput {
                    source_ref: source,
                    credit_minors: 25,
                    expires_at: None,
                },
                now,
            )
            .await
            .expect("replay");
        assert!(
            store
                .apply_grant(
                    tenant,
                    &GrantInput {
                        source_ref: source,
                        credit_minors: 30,
                        expires_at: None
                    },
                    now
                )
                .await
                .is_err()
        );
        let _ = again;
        let semantic = Uuid::now_v7();
        let input = TextInput {
            operation_id: Uuid::now_v7(),
            semantic_key: semantic,
            actor_id: "42".to_owned(),
            pricing_revision_id: price,
            prompt: "hola".to_owned(),
            script: vec![AttemptClass::ConfirmedResult],
        };
        let first = store
            .run_text(tenant, &input, now, None)
            .await
            .expect("run");
        assert!(first.completed);
        assert_eq!(first.captured, 4);
        assert_eq!(first.reserved, 10);
        let replay = store
            .run_text(tenant, &input, now, None)
            .await
            .expect("replay");
        assert_eq!(replay.operation_id, first.operation_id);
        let attempts: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM ai_execution.attempt WHERE operation_id=$1")
                .bind(first.operation_id)
                .fetch_one(&store.pool)
                .await
                .expect("attempts");
        assert_eq!(attempts, 1);
        let uncertain = TextInput {
            operation_id: Uuid::now_v7(),
            semantic_key: Uuid::now_v7(),
            actor_id: "42".to_owned(),
            pricing_revision_id: price,
            prompt: "espera".to_owned(),
            script: vec![AttemptClass::TimeoutAfterSend],
        };
        let pending = store
            .run_text(tenant, &uncertain, now, None)
            .await
            .expect("uncertain");
        assert!(!pending.completed);
        assert_eq!(pending.reservation_state, "Uncertain");
        assert_eq!(pending.captured, 0);
        store
            .sweep(now + time::Duration::hours(25))
            .await
            .expect("sweep");
        let usage = store.usage(tenant, "42").await.expect("usage");
        let review = usage
            .operations
            .iter()
            .find(|item| item.operation_id == pending.operation_id)
            .expect("row");
        assert_eq!(review.reservation_state, "Disputed");
        assert_eq!(review.operation_state, "Uncertain");
        assert!(!review.completed);
        let closed = store
            .reconcile(
                tenant,
                {
                    let id: Uuid = sqlx::query_scalar(
                        "SELECT reservation_id FROM ai_execution.operation WHERE operation_id=$1",
                    )
                    .bind(pending.operation_id)
                    .fetch_one(&store.pool)
                    .await
                    .expect("reservation");
                    id
                },
                "absence",
                now,
            )
            .await
            .expect("reconcile");
        assert_eq!(closed.reservation_state, "Released");
        let _ = usage;
    }
}
