//! S4 text XP owner store. One revision pins one channel and one award.
//! A message in that channel reserves one append-only ledger decision.

use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use tobot_envelope::{EventEnvelope, validate_progression};
use uuid::Uuid;

use super::messaging::append_fact;
use super::{ProgressionStore, QueryStore};

const ENTRY_COLUMNS: &str = "entry_id,tenant_id,guild_id,member_id,channel_id,message_id,revision_id,delta,balance_after,level_before,level_after,decision";

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct XpRevision {
    pub revision_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub channel_id: String,
    pub award: i32,
    pub revision: i64,
    pub state: String,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct XpEntry {
    pub entry_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub member_id: String,
    pub channel_id: String,
    pub message_id: String,
    pub revision_id: Uuid,
    pub delta: i32,
    pub balance_after: i64,
    pub level_before: i64,
    pub level_after: i64,
    pub decision: String,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct XpStatus {
    pub member_id: String,
    pub balance: i64,
    pub level: i64,
    pub source_message_id: String,
    pub projection_watermark: OffsetDateTime,
}

#[derive(sqlx::FromRow)]
struct PriorAward {
    balance_after: i64,
    level_after: i64,
}

pub struct NewTextMessage<'a> {
    pub tenant_id: Uuid,
    pub guild_id: &'a str,
    pub channel_id: &'a str,
    pub message_id: &'a str,
    pub author_id: &'a str,
    pub author_bot: bool,
    pub webhook: bool,
    pub application_id: &'a str,
}

pub enum XpDecision {
    Ignored,
    Awarded(Box<XpEntry>),
    Skipped(Box<XpEntry>),
}

impl ProgressionStore {
    /// # Errors
    /// Returns a database error, or a protocol error when the payload is not publishable.
    pub async fn publish_progression(
        &self,
        tenant_id: Uuid,
        guild_id: &str,
        channel_id: &str,
        payload: &serde_json::Value,
        application_id: &str,
        now: OffsetDateTime,
    ) -> Result<XpRevision, sqlx::Error> {
        validate_progression(payload).map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
        let award = i32::try_from(
            payload
                .get("award")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0),
        )
        .map_err(|_| sqlx::Error::Protocol("award".to_owned()))?;
        let mut tx = self.pool.begin().await?;
        let guild: Option<String> = sqlx::query_scalar(
            "SELECT provider_tenant_ref FROM installation.tenant WHERE tenant_id = $1 AND state = 'Active' FOR UPDATE",
        )
        .bind(tenant_id)
        .fetch_optional(&mut *tx)
        .await?;
        if guild.as_deref() != Some(guild_id) {
            return Err(sqlx::Error::Protocol("tenant/guild mismatch".to_owned()));
        }
        let policy_id: Uuid = sqlx::query_scalar(
            "INSERT INTO progression.progression_policy (policy_id, tenant_id, guild_id, status) VALUES ($1,$2,$3,'Active') ON CONFLICT (tenant_id) DO UPDATE SET guild_id = EXCLUDED.guild_id RETURNING policy_id",
        )
        .bind(Uuid::now_v7())
        .bind(tenant_id)
        .bind(guild_id)
        .fetch_one(&mut *tx)
        .await?;
        let next: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(revision), 0) + 1 FROM progression.progression_policy_revision WHERE tenant_id = $1",
        )
        .bind(tenant_id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE progression.progression_policy_revision SET state = 'Superseded' WHERE tenant_id = $1 AND state = 'Published'",
        )
        .bind(tenant_id)
        .execute(&mut *tx)
        .await?;
        let revision = XpRevision {
            revision_id: Uuid::now_v7(),
            tenant_id,
            guild_id: guild_id.to_owned(),
            channel_id: channel_id.to_owned(),
            award,
            revision: next,
            state: "Published".to_owned(),
        };
        sqlx::query(
            "INSERT INTO progression.progression_policy_revision (revision_id, policy_id, tenant_id, guild_id, channel_id, award, revision, state, published_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'Published',$8)",
        )
        .bind(revision.revision_id)
        .bind(policy_id)
        .bind(tenant_id)
        .bind(guild_id)
        .bind(channel_id)
        .bind(award)
        .bind(next)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        append_fact(
            &mut tx,
            "progression",
            tenant_id,
            guild_id,
            application_id,
            "ProgressionPolicyPublished",
            serde_json::json!({
                "revision_id": revision.revision_id,
                "revision": next,
                "channel_id": channel_id,
                "award": award
            }),
            now,
        )
        .await?;
        tx.commit().await?;
        Ok(revision)
    }

    /// # Errors
    /// Returns a database error if the published revision cannot be read.
    pub async fn published_progression(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<XpRevision>, sqlx::Error> {
        sqlx::query_as(
            "SELECT revision_id, tenant_id, guild_id, channel_id, award, revision, state FROM progression.progression_policy_revision WHERE tenant_id = $1 AND state = 'Published'",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Records one text decision. No revision, or another channel, writes nothing.
    /// # Errors
    /// Returns a database error when the ledger row cannot be persisted.
    #[allow(clippy::too_many_lines)]
    pub async fn record_message(
        &self,
        message: &NewTextMessage<'_>,
        now: OffsetDateTime,
    ) -> Result<XpDecision, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let revision: Option<XpRevision> = sqlx::query_as(
            "SELECT revision_id, tenant_id, guild_id, channel_id, award, revision, state FROM progression.progression_policy_revision WHERE tenant_id = $1 AND state = 'Published' FOR UPDATE",
        )
        .bind(message.tenant_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(revision) = revision else {
            tx.commit().await?;
            return Ok(XpDecision::Ignored);
        };
        if revision.guild_id != message.guild_id || revision.channel_id != message.channel_id {
            tx.commit().await?;
            return Ok(XpDecision::Ignored);
        }
        let key = format!(
            "{}:{}:{}:{}:{}",
            message.tenant_id,
            message.guild_id,
            message.channel_id,
            message.message_id,
            revision.revision_id
        );
        let prior: Option<PriorAward> = sqlx::query_as(
            "SELECT balance_after, level_after FROM progression.xp_ledger_entry WHERE tenant_id = $1 AND member_id = $2 AND decision = 'Awarded' ORDER BY recorded_at DESC, entry_id DESC LIMIT 1",
        )
        .bind(message.tenant_id)
        .bind(message.author_id)
        .fetch_optional(&mut *tx)
        .await?;
        let balance_before = prior.as_ref().map_or(0, |row| row.balance_after);
        let level_before = prior.as_ref().map_or(0, |row| row.level_after);
        let skipped = message.author_bot || message.webhook;
        let delta = i32::from(!skipped) * revision.award;
        let balance_after = balance_before + i64::from(delta);
        let level_after = if skipped {
            level_before
        } else {
            level_before + 1
        };
        let decision = if skipped { "Skipped" } else { "Awarded" };
        let entry_id = Uuid::now_v7();
        let inserted = sqlx::query(
            "INSERT INTO progression.xp_ledger_entry (entry_id,tenant_id,guild_id,member_id,channel_id,message_id,revision_id,idempotency_key,source_type,delta,balance_after,level_before,level_after,decision,application_id,recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'text',$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (idempotency_key) DO NOTHING",
        )
        .bind(entry_id)
        .bind(message.tenant_id)
        .bind(message.guild_id)
        .bind(message.author_id)
        .bind(message.channel_id)
        .bind(message.message_id)
        .bind(revision.revision_id)
        .bind(&key)
        .bind(delta)
        .bind(balance_after)
        .bind(level_before)
        .bind(level_after)
        .bind(decision)
        .bind(message.application_id)
        .bind(now)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        let entry: XpEntry = sqlx::query_as(&format!(
            "SELECT {ENTRY_COLUMNS} FROM progression.xp_ledger_entry WHERE idempotency_key = $1"
        ))
        .bind(&key)
        .fetch_one(&mut *tx)
        .await?;
        if inserted && entry.decision == "Awarded" {
            let payload = entry_payload(&entry);
            append_fact(
                &mut tx,
                "progression",
                message.tenant_id,
                message.guild_id,
                message.application_id,
                "XpAwardRecorded",
                payload.clone(),
                now,
            )
            .await?;
            if entry.level_after > entry.level_before {
                append_fact(
                    &mut tx,
                    "progression",
                    message.tenant_id,
                    message.guild_id,
                    message.application_id,
                    "LevelChanged",
                    payload,
                    now,
                )
                .await?;
            }
        }
        tx.commit().await?;
        if entry.decision == "Skipped" {
            Ok(XpDecision::Skipped(Box::new(entry)))
        } else {
            Ok(XpDecision::Awarded(Box::new(entry)))
        }
    }
}

fn entry_payload(entry: &XpEntry) -> serde_json::Value {
    serde_json::json!({
        "entry_id": entry.entry_id,
        "member_id": entry.member_id,
        "revision_id": entry.revision_id,
        "message_id": entry.message_id,
        "channel_id": entry.channel_id,
        "delta": entry.delta,
        "balance_after": entry.balance_after,
        "level_before": entry.level_before,
        "level_after": entry.level_after,
        "source_type": "text",
        "decision": entry.decision,
    })
}

impl QueryStore {
    /// # Errors
    /// Returns a database error when the XP fact cannot be projected.
    pub async fn apply_xp_member(
        &self,
        event: &EventEnvelope,
        raw: &[u8],
        stream_position: &str,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let tenant = event
            .tenant_id
            .ok_or_else(|| sqlx::Error::Protocol("missing tenant".to_owned()))?;
        let member_id = event.payload["member_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing member".to_owned()))?;
        let revision_id: Uuid = event.payload["revision_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing revision".to_owned()))?
            .parse()
            .map_err(|error: uuid::Error| sqlx::Error::Protocol(error.to_string()))?;
        let message_id = event.payload["message_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing message".to_owned()))?;
        let balance = event.payload["balance_after"]
            .as_i64()
            .ok_or_else(|| sqlx::Error::Protocol("missing balance".to_owned()))?;
        let level = event.payload["level_after"]
            .as_i64()
            .ok_or_else(|| sqlx::Error::Protocol("missing level".to_owned()))?;
        let occurred_at = OffsetDateTime::parse(&event.occurred_at, &Rfc3339)
            .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query(
            "INSERT INTO query_status.event_inbox (event_id,schema_name,raw_envelope,stream_position,received_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(event.event_id)
        .bind(&event.schema_name)
        .bind(raw)
        .bind(stream_position)
        .bind(now)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        if inserted {
            sqlx::query(
                "INSERT INTO query_status.xp_member (tenant_id,member_id,revision_id,balance,level,source_message_id,source_occurred_at,projection_watermark,last_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id) DO UPDATE SET member_id=EXCLUDED.member_id,revision_id=EXCLUDED.revision_id,balance=EXCLUDED.balance,level=EXCLUDED.level,source_message_id=EXCLUDED.source_message_id,source_occurred_at=EXCLUDED.source_occurred_at,projection_watermark=EXCLUDED.projection_watermark,last_event_id=EXCLUDED.last_event_id WHERE (query_status.xp_member.source_occurred_at, query_status.xp_member.last_event_id) < (EXCLUDED.source_occurred_at, EXCLUDED.last_event_id)",
            )
            .bind(tenant)
            .bind(member_id)
            .bind(revision_id)
            .bind(balance)
            .bind(level)
            .bind(message_id)
            .bind(occurred_at)
            .bind(now)
            .bind(event.event_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await
    }

    /// # Errors
    /// Returns a database error when the projection cannot be read.
    pub async fn xp_member(&self, tenant: Uuid) -> Result<Option<XpStatus>, sqlx::Error> {
        sqlx::query_as(
            "SELECT member_id, balance, level, source_message_id, projection_watermark FROM query_status.xp_member WHERE tenant_id=$1",
        )
        .bind(tenant)
        .fetch_optional(&self.pool)
        .await
    }
}
