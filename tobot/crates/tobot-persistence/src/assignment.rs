//! S3 automatic-role owner store. One revision pins one role. A join reserves one intent.

use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_envelope::{EventEnvelope, validate_automatic_role};
use uuid::Uuid;

use super::messaging::append_fact;
use super::{AssignmentStore, QueryStore};

const INTENT_COLUMNS: &str = "intent_id,tenant_id,guild_id,member_id,role_id,revision_id,idempotency_key,status,reason,joined_at,deadline_at,put_count,application_id,lease_token,fencing_token";

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct RoleRevision {
    pub revision_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub role_id: String,
    pub revision: i64,
    pub state: String,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct RoleIntent {
    pub intent_id: Uuid,
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub member_id: String,
    pub role_id: String,
    pub revision_id: Uuid,
    pub idempotency_key: String,
    pub status: String,
    pub reason: Option<String>,
    pub joined_at: OffsetDateTime,
    pub deadline_at: OffsetDateTime,
    pub put_count: i32,
    pub application_id: String,
    pub lease_token: Option<Uuid>,
    pub fencing_token: i64,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct RoleStatus {
    pub intent_id: Uuid,
    pub role_id: String,
    pub member_id: String,
    pub status: String,
    pub projection_watermark: OffsetDateTime,
}

pub struct NewRoleJoin<'a> {
    pub tenant_id: Uuid,
    pub guild_id: &'a str,
    pub member_id: &'a str,
    pub joined_at: OffsetDateTime,
    pub joined_at_token: &'a str,
    pub is_bot: bool,
    pub application_id: &'a str,
}

pub enum RoleJoin {
    Ignored,
    Skipped { intent_id: Uuid },
    Planned { intent: Box<RoleIntent> },
}

impl AssignmentStore {
    /// # Errors
    /// Returns a database error, or a protocol error when the role payload is not publishable.
    pub async fn publish_role(
        &self,
        tenant_id: Uuid,
        guild_id: &str,
        role_id: &str,
        payload: &serde_json::Value,
        application_id: &str,
        now: OffsetDateTime,
    ) -> Result<RoleRevision, sqlx::Error> {
        validate_automatic_role(payload)
            .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
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
            "INSERT INTO assignment.role_policy (policy_id, tenant_id, guild_id, status) VALUES ($1,$2,$3,'Active') ON CONFLICT (tenant_id) DO UPDATE SET guild_id = EXCLUDED.guild_id RETURNING policy_id",
        )
        .bind(Uuid::now_v7())
        .bind(tenant_id)
        .bind(guild_id)
        .fetch_one(&mut *tx)
        .await?;
        let next: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(revision), 0) + 1 FROM assignment.role_policy_revision WHERE tenant_id = $1",
        )
        .bind(tenant_id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("UPDATE assignment.role_policy_revision SET state = 'Superseded' WHERE tenant_id = $1 AND state = 'Published'")
            .bind(tenant_id)
            .execute(&mut *tx)
            .await?;
        let revision = RoleRevision {
            revision_id: Uuid::now_v7(),
            tenant_id,
            guild_id: guild_id.to_owned(),
            role_id: role_id.to_owned(),
            revision: next,
            state: "Published".to_owned(),
        };
        sqlx::query(
            "INSERT INTO assignment.role_policy_revision (revision_id, policy_id, tenant_id, guild_id, role_id, revision, state, published_at) VALUES ($1,$2,$3,$4,$5,$6,'Published',$7)",
        )
        .bind(revision.revision_id)
        .bind(policy_id)
        .bind(tenant_id)
        .bind(guild_id)
        .bind(role_id)
        .bind(next)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        append_fact(
            &mut tx,
            "assignment",
            tenant_id,
            guild_id,
            application_id,
            "RolePolicyPublished",
            serde_json::json!({"revision_id": revision.revision_id, "revision": next, "role_id": role_id}),
            now,
        )
        .await?;
        tx.commit().await?;
        Ok(revision)
    }

    /// # Errors
    /// Returns a database error if the published revision cannot be read.
    pub async fn published_role(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<RoleRevision>, sqlx::Error> {
        sqlx::query_as(
            "SELECT revision_id, tenant_id, guild_id, role_id, revision, state FROM assignment.role_policy_revision WHERE tenant_id = $1 AND state = 'Published'",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Reserves one join. No published revision writes nothing.
    /// # Errors
    /// Returns a database error when the reservation cannot be persisted.
    pub async fn reserve_join(
        &self,
        join: &NewRoleJoin<'_>,
        now: OffsetDateTime,
    ) -> Result<RoleJoin, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let revision: Option<RoleRevision> = sqlx::query_as(
            "SELECT revision_id, tenant_id, guild_id, role_id, revision, state FROM assignment.role_policy_revision WHERE tenant_id = $1 AND state = 'Published'",
        )
        .bind(join.tenant_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(revision) = revision else {
            tx.commit().await?;
            return Ok(RoleJoin::Ignored);
        };
        let key = format!(
            "{}:{}:{}:{}:{}:{}",
            join.tenant_id,
            join.guild_id,
            join.member_id,
            revision.role_id,
            revision.revision_id,
            join.joined_at_token
        );
        let outranked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM assignment.role_relation_claim WHERE tenant_id=$1 AND guild_id=$2 AND member_id=$3 AND role_id=$4 AND source IN ('cases','security') AND status='Active')",
        )
        .bind(join.tenant_id)
        .bind(join.guild_id)
        .bind(join.member_id)
        .bind(&revision.role_id)
        .fetch_one(&mut *tx)
        .await?;
        let (status, reason) = if join.is_bot {
            ("Skipped", Some("BotJoin"))
        } else if outranked {
            ("Skipped", Some("CasesOwnership"))
        } else {
            ("Pending", None)
        };
        let intent_id = Uuid::now_v7();
        let deadline = join.joined_at + time::Duration::seconds(60);
        let inserted = sqlx::query(
            "INSERT INTO assignment.role_assignment_intent (intent_id,tenant_id,guild_id,member_id,role_id,revision_id,idempotency_key,status,reason,joined_at,deadline_at,application_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) ON CONFLICT (idempotency_key) DO NOTHING",
        )
        .bind(intent_id)
        .bind(join.tenant_id)
        .bind(join.guild_id)
        .bind(join.member_id)
        .bind(&revision.role_id)
        .bind(revision.revision_id)
        .bind(&key)
        .bind(status)
        .bind(reason)
        .bind(join.joined_at)
        .bind(deadline)
        .bind(join.application_id)
        .bind(now)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        let intent: RoleIntent = sqlx::query_as(&format!(
            "SELECT {INTENT_COLUMNS} FROM assignment.role_assignment_intent WHERE idempotency_key = $1"
        ))
        .bind(&key)
        .fetch_one(&mut *tx)
        .await?;
        if inserted {
            let fact = if intent.status == "Skipped" {
                "RoleAssignmentSkipped"
            } else {
                "RoleAssignmentPlanned"
            };
            append_fact(
                &mut tx,
                "assignment",
                join.tenant_id,
                join.guild_id,
                join.application_id,
                fact,
                intent_payload(&intent),
                now,
            )
            .await?;
        }
        tx.commit().await?;
        if intent.status == "Skipped" {
            Ok(RoleJoin::Skipped {
                intent_id: intent.intent_id,
            })
        } else {
            Ok(RoleJoin::Planned {
                intent: Box::new(intent),
            })
        }
    }

    /// # Errors
    /// Returns a database error if the claim fails.
    pub async fn claim_next(&self, now: OffsetDateTime) -> Result<Option<RoleIntent>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let candidate: Option<Uuid> = sqlx::query_scalar(
            "SELECT intent_id FROM assignment.role_assignment_intent WHERE status = 'Pending' OR (status IN ('Claimed','Applying','OutcomeUncertain') AND (lease_expires_at IS NULL OR lease_expires_at < $1)) ORDER BY created_at, intent_id FOR UPDATE SKIP LOCKED LIMIT 1",
        )
        .bind(now)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(intent_id) = candidate else {
            tx.commit().await?;
            return Ok(None);
        };
        let lease = Uuid::now_v7();
        let intent: RoleIntent = sqlx::query_as(&format!(
            "UPDATE assignment.role_assignment_intent SET status='Claimed', lease_token=$2, lease_expires_at=$3, fencing_token=fencing_token+1, updated_at=$4 WHERE intent_id=$1 RETURNING {INTENT_COLUMNS}"
        ))
        .bind(intent_id)
        .bind(lease)
        .bind(now + time::Duration::seconds(15))
        .bind(now)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO assignment.role_assignment_attempt (attempt_id,intent_id,lease_token,fencing_token,result_class,started_at) VALUES ($1,$2,$3,$4,'Claimed',$5)",
        )
        .bind(Uuid::now_v7())
        .bind(intent_id)
        .bind(lease)
        .bind(intent.fencing_token)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some(intent))
    }

    /// Records that a PUT is about to be sent. A stale fence does not increment `put_count`.
    /// # Errors
    /// Returns a database error if the attempt cannot be recorded.
    pub async fn mark_transmitted(
        &self,
        intent: &RoleIntent,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let updated: Option<i32> = sqlx::query_scalar(
            "UPDATE assignment.role_assignment_intent SET status='Applying', put_count=put_count+1, updated_at=$4 WHERE intent_id=$1 AND fencing_token=$2 AND lease_token=$3 AND status IN ('Claimed','Applying','OutcomeUncertain') AND put_count < 2 AND NOT EXISTS (SELECT 1 FROM assignment.role_assignment_attempt AS attempt WHERE attempt.intent_id=$1 AND attempt.fencing_token=$2 AND attempt.result_class='Transmitted') RETURNING put_count",
        )
        .bind(intent.intent_id)
        .bind(intent.fencing_token)
        .bind(intent.lease_token)
        .bind(now)
        .fetch_optional(&mut *tx)
        .await?;
        if updated.is_some() {
            sqlx::query(
                "INSERT INTO assignment.role_assignment_attempt (attempt_id,intent_id,lease_token,fencing_token,result_class,started_at) VALUES ($1,$2,$3,$4,'Transmitted',$5) ON CONFLICT DO NOTHING",
            )
            .bind(Uuid::now_v7())
            .bind(intent.intent_id)
            .bind(intent.lease_token)
            .bind(intent.fencing_token)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(updated.is_some())
    }

    /// # Errors
    /// Returns a database error if the fence cannot be extended.
    pub async fn defer_lease(
        &self,
        intent: &RoleIntent,
        until: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let changed = sqlx::query(
            "UPDATE assignment.role_assignment_intent SET lease_expires_at=$4, updated_at=$4 WHERE intent_id=$1 AND fencing_token=$2 AND lease_token=$3 AND status='Claimed'",
        )
        .bind(intent.intent_id)
        .bind(intent.fencing_token)
        .bind(intent.lease_token)
        .bind(until)
        .execute(&self.pool)
        .await?
        .rows_affected()
            == 1;
        Ok(changed)
    }

    /// Finishes an intent once. Applied records the automatic ownership claim and does not remove any other claim.
    /// # Errors
    /// Returns a database error, or a protocol error for an unknown status.
    pub async fn finish(
        &self,
        intent: &RoleIntent,
        status: &str,
        reason: &str,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let fact = match status {
            "Applied" => "RoleAssignmentApplied",
            "Unchanged" => "RoleAssignmentUnchanged",
            "Skipped" => "RoleAssignmentSkipped",
            "Failed" => "RoleAssignmentFailed",
            "OutcomeUncertain" => "",
            _ => {
                return Err(sqlx::Error::Protocol(
                    "unknown assignment status".to_owned(),
                ));
            }
        };
        let mut tx = self.pool.begin().await?;
        let changed = sqlx::query(
            "UPDATE assignment.role_assignment_intent SET status=$4, reason=$5, updated_at=$6 WHERE intent_id=$1 AND fencing_token=$2 AND lease_token=$3 AND status IN ('Claimed','Applying','OutcomeUncertain')",
        )
        .bind(intent.intent_id)
        .bind(intent.fencing_token)
        .bind(intent.lease_token)
        .bind(status)
        .bind(reason)
        .bind(now)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        if !changed {
            tx.commit().await?;
            return Ok(false);
        }
        if status == "Applied" {
            sqlx::query(
                "INSERT INTO assignment.role_relation_claim (claim_id,tenant_id,guild_id,member_id,role_id,source,status) VALUES ($1,$2,$3,$4,$5,'automatic','Active') ON CONFLICT DO NOTHING",
            )
            .bind(Uuid::now_v7())
            .bind(intent.tenant_id)
            .bind(&intent.guild_id)
            .bind(&intent.member_id)
            .bind(&intent.role_id)
            .execute(&mut *tx)
            .await?;
        }
        if !fact.is_empty() {
            let mut payload = intent_payload(intent);
            payload["status"] = serde_json::json!(status);
            payload["reason"] = serde_json::json!(reason);
            append_fact(
                &mut tx,
                "assignment",
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
        Ok(true)
    }
}

fn intent_payload(intent: &RoleIntent) -> serde_json::Value {
    serde_json::json!({
        "intent_id": intent.intent_id,
        "status": intent.status,
        "role_id": intent.role_id,
        "member_id": intent.member_id,
        "put_count": intent.put_count,
    })
}

impl QueryStore {
    /// # Errors
    /// Returns a database error when the assignment fact cannot be projected.
    pub async fn apply_role_assignment(
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
            .map_err(|error: uuid::Error| sqlx::Error::Protocol(error.to_string()))?;
        let status = event.payload["status"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing status".to_owned()))?;
        let role_id = event.payload["role_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing role".to_owned()))?;
        let member_id = event.payload["member_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing member".to_owned()))?;
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
                "INSERT INTO query_status.role_assignment (tenant_id,intent_id,role_id,member_id,status,source_occurred_at,projection_watermark,last_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id) DO UPDATE SET intent_id=EXCLUDED.intent_id,role_id=EXCLUDED.role_id,member_id=EXCLUDED.member_id,status=EXCLUDED.status,source_occurred_at=EXCLUDED.source_occurred_at,projection_watermark=EXCLUDED.projection_watermark,last_event_id=EXCLUDED.last_event_id WHERE (query_status.role_assignment.source_occurred_at, query_status.role_assignment.last_event_id) < (EXCLUDED.source_occurred_at, EXCLUDED.last_event_id)",
            )
            .bind(tenant)
            .bind(intent)
            .bind(role_id)
            .bind(member_id)
            .bind(status)
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
    pub async fn role_assignment(&self, tenant: Uuid) -> Result<Option<RoleStatus>, sqlx::Error> {
        sqlx::query_as(
            "SELECT intent_id, role_id, member_id, status, projection_watermark FROM query_status.role_assignment WHERE tenant_id=$1",
        )
        .bind(tenant)
        .fetch_optional(&self.pool)
        .await
    }
}
