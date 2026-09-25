//! S2 lifecycle and delivery owner stores. A join is reserved before a create is claimed.

use sqlx::{Postgres, Transaction};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_envelope::{EventEnvelope, TraceContext, validate_welcome_body};
use uuid::Uuid;

use super::{
    AssignmentStore, ClaimedOutboxEntry, DeliveryIntentStore, LifecycleStore, ProgressionStore,
    QueryStore,
};

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct WelcomeRevision {
    pub revision_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub channel_id: String,
    pub body: String,
    pub revision: i64,
    pub state: String,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct MessageIntent {
    pub intent_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub channel_id: String,
    pub member_id: String,
    pub revision_id: Uuid,
    pub content: String,
    pub nonce: String,
    pub idempotency_key: String,
    pub application_id: String,
    pub status: String,
    pub provider_message_id: Option<String>,
    pub uncertain_at: Option<OffsetDateTime>,
    pub lease_token: Option<Uuid>,
    pub fencing_token: i64,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct WelcomeStatus {
    pub intent_id: Uuid,
    pub status: String,
    pub provider_message_id: Option<String>,
    pub projection_watermark: OffsetDateTime,
}

pub struct NewJoin<'a> {
    pub tenant_id: Uuid,
    pub guild_id: &'a str,
    pub member_id: &'a str,
    pub joined_at: OffsetDateTime,
    pub is_bot: bool,
    pub application_id: &'a str,
}

pub enum JoinDecision {
    Suppressed,
    Requested {
        revision: WelcomeRevision,
        key: String,
    },
}

impl LifecycleStore {
    /// Resolves only an active, installed guild. An event from another guild
    /// cannot create a welcome intent.
    /// # Errors
    /// Returns a database error if installation cannot be read.
    pub async fn installed_tenant_for_guild(
        &self,
        guild_id: &str,
        application_id: &str,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT tenant.tenant_id FROM installation.tenant AS tenant JOIN installation.installation AS i ON i.tenant_id=tenant.tenant_id WHERE tenant.provider_tenant_ref=$1 AND tenant.application_id=$2 AND tenant.state='Active' AND i.state='Installed' AND i.generation=(SELECT max(i2.generation) FROM installation.installation AS i2 WHERE i2.tenant_id=tenant.tenant_id)"
        ).bind(guild_id).bind(application_id).fetch_optional(&self.pool).await
    }

    /// # Errors
    /// Returns a database error or a validation error for an invalid revision.
    pub async fn publish_welcome(
        &self,
        tenant_id: Uuid,
        guild_id: &str,
        channel_id: &str,
        body: &str,
        application_id: &str,
        now: OffsetDateTime,
    ) -> Result<WelcomeRevision, sqlx::Error> {
        validate_welcome_body(body).map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
        if !matches!(channel_id.parse::<u64>(), Ok(1..)) {
            return Err(sqlx::Error::Protocol("invalid channel id".to_owned()));
        }
        let mut tx = self.pool.begin().await?;
        // Serializes revisions even when the first publish has no predecessor.
        let guild: Option<String> = sqlx::query_scalar(
            "SELECT provider_tenant_ref FROM installation.tenant WHERE tenant_id = $1 AND state = 'Active' FOR UPDATE"
        ).bind(tenant_id).fetch_optional(&mut *tx).await?;
        if guild.as_deref() != Some(guild_id) {
            return Err(sqlx::Error::Protocol("tenant/guild mismatch".to_owned()));
        }
        let next: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(revision), 0) + 1 FROM lifecycle.welcome_revision WHERE tenant_id = $1"
        ).bind(tenant_id).fetch_one(&mut *tx).await?;
        sqlx::query("UPDATE lifecycle.welcome_revision SET state = 'Superseded' WHERE tenant_id = $1 AND state = 'Published'")
            .bind(tenant_id).execute(&mut *tx).await?;
        let revision = WelcomeRevision {
            revision_id: Uuid::now_v7(),
            tenant_id,
            guild_id: guild_id.to_owned(),
            channel_id: channel_id.to_owned(),
            body: body.to_owned(),
            revision: next,
            state: "Published".to_owned(),
        };
        sqlx::query(
            "INSERT INTO lifecycle.welcome_revision (revision_id, tenant_id, guild_id, channel_id, body, revision, state, published_at) VALUES ($1,$2,$3,$4,$5,$6,'Published',$7)"
        ).bind(revision.revision_id).bind(tenant_id).bind(guild_id).bind(channel_id)
            .bind(body).bind(next).bind(now).execute(&mut *tx).await?;
        append_fact(
            &mut tx,
            "lifecycle",
            tenant_id,
            guild_id,
            application_id,
            "MessageDefinitionPublished",
            serde_json::json!({
                "revision_id": revision.revision_id, "revision": next,
                "channel_id": channel_id, "body": body
            }),
            now,
        )
        .await?;
        tx.commit().await?;
        Ok(revision)
    }

    /// # Errors
    /// Returns a database error if the published revision cannot be read.
    pub async fn published_welcome(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<WelcomeRevision>, sqlx::Error> {
        sqlx::query_as("SELECT revision_id, tenant_id, guild_id, channel_id, body, revision, state FROM lifecycle.welcome_revision WHERE tenant_id = $1 AND state = 'Published'")
            .bind(tenant_id).fetch_optional(&self.pool).await
    }

    /// Records the join once. A duplicate returns the same requested decision so
    /// intent creation can finish after a crash between the two stores.
    /// # Errors
    /// Returns a database error when reservation or its fact cannot be persisted.
    pub async fn reserve_join(
        &self,
        join: &NewJoin<'_>,
        now: OffsetDateTime,
    ) -> Result<JoinDecision, sqlx::Error> {
        let key = format!(
            "{}:{}:{}:{}",
            join.tenant_id,
            join.guild_id,
            join.member_id,
            join.joined_at
                .format(&Rfc3339)
                .map_err(|e| sqlx::Error::Protocol(e.to_string()))?
        );
        let mut tx = self.pool.begin().await?;
        let revision: Option<WelcomeRevision> = sqlx::query_as(
            "SELECT revision_id, tenant_id, guild_id, channel_id, body, revision, state FROM lifecycle.welcome_revision WHERE tenant_id = $1 AND state = 'Published'"
        ).bind(join.tenant_id).fetch_optional(&mut *tx).await?;
        let reason = if join.is_bot {
            Some("BotJoin")
        } else if revision.is_none() {
            Some("NoPublishedWelcome")
        } else {
            None
        };
        let revision_id = if reason.is_none() {
            revision.as_ref().map(|r| r.revision_id)
        } else {
            None
        };
        let inserted = sqlx::query(
            "INSERT INTO lifecycle.join_decision (decision_id,tenant_id,guild_id,member_id,joined_at,idempotency_key,revision_id,status,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (idempotency_key) DO NOTHING"
        ).bind(Uuid::now_v7()).bind(join.tenant_id).bind(join.guild_id).bind(join.member_id)
            .bind(join.joined_at).bind(&key).bind(revision_id)
            .bind(if reason.is_some() { "Suppressed" } else { "Reserved" })
            .bind(reason).execute(&mut *tx).await?.rows_affected() == 1;
        let existing: (String, Option<Uuid>) = sqlx::query_as(
            "SELECT status, revision_id FROM lifecycle.join_decision WHERE idempotency_key = $1 FOR UPDATE"
        ).bind(&key).fetch_one(&mut *tx).await?;
        let outcome = if existing.0 == "Suppressed" {
            if inserted {
                append_fact(&mut tx, "lifecycle", join.tenant_id, join.guild_id, join.application_id,
                    "LifecycleEventSuppressed", serde_json::json!({"member_id": join.member_id, "reason": reason, "idempotency_key": key}), now).await?;
            }
            JoinDecision::Suppressed
        } else {
            let pinned: WelcomeRevision = sqlx::query_as(
                "SELECT revision_id,tenant_id,guild_id,channel_id,body,revision,state FROM lifecycle.welcome_revision WHERE revision_id = $1"
            ).bind(existing.1.ok_or_else(|| sqlx::Error::Protocol("join lacks revision".to_owned()))?)
                .fetch_one(&mut *tx).await?;
            if inserted {
                append_fact(&mut tx, "lifecycle", join.tenant_id, join.guild_id, join.application_id,
                    "LifecycleDecisionCreated", serde_json::json!({"member_id": join.member_id, "revision_id": pinned.revision_id, "idempotency_key": key}), now).await?;
                append_fact(
                    &mut tx,
                    "lifecycle",
                    join.tenant_id,
                    join.guild_id,
                    join.application_id,
                    "LifecycleEventSuppressed",
                    serde_json::json!({"member_id": join.member_id,
                        "destination":"DM", "reason":"NoDmPolicy", "idempotency_key":key}),
                    now,
                )
                .await?;
            }
            JoinDecision::Requested {
                revision: pinned,
                key,
            }
        };
        tx.commit().await?;
        Ok(outcome)
    }

    /// # Errors
    /// Returns a database error when a requested decision cannot be committed.
    pub async fn mark_requested(
        &self,
        tenant_id: Uuid,
        guild_id: &str,
        key: &str,
        intent_id: Uuid,
        application_id: &str,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let changed = sqlx::query("UPDATE lifecycle.join_decision SET status = 'Requested' WHERE idempotency_key = $1 AND tenant_id = $2 AND status = 'Reserved'")
            .bind(key).bind(tenant_id).execute(&mut *tx).await?.rows_affected() == 1;
        if changed {
            append_fact(
                &mut tx,
                "lifecycle",
                tenant_id,
                guild_id,
                application_id,
                "LifecycleDeliveryRequested",
                serde_json::json!({"intent_id": intent_id, "idempotency_key": key}),
                now,
            )
            .await?;
        }
        tx.commit().await
    }
}

impl DeliveryIntentStore {
    /// Inserts exactly one intent per join key. The pinned revision is immutable.
    /// # Errors
    /// Returns a database error when the intent cannot be written.
    pub async fn create_intent(
        &self,
        revision: &WelcomeRevision,
        member_id: &str,
        key: &str,
        application_id: &str,
        now: OffsetDateTime,
    ) -> Result<MessageIntent, sqlx::Error> {
        let content = revision
            .body
            .replace("{member}", &format!("<@{member_id}>"));
        let mut tx = self.pool.begin().await?;
        let intent_id = Uuid::now_v7();
        let nonce = u64::from_be_bytes(
            intent_id.as_bytes()[..8]
                .try_into()
                .map_err(|_| sqlx::Error::Protocol("invalid nonce bytes".to_owned()))?,
        )
        .to_string();
        let inserted = sqlx::query(
            "INSERT INTO delivery.message_intent (intent_id,tenant_id,guild_id,channel_id,member_id,revision_id,content,nonce,idempotency_key,application_id,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11,$11) ON CONFLICT (idempotency_key) DO NOTHING"
        ).bind(intent_id).bind(revision.tenant_id).bind(&revision.guild_id).bind(&revision.channel_id)
            .bind(member_id).bind(revision.revision_id).bind(content).bind(nonce).bind(key)
            .bind(application_id).bind(now).execute(&mut *tx).await?.rows_affected() == 1;
        let record: MessageIntent = sqlx::query_as(&format!(
            "SELECT {INTENT_COLUMNS} FROM delivery.message_intent WHERE idempotency_key = $1"
        ))
        .bind(key)
        .fetch_one(&mut *tx)
        .await?;
        if inserted {
            append_fact(
                &mut tx,
                "delivery",
                record.tenant_id,
                &record.guild_id,
                application_id,
                "DeliveryQueued",
                intent_payload(&record),
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(record)
    }

    /// Claims one pending or expired claim. A transmitted create is never claimed for a second POST.
    /// # Errors
    /// Returns a database error if claiming fails.
    pub async fn claim_next(
        &self,
        now: OffsetDateTime,
    ) -> Result<Option<MessageIntent>, sqlx::Error> {
        self.claim(now, None).await
    }

    /// Rotates away from the tenant served last when another tenant has due work.
    /// # Errors
    /// Returns a database error if the claim fails.
    pub async fn claim_next_after(
        &self,
        now: OffsetDateTime,
        last_tenant: Option<Uuid>,
    ) -> Result<Option<MessageIntent>, sqlx::Error> {
        self.claim(now, last_tenant).await
    }

    async fn claim(
        &self,
        now: OffsetDateTime,
        last_tenant: Option<Uuid>,
    ) -> Result<Option<MessageIntent>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let candidate: Option<Uuid> = sqlx::query_scalar(
            "SELECT intent_id FROM delivery.message_intent WHERE status = 'Pending' OR (status = 'Claimed' AND lease_expires_at < $1) ORDER BY CASE WHEN tenant_id=$2::uuid THEN 1 ELSE 0 END, created_at, intent_id FOR UPDATE SKIP LOCKED LIMIT 1"
        ).bind(now).bind(last_tenant).fetch_optional(&mut *tx).await?;
        let Some(intent_id) = candidate else {
            tx.commit().await?;
            return Ok(None);
        };
        let lease = Uuid::now_v7();
        let record: MessageIntent = sqlx::query_as(&format!(
            "UPDATE delivery.message_intent SET status='Claimed', lease_token=$2, lease_expires_at=$3, fencing_token=fencing_token+1, updated_at=$4 WHERE intent_id=$1 RETURNING {INTENT_COLUMNS}"
        )).bind(intent_id).bind(lease).bind(now + time::Duration::seconds(30)).bind(now)
            .fetch_one(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO delivery.message_attempt (attempt_id,intent_id,lease_token,fencing_token,result_class,started_at,updated_at) VALUES ($1,$2,$3,$4,'Claimed',$5,$5)"
        ).bind(Uuid::now_v7()).bind(intent_id).bind(lease).bind(record.fencing_token)
            .bind(now).execute(&mut *tx).await?;
        append_fact(
            &mut tx,
            "delivery",
            record.tenant_id,
            &record.guild_id,
            &record.application_id,
            "DeliveryAttempted",
            intent_payload(&record),
            now,
        )
        .await?;
        tx.commit().await?;
        Ok(Some(record))
    }

    /// # Errors
    /// Returns a database error if a typed dispatch request cannot inspect its intent.
    pub async fn status_by_id(&self, intent_id: Uuid) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT status FROM delivery.message_intent WHERE intent_id=$1")
            .bind(intent_id)
            .fetch_optional(&self.pool)
            .await
    }

    /// Marks the request transmitted before sending bytes. Recovery reconciles this
    /// row by nonce, including when the process dies immediately after this write.
    /// # Errors
    /// Returns a database error if the fenced transition fails.
    pub async fn mark_sending(
        &self,
        intent: &MessageIntent,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let changed = sqlx::query(
            "UPDATE delivery.message_intent SET status='Sending', updated_at=$4 WHERE intent_id=$1 AND lease_token=$2 AND fencing_token=$3 AND status='Claimed'"
        ).bind(intent.intent_id).bind(intent.lease_token).bind(intent.fencing_token).bind(now)
            .execute(&self.pool).await?.rows_affected() == 1;
        if changed {
            sqlx::query("UPDATE delivery.message_attempt SET result_class='Transmitted', updated_at=$3 WHERE intent_id=$1 AND fencing_token=$2")
                .bind(intent.intent_id).bind(intent.fencing_token).bind(now).execute(&self.pool).await?;
        }
        Ok(changed)
    }

    /// Terminal outcomes and uncertainty only move from a live sending attempt.
    /// # Errors
    /// Returns a database error when the transition or its fact fails.
    pub async fn finish(
        &self,
        intent: &MessageIntent,
        status: &str,
        message_id: Option<&str>,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let fact = match status {
            "Sent" => "DeliverySucceeded",
            "Blocked" => "DeliveryBlocked",
            "OutcomeUncertain" => "DeliveryOutcomeUncertain",
            "DeadLetter" => "DeliveryDeadLettered",
            _ => return Err(sqlx::Error::Protocol("invalid delivery status".to_owned())),
        };
        let mut tx = self.pool.begin().await?;
        let changed = sqlx::query(
            "UPDATE delivery.message_intent SET status=$4,provider_message_id=$5,uncertain_at=CASE WHEN $4='OutcomeUncertain' THEN $6 ELSE uncertain_at END,updated_at=$6,lease_token=NULL,lease_expires_at=NULL WHERE intent_id=$1 AND fencing_token=$2 AND (lease_token=$3 OR ($3::uuid IS NULL AND status IN ('Sending','OutcomeUncertain'))) AND status IN ('Sending','OutcomeUncertain')"
        ).bind(intent.intent_id).bind(intent.fencing_token).bind(intent.lease_token)
            .bind(status).bind(message_id).bind(now).execute(&mut *tx).await?.rows_affected() == 1;
        if changed {
            let result = match status {
                "Sent" => "Confirmed",
                "Blocked" => "Blocked",
                "OutcomeUncertain" => "Uncertain",
                _ => "DeadLetter",
            };
            sqlx::query("UPDATE delivery.message_attempt SET result_class=$3,updated_at=$4 WHERE intent_id=$1 AND fencing_token=$2")
                .bind(intent.intent_id).bind(intent.fencing_token).bind(result).bind(now)
                .execute(&mut *tx).await?;
            let mut payload = intent_payload(intent);
            payload["status"] = serde_json::json!(status);
            payload["provider_message_id"] = serde_json::json!(message_id);
            append_fact(
                &mut tx,
                "delivery",
                intent.tenant_id,
                &intent.guild_id,
                &intent.application_id,
                fact,
                payload,
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(changed)
    }

    /// # Errors
    /// Returns a database error if uncertain rows cannot be read.
    pub async fn needing_reconciliation(
        &self,
        now: OffsetDateTime,
    ) -> Result<Vec<MessageIntent>, sqlx::Error> {
        sqlx::query_as(&format!(
            "SELECT {INTENT_COLUMNS} FROM delivery.message_intent WHERE status='OutcomeUncertain' OR (status='Sending' AND updated_at < $1) ORDER BY updated_at LIMIT 50"
        )).bind(now - time::Duration::seconds(2)).fetch_all(&self.pool).await
    }

    /// # Errors
    /// Returns a database error if a nonce cannot be looked up.
    pub async fn by_nonce(&self, nonce: &str) -> Result<Option<MessageIntent>, sqlx::Error> {
        sqlx::query_as(&format!(
            "SELECT {INTENT_COLUMNS} FROM delivery.message_intent WHERE nonce=$1"
        ))
        .bind(nonce)
        .fetch_optional(&self.pool)
        .await
    }

    /// Discord's 429 is explicit refusal; this attempt may safely wait and retry.
    /// # Errors
    /// Returns a database error if the fenced release fails.
    pub async fn release_rate_limited(
        &self,
        intent: &MessageIntent,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE delivery.message_intent SET status='Pending',lease_token=NULL,lease_expires_at=NULL,updated_at=$4 WHERE intent_id=$1 AND lease_token=$2 AND fencing_token=$3 AND status='Sending'")
            .bind(intent.intent_id).bind(intent.lease_token).bind(intent.fencing_token).bind(now)
            .execute(&self.pool).await?;
        Ok(())
    }
}

const INTENT_COLUMNS: &str = "intent_id,tenant_id,guild_id,channel_id,member_id,revision_id,content,nonce,idempotency_key,application_id,status,provider_message_id,uncertain_at,lease_token,fencing_token";

fn intent_payload(intent: &MessageIntent) -> serde_json::Value {
    serde_json::json!({"intent_id":intent.intent_id,"revision_id":intent.revision_id,
        "member_id":intent.member_id,"channel_id":intent.channel_id,"status":intent.status})
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn append_fact(
    tx: &mut Transaction<'_, Postgres>,
    schema: &str,
    tenant_id: Uuid,
    guild_id: &str,
    application_id: &str,
    name: &str,
    payload: serde_json::Value,
    now: OffsetDateTime,
) -> Result<(), sqlx::Error> {
    let timestamp = now
        .format(&Rfc3339)
        .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    let event_id = Uuid::now_v7();
    let event = EventEnvelope {
        event_id,
        schema_name: name.to_owned(),
        schema_version: 1,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id: application_id.to_owned(),
        tenant_id: Some(tenant_id),
        guild_id: Some(guild_id.to_owned()),
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id: event_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: event_id.to_string(),
            span_id: event_id.to_string(),
        },
        payload,
    };
    let raw = serde_json::to_vec(&event).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    // Schema is selected only by the two private callers above.
    let table = match schema {
        "lifecycle" => "lifecycle.event_outbox",
        "delivery" => "delivery.event_outbox",
        "assignment" => "assignment.event_outbox",
        "progression" => "progression.event_outbox",
        "support" => "support.event_outbox",
        _ => return Err(sqlx::Error::Protocol("invalid outbox".to_owned())),
    };
    sqlx::query(&format!("INSERT INTO {table} (outbox_id,tenant_id,event_id,topic,partition_key,envelope) VALUES ($1,$2,$3,$4,$5,$6)"))
        .bind(Uuid::now_v7()).bind(tenant_id).bind(event_id).bind(name)
        .bind(tenant_id.to_string()).bind(raw).execute(&mut **tx).await?;
    Ok(())
}

/// The selected owner outbox is claimed with a lease before Redis publication.
pub enum MessagingOutbox {
    Lifecycle(LifecycleStore),
    Delivery(DeliveryIntentStore),
    Assignment(AssignmentStore),
    Progression(ProgressionStore),
    Support(super::SupportStore),
}

impl MessagingOutbox {
    fn table(&self) -> &'static str {
        match self {
            Self::Lifecycle(_) => "lifecycle.event_outbox",
            Self::Delivery(_) => "delivery.event_outbox",
            Self::Assignment(_) => "assignment.event_outbox",
            Self::Progression(_) => "progression.event_outbox",
            Self::Support(_) => "support.event_outbox",
        }
    }
    fn pool(&self) -> &sqlx::PgPool {
        match self {
            Self::Lifecycle(store) => &store.pool,
            Self::Delivery(store) => &store.pool,
            Self::Assignment(store) => &store.pool,
            Self::Progression(store) => &store.pool,
            Self::Support(store) => &store.pool,
        }
    }
    /// # Errors
    /// Returns a database error when the outbox cannot be claimed.
    pub async fn claim(
        &self,
        now: OffsetDateTime,
        token: Uuid,
    ) -> Result<Vec<ClaimedOutboxEntry>, sqlx::Error> {
        let sql = format!(
            "WITH due AS (SELECT outbox_id FROM {} WHERE published_at IS NULL AND (lease_expires_at IS NULL OR lease_expires_at < $1) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 100) UPDATE {} AS outbox SET lease_token=$2,lease_expires_at=$3,fencing_token=fencing_token+1,publish_attempts=publish_attempts+1 FROM due WHERE outbox.outbox_id=due.outbox_id RETURNING outbox.outbox_id,outbox.event_id,outbox.envelope,outbox.fencing_token",
            self.table(),
            self.table()
        );
        sqlx::query_as(&sql)
            .bind(now)
            .bind(token)
            .bind(now + time::Duration::seconds(30))
            .fetch_all(self.pool())
            .await
    }
    /// # Errors
    /// Returns a database error when publication cannot be marked.
    pub async fn published(
        &self,
        entry: &ClaimedOutboxEntry,
        token: Uuid,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(&format!("UPDATE {} SET published_at=$4,lease_token=NULL,lease_expires_at=NULL WHERE outbox_id=$1 AND lease_token=$2 AND fencing_token=$3", self.table()))
            .bind(entry.outbox_id).bind(token).bind(entry.fencing_token).bind(now)
            .execute(self.pool()).await?;
        Ok(())
    }
}

impl QueryStore {
    /// # Errors
    /// Returns a database error for an invalid or unpersistable delivery fact.
    pub async fn apply_welcome_delivery(
        &self,
        event: &EventEnvelope,
        raw: &[u8],
        stream_position: &str,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let tenant = event
            .tenant_id
            .ok_or_else(|| sqlx::Error::Protocol("missing tenant".to_owned()))?;
        let intent: Uuid = event.payload["intent_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing intent".to_owned()))?
            .parse()
            .map_err(|e: uuid::Error| sqlx::Error::Protocol(e.to_string()))?;
        let status = event.payload["status"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing status".to_owned()))?;
        let message_id = event.payload["provider_message_id"].as_str();
        let occurred_at = OffsetDateTime::parse(&event.occurred_at, &Rfc3339)
            .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query(
            "INSERT INTO query_status.event_inbox (event_id,schema_name,raw_envelope,stream_position,received_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING"
        ).bind(event.event_id).bind(&event.schema_name).bind(raw).bind(stream_position).bind(now)
            .execute(&mut *tx).await?.rows_affected() == 1;
        if inserted {
            sqlx::query(
                "INSERT INTO query_status.welcome_delivery (tenant_id,intent_id,status,provider_message_id,source_occurred_at,projection_watermark,last_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id) DO UPDATE SET intent_id=EXCLUDED.intent_id,status=EXCLUDED.status,provider_message_id=EXCLUDED.provider_message_id,source_occurred_at=EXCLUDED.source_occurred_at,projection_watermark=EXCLUDED.projection_watermark,last_event_id=EXCLUDED.last_event_id WHERE (query_status.welcome_delivery.source_occurred_at,query_status.welcome_delivery.last_event_id) < (EXCLUDED.source_occurred_at,EXCLUDED.last_event_id)"
            ).bind(tenant).bind(intent).bind(status).bind(message_id).bind(occurred_at).bind(now).bind(event.event_id)
                .execute(&mut *tx).await?;
        }
        tx.commit().await
    }
    /// # Errors
    /// Returns a database error when the projection cannot be read.
    pub async fn welcome_delivery(
        &self,
        tenant: Uuid,
    ) -> Result<Option<WelcomeStatus>, sqlx::Error> {
        sqlx::query_as("SELECT intent_id,status,provider_message_id,projection_watermark FROM query_status.welcome_delivery WHERE tenant_id=$1")
            .bind(tenant).fetch_optional(&self.pool).await
    }
}
