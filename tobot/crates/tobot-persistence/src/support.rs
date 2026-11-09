//! Dueño de soporte S5. Una revisión se publica solo al vincular su mensaje de Discord.

use sqlx::Row;
use time::OffsetDateTime;
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

use super::messaging::append_fact;
use super::{QueryStore, SupportStore};
use crate::{CatalogBenefit, DefaultPlan};

#[derive(Clone, Debug, sqlx::FromRow, serde::Serialize)]
pub struct SupportPanel {
    pub revision_id: Uuid,
    pub template_revision_id: Uuid,
    pub revision: i64,
    pub channel_id: String,
    pub button_label: String,
    pub state: String,
    pub nonce: String,
    pub message_id: Option<String>,
    pub custom_id: Option<String>,
}

#[derive(Clone, Debug, sqlx::FromRow, serde::Serialize)]
pub struct SupportCase {
    pub case_id: Uuid,
    pub tenant_id: Uuid,
    pub member_id: String,
    pub support_number: i64,
    pub state: String,
    pub version: i64,
    pub template_revision_id: Uuid,
    pub panel_revision_id: Uuid,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct SupportTicketStatus {
    pub case_id: Uuid,
    pub tenant_id: Uuid,
    pub member_id: String,
    pub support_number: i64,
    pub state: String,
    pub version: i64,
    pub projection_watermark: OffsetDateTime,
}

pub struct SupportClick<'a> {
    pub tenant_id: Uuid,
    pub guild_id: &'a str,
    pub application_id: &'a str,
    pub channel_id: &'a str,
    pub message_id: &'a str,
    pub custom_id: &'a str,
    pub interaction_id: &'a str,
    pub member_id: &'a str,
}

pub enum SupportDecision {
    Opened(SupportCase),
    AlreadyOpen(SupportCase),
    AtCapacity,
    NotIncluded,
    UnknownButton,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TicketRule {
    Open,
    Cap(i64),
    Closed,
}

/// La proyección de pago manda. Sin ella, manda el plan free.
async fn current_ticket_rule(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant: Uuid,
) -> Result<TicketRule, sqlx::Error> {
    let paid_benefits: Option<serde_json::Value> = sqlx::query_scalar("SELECT benefits FROM platform_entitlement.projection WHERE tenant_id=$1 AND state IN ('Active','Grace') AND (valid_until IS NULL OR valid_until>now())")
        .bind(tenant).fetch_optional(&mut **tx).await?;
    let paid = paid_benefits
        .map(serde_json::from_value::<Vec<CatalogBenefit>>)
        .transpose()
        .map_err(|error| sqlx::Error::Decode(Box::new(error)))?;
    let free_row = sqlx::query("SELECT enabled, support_open, ticket_quantity FROM commercial_catalog.default_plan WHERE plan_key='free'")
        .fetch_optional(&mut **tx).await?;
    let free = match free_row {
        Some(row) => DefaultPlan {
            enabled: row.try_get("enabled")?,
            support_open: row.try_get("support_open")?,
            ticket_quantity: row.try_get("ticket_quantity")?,
        },
        None => DefaultPlan::open(),
    };
    Ok(ticket_rule(paid.as_deref(), &free))
}

pub fn ticket_rule(paid: Option<&[CatalogBenefit]>, free: &DefaultPlan) -> TicketRule {
    if let Some(benefits) = paid {
        if benefits.iter().any(
            |benefit| matches!(benefit, CatalogBenefit::Feature { key } if key == "support.closed"),
        ) {
            return TicketRule::Closed;
        }
        if let Some(quantity) = benefits.iter().find_map(|benefit| match benefit {
            CatalogBenefit::Limit {
                key,
                quantity,
                unit,
            } if key == "support.max_open_tickets" && unit == "tickets" => Some(*quantity),
            _ => None,
        }) {
            return TicketRule::Cap(quantity);
        }
        return TicketRule::Open;
    }
    if !free.enabled || !free.support_open {
        return TicketRule::Closed;
    }
    free.ticket_quantity.map_or(TicketRule::Open, |quantity| {
        TicketRule::Cap(i64::from(quantity))
    })
}

const PANEL_COLUMNS: &str = "p.revision_id,p.template_revision_id,p.revision,p.channel_id,p.button_label,p.state,p.nonce,b.message_id,b.custom_id";
const CASE_COLUMNS: &str = "case_id,tenant_id,member_id,support_number,state,version,template_revision_id,panel_revision_id";
const JOINED_CASE_COLUMNS: &str = "c.case_id,c.tenant_id,c.member_id,c.support_number,c.state,c.version,c.template_revision_id,c.panel_revision_id";

impl SupportStore {
    /// # Errors
    /// Devuelve un error de base de datos o de pertenencia al tenant.
    pub async fn prepare_panel(
        &self,
        tenant: Uuid,
        guild: &str,
        channel: &str,
        label: &str,
        now: OffsetDateTime,
    ) -> Result<SupportPanel, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let installed: Option<String> = sqlx::query_scalar(
            "SELECT provider_tenant_ref FROM installation.tenant WHERE tenant_id=$1 AND state='Active' FOR UPDATE"
        ).bind(tenant).fetch_optional(&mut *tx).await?;
        if installed.as_deref() != Some(guild) {
            return Err(sqlx::Error::Protocol("tenant/guild mismatch".to_owned()));
        }
        let template_id: Uuid = sqlx::query_scalar(
            "INSERT INTO support.ticket_template (template_id,tenant_id,guild_id) VALUES ($1,$2,$3) ON CONFLICT (tenant_id) DO UPDATE SET guild_id=EXCLUDED.guild_id RETURNING template_id"
        ).bind(Uuid::now_v7()).bind(tenant).bind(guild).fetch_one(&mut *tx).await?;
        let next_template: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(revision),0)+1 FROM support.ticket_template_revision WHERE tenant_id=$1"
        ).bind(tenant).fetch_one(&mut *tx).await?;
        let template_revision_id = Uuid::now_v7();
        // La plantilla anterior sigue publicada hasta confirmar el nuevo mensaje.
        let next_panel: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(revision),0)+1 FROM support.support_panel_revision WHERE tenant_id=$1"
        ).bind(tenant).fetch_one(&mut *tx).await?;
        let revision_id = Uuid::now_v7();
        // Discord acepta un nonce numérico; usar 53 bits evita exceder el rango seguro de JSON.
        let nonce = (revision_id.as_u64_pair().1 & ((1_u64 << 53) - 1))
            .max(1)
            .to_string();
        sqlx::query(
            "INSERT INTO support.ticket_template_revision (revision_id,template_id,tenant_id,revision,state,published_at) VALUES ($1,$2,$3,$4,'Superseded',$5)"
        ).bind(template_revision_id).bind(template_id).bind(tenant).bind(next_template).bind(now)
            .execute(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO support.support_panel_revision (revision_id,tenant_id,template_revision_id,revision,channel_id,button_label,state,nonce,created_at) VALUES ($1,$2,$3,$4,$5,$6,'Preparing',$7,$8)"
        ).bind(revision_id).bind(tenant).bind(template_revision_id).bind(next_panel)
            .bind(channel).bind(label).bind(&nonce).bind(now).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(SupportPanel {
            revision_id,
            template_revision_id,
            revision: next_panel,
            channel_id: channel.to_owned(),
            button_label: label.to_owned(),
            state: "Preparing".to_owned(),
            nonce,
            message_id: None,
            custom_id: None,
        })
    }

    /// # Errors
    /// Devuelve un error si no se puede confirmar la vinculación.
    #[allow(clippy::too_many_arguments)]
    pub async fn publish_panel(
        &self,
        tenant: Uuid,
        guild: &str,
        application: &str,
        revision: Uuid,
        message: &str,
        custom_id: &str,
        now: OffsetDateTime,
    ) -> Result<SupportPanel, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT tenant_id FROM installation.tenant WHERE tenant_id=$1 FOR UPDATE")
            .bind(tenant)
            .fetch_one(&mut *tx)
            .await?;
        let panel: SupportPanel = sqlx::query_as(&format!(
            "SELECT {PANEL_COLUMNS} FROM support.support_panel_revision p LEFT JOIN support.support_panel_binding b ON b.revision_id=p.revision_id WHERE p.revision_id=$1 AND p.tenant_id=$2 FOR UPDATE OF p"
        )).bind(revision).bind(tenant).fetch_one(&mut *tx).await?;
        if panel.state == "Published" {
            tx.commit().await?;
            return Ok(panel);
        }
        if !matches!(panel.state.as_str(), "Preparing" | "Degraded") {
            return Err(sqlx::Error::Protocol(
                "panel cannot be published".to_owned(),
            ));
        }
        let active_revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM support.support_panel_revision WHERE tenant_id=$1 AND state='Published'"
        ).bind(tenant).fetch_optional(&mut *tx).await?;
        if active_revision.is_some_and(|active| active > panel.revision) {
            sqlx::query(
                "UPDATE support.support_panel_revision SET state='Superseded' WHERE revision_id=$1",
            )
            .bind(revision)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            return Ok(SupportPanel {
                state: "Superseded".to_owned(),
                ..panel
            });
        }
        sqlx::query("UPDATE support.ticket_template_revision SET state='Superseded' WHERE tenant_id=$1 AND state='Published'")
            .bind(tenant).execute(&mut *tx).await?;
        sqlx::query("UPDATE support.support_panel_revision SET state='Superseded' WHERE tenant_id=$1 AND state='Published'")
            .bind(tenant).execute(&mut *tx).await?;
        sqlx::query("UPDATE support.ticket_template_revision SET state='Published',published_at=$2 WHERE revision_id=$1")
            .bind(panel.template_revision_id).bind(now).execute(&mut *tx).await?;
        let generation: i64 = sqlx::query_scalar("SELECT generation FROM installation.installation WHERE tenant_id=$1 AND state='Installed' ORDER BY generation DESC LIMIT 1")
            .bind(tenant).fetch_one(&mut *tx).await?;
        sqlx::query("INSERT INTO support.support_panel_binding (revision_id,tenant_id,channel_id,message_id,custom_id,application_id,installation_generation,bound_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(revision).bind(tenant).bind(&panel.channel_id).bind(message).bind(custom_id)
            .bind(application).bind(generation).bind(now).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE support.support_panel_revision SET state='Published' WHERE revision_id=$1",
        )
        .bind(revision)
        .execute(&mut *tx)
        .await?;
        append_fact(&mut tx,"support",tenant,guild,application,"TicketTemplatePublished",
            serde_json::json!({"revision_id":panel.template_revision_id,"member_capacity":1,"cooldown_seconds":0,"required_resource":"none"}),now).await?;
        append_fact(&mut tx,"support",tenant,guild,application,"SupportPanelPublished",
            serde_json::json!({"revision_id":revision,"template_revision_id":panel.template_revision_id,
                "channel_id":panel.channel_id,"message_id":message,"custom_id":custom_id}),now).await?;
        tx.commit().await?;
        Ok(SupportPanel {
            state: "Published".to_owned(),
            message_id: Some(message.to_owned()),
            custom_id: Some(custom_id.to_owned()),
            ..panel
        })
    }

    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn published_panel(&self, tenant: Uuid) -> Result<Option<SupportPanel>, sqlx::Error> {
        sqlx::query_as(&format!("SELECT {PANEL_COLUMNS} FROM support.support_panel_revision p LEFT JOIN support.support_panel_binding b ON b.revision_id=p.revision_id WHERE p.tenant_id=$1 AND p.state='Published'"))
            .bind(tenant).fetch_optional(&self.pool).await
    }

    /// Marca un rechazo definitivo de Discord sin alterar el panel publicado.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn fail_panel(&self, tenant: Uuid, revision: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE support.support_panel_revision SET state='Failed' WHERE tenant_id=$1 AND revision_id=$2 AND state='Preparing'")
            .bind(tenant).bind(revision).execute(&self.pool).await?;
        Ok(())
    }

    /// Conserva una revisión de resultado incierto para reconciliarla por nonce.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn degrade_panel(&self, tenant: Uuid, revision: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE support.support_panel_revision SET state='Degraded' WHERE tenant_id=$1 AND revision_id=$2 AND state='Preparing'")
            .bind(tenant).bind(revision).execute(&self.pool).await?;
        Ok(())
    }

    /// Reconcilia un POST incierto del panel mediante el nonce del mensaje Gateway.
    /// # Errors
    /// Devuelve un error si no se puede finalizar la revisión preparada.
    #[allow(clippy::too_many_arguments)]
    pub async fn reconcile_panel_nonce(
        &self,
        nonce: &str,
        channel: &str,
        message: &str,
        application: &str,
        author: &str,
        custom_id: &str,
        label: &str,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        if application != author {
            return Ok(false);
        }
        let row: Option<(Uuid,Uuid,String,String)> = sqlx::query_as(
            "SELECT p.tenant_id,p.revision_id,t.guild_id,p.button_label FROM support.support_panel_revision p JOIN support.ticket_template t ON t.tenant_id=p.tenant_id WHERE p.nonce=$1 AND p.channel_id=$2 AND p.state IN ('Preparing','Degraded')"
        ).bind(nonce).bind(channel).fetch_optional(&self.pool).await?;
        let Some((tenant, revision, guild, expected_label)) = row else {
            return Ok(false);
        };
        if custom_id != format!("support:{revision}") || label != expected_label {
            return Ok(false);
        }
        let installed: Option<String> = sqlx::query_scalar(
            "SELECT application_id FROM installation.tenant WHERE tenant_id=$1 AND state='Active'",
        )
        .bind(tenant)
        .fetch_optional(&self.pool)
        .await?;
        if installed.as_deref() != Some(application) {
            return Ok(false);
        }
        let panel = self
            .publish_panel(
                tenant,
                &guild,
                application,
                revision,
                message,
                custom_id,
                now,
            )
            .await?;
        Ok(panel.state == "Published")
    }

    /// # Errors
    /// Devuelve un error de base de datos. Una discrepancia no crea caso ni número.
    pub async fn admit_click(
        &self,
        click: &SupportClick<'_>,
        now: OffsetDateTime,
    ) -> Result<SupportDecision, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let installed: Option<String> = sqlx::query_scalar(
            "SELECT provider_tenant_ref FROM installation.tenant WHERE tenant_id=$1 AND state='Active' FOR UPDATE"
        ).bind(click.tenant_id).fetch_optional(&mut *tx).await?;
        if installed.as_deref() != Some(click.guild_id) {
            return Ok(SupportDecision::UnknownButton);
        }
        let prior_id: Option<Uuid> =
            sqlx::query_scalar("SELECT case_id FROM support.support_case WHERE interaction_id=$1")
                .bind(click.interaction_id)
                .fetch_optional(&mut *tx)
                .await?;
        if prior_id.is_some() {
            let existing = sqlx::query_as::<_,SupportCase>(&format!(
                "SELECT {JOINED_CASE_COLUMNS} FROM support.support_case c JOIN support.support_panel_binding b ON b.revision_id=c.panel_revision_id WHERE c.interaction_id=$1 AND c.tenant_id=$2 AND c.guild_id=$3 AND c.application_id=$4 AND c.member_id=$5 AND b.channel_id=$6 AND b.message_id=$7 AND b.custom_id=$8 AND b.application_id=$4 AND b.installation_generation=(SELECT MAX(generation) FROM installation.installation WHERE tenant_id=$2 AND state='Installed')"
            )).bind(click.interaction_id).bind(click.tenant_id).bind(click.guild_id)
                .bind(click.application_id).bind(click.member_id).bind(click.channel_id)
                .bind(click.message_id).bind(click.custom_id).fetch_optional(&mut *tx).await?;
            tx.commit().await?;
            return Ok(existing.map_or(SupportDecision::UnknownButton, SupportDecision::Opened));
        }
        let panel: Option<SupportPanel> = sqlx::query_as(&format!(
            "SELECT {PANEL_COLUMNS} FROM support.support_panel_revision p JOIN support.support_panel_binding b ON b.revision_id=p.revision_id WHERE p.tenant_id=$1 AND p.state='Published' AND b.channel_id=$2 AND b.message_id=$3 AND b.custom_id=$4 AND b.application_id=$5 AND b.installation_generation=(SELECT MAX(generation) FROM installation.installation WHERE tenant_id=$1 AND state='Installed')"
        )).bind(click.tenant_id).bind(click.channel_id).bind(click.message_id)
            .bind(click.custom_id).bind(click.application_id).fetch_optional(&mut *tx).await?;
        let Some(panel) = panel else {
            return Ok(SupportDecision::UnknownButton);
        };
        append_fact(&mut tx,"support",click.tenant_id,click.guild_id,click.application_id,
            "SupportPanelInteractionAccepted",
            serde_json::json!({"interaction_id":click.interaction_id,"panel_revision_id":panel.revision_id,
                "member_id":click.member_id}),now).await?;
        if let Some(existing) = sqlx::query_as::<_,SupportCase>(&format!(
            "SELECT {CASE_COLUMNS} FROM support.support_case WHERE tenant_id=$1 AND member_id=$2 AND state IN ('Open','Claimed')"
        )).bind(click.tenant_id).bind(click.member_id).fetch_optional(&mut *tx).await? {
            tx.commit().await?;
            return Ok(SupportDecision::AlreadyOpen(existing));
        }
        // La fila del tenant ya está bloqueada: cuenta y admisión usan el mismo turno transaccional.
        match current_ticket_rule(&mut tx, click.tenant_id).await? {
            TicketRule::Closed => {
                tx.commit().await?;
                return Ok(SupportDecision::NotIncluded);
            }
            TicketRule::Cap(limit) => {
                let open_count: i64 = sqlx::query_scalar("SELECT count(*) FROM support.support_case WHERE tenant_id=$1 AND state IN ('Open','Claimed')")
                    .bind(click.tenant_id).fetch_one(&mut *tx).await?;
                if open_count >= limit {
                    tx.commit().await?;
                    return Ok(SupportDecision::AtCapacity);
                }
            }
            TicketRule::Open => {}
        }
        let number: i64 = sqlx::query_scalar(
            "INSERT INTO support.support_number (tenant_id,next_number) VALUES ($1,2) ON CONFLICT (tenant_id) DO UPDATE SET next_number=support.support_number.next_number+1 RETURNING next_number-1"
        ).bind(click.tenant_id).fetch_one(&mut *tx).await?;
        let case_id = Uuid::now_v7();
        sqlx::query("INSERT INTO support.support_case (case_id,tenant_id,guild_id,application_id,member_id,interaction_id,template_revision_id,panel_revision_id,support_number,state,opened_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Open',$10)")
            .bind(case_id).bind(click.tenant_id).bind(click.guild_id).bind(click.application_id)
            .bind(click.member_id).bind(click.interaction_id).bind(panel.template_revision_id)
            .bind(panel.revision_id).bind(number).bind(now).execute(&mut *tx).await?;
        let case = SupportCase {
            case_id,
            tenant_id: click.tenant_id,
            member_id: click.member_id.to_owned(),
            support_number: number,
            state: "Open".to_owned(),
            version: 1,
            template_revision_id: panel.template_revision_id,
            panel_revision_id: panel.revision_id,
        };
        let mut opened_payload = case_payload(&case);
        opened_payload["interaction_id"] = serde_json::json!(click.interaction_id);
        opened_payload["channel_id"] = serde_json::json!(click.channel_id);
        opened_payload["message_id"] = serde_json::json!(click.message_id);
        opened_payload["custom_id"] = serde_json::json!(click.custom_id);
        opened_payload["actor_authority"] = serde_json::json!("signed_interaction");
        opened_payload["reason_class"] = serde_json::json!("panel_button");
        append_fact(
            &mut tx,
            "support",
            click.tenant_id,
            click.guild_id,
            click.application_id,
            "SupportCaseOpened",
            opened_payload,
            now,
        )
        .await?;
        tx.commit().await?;
        Ok(SupportDecision::Opened(case))
    }

    /// Lee el token de respuesta diferida del recibo temporal de Edge.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn interaction_token(
        &self,
        tenant: Uuid,
        interaction_id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT interaction_token FROM edge.interaction_receipt WHERE tenant_id=$1 AND interaction_id=$2 AND expires_at>CURRENT_TIMESTAMP")
            .bind(tenant).bind(interaction_id).fetch_optional(&self.pool).await
    }

    /// # Errors
    /// Devuelve un error de base de datos. Una versión anterior no cambia el caso.
    #[allow(clippy::too_many_arguments)]
    pub async fn transition(
        &self,
        tenant: Uuid,
        guild: &str,
        application: &str,
        case_id: Uuid,
        version: i64,
        actor: Uuid,
        close: bool,
        now: OffsetDateTime,
    ) -> Result<Option<SupportCase>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let next = if close { "Closed" } else { "Claimed" };
        let previous: Option<String> = sqlx::query_scalar(
            "SELECT state FROM support.support_case WHERE tenant_id=$1 AND case_id=$2 AND version=$3 AND guild_id=$4 FOR UPDATE"
        ).bind(tenant).bind(case_id).bind(version).bind(guild).fetch_optional(&mut *tx).await?;
        let row: Option<SupportCase> = sqlx::query_as(&format!(
            "UPDATE support.support_case SET state=$5,version=version+1,claimed_by=CASE WHEN $6 THEN claimed_by ELSE $7 END,closed_at=CASE WHEN $6 THEN $8 ELSE closed_at END WHERE tenant_id=$1 AND case_id=$2 AND version=$3 AND guild_id=$4 AND (state='Open' OR ($6 AND state='Claimed')) RETURNING {CASE_COLUMNS}"
        )).bind(tenant).bind(case_id).bind(version).bind(guild).bind(next).bind(close)
            .bind(actor).bind(now).fetch_optional(&mut *tx).await?;
        if let Some(case) = &row {
            let mut payload = case_payload(case);
            payload["actor_account_id"] = serde_json::json!(actor);
            payload["actor_authority"] = serde_json::json!("dashboard_session");
            payload["expected_version"] = serde_json::json!(version);
            payload["expected_prior_state"] = serde_json::json!(previous);
            payload["reason_class"] =
                serde_json::json!(if close { "staff_close" } else { "staff_claim" });
            append_fact(
                &mut tx,
                "support",
                tenant,
                guild,
                application,
                if close {
                    "SupportCaseClosed"
                } else {
                    "SupportCaseClaimed"
                },
                payload,
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(row)
    }
}

fn case_payload(case: &SupportCase) -> serde_json::Value {
    serde_json::json!({"case_id":case.case_id,"support_number":case.support_number,
        "member_id":case.member_id,"state":case.state,"version":case.version,
        "template_revision_id":case.template_revision_id,"panel_revision_id":case.panel_revision_id})
}

impl QueryStore {
    /// # Errors
    /// Devuelve un error ante un hecho de soporte inválido.
    pub async fn apply_support_ticket(
        &self,
        event: &EventEnvelope,
        raw: &[u8],
        position: &str,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let tenant = event
            .tenant_id
            .ok_or_else(|| sqlx::Error::Protocol("missing tenant".to_owned()))?;
        let payload = &event.payload;
        let case_id: Uuid = payload["case_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing case".to_owned()))?
            .parse()
            .map_err(|e: uuid::Error| sqlx::Error::Protocol(e.to_string()))?;
        let number = payload["support_number"]
            .as_i64()
            .ok_or_else(|| sqlx::Error::Protocol("missing number".to_owned()))?;
        let member = payload["member_id"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing member".to_owned()))?;
        let state = payload["state"]
            .as_str()
            .ok_or_else(|| sqlx::Error::Protocol("missing state".to_owned()))?;
        let version = payload["version"]
            .as_i64()
            .ok_or_else(|| sqlx::Error::Protocol("missing version".to_owned()))?;
        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query("INSERT INTO query_status.event_inbox (event_id,schema_name,raw_envelope,stream_position,received_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id) DO NOTHING")
            .bind(event.event_id).bind(&event.schema_name).bind(raw).bind(position).bind(now)
            .execute(&mut *tx).await?.rows_affected()==1;
        if inserted {
            sqlx::query("INSERT INTO query_status.support_ticket (tenant_id,case_id,support_number,member_id,state,version,projection_watermark,last_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (case_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,projection_watermark=EXCLUDED.projection_watermark,last_event_id=EXCLUDED.last_event_id WHERE query_status.support_ticket.version<EXCLUDED.version")
                .bind(tenant).bind(case_id).bind(number).bind(member).bind(state).bind(version)
                .bind(now).bind(event.event_id).execute(&mut *tx).await?;
        }
        tx.commit().await
    }

    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn support_tickets(
        &self,
        tenant: Uuid,
    ) -> Result<Vec<SupportTicketStatus>, sqlx::Error> {
        sqlx::query_as("SELECT case_id,tenant_id,member_id,support_number,state,version,projection_watermark FROM query_status.support_ticket WHERE tenant_id=$1 ORDER BY support_number DESC LIMIT 100")
            .bind(tenant).fetch_all(&self.pool).await
    }
}

#[cfg(test)]
mod ticket_rule_tests {
    use super::{TicketRule, ticket_rule};
    use crate::{CatalogBenefit, DefaultPlan};

    fn base() -> CatalogBenefit {
        CatalogBenefit::Feature {
            key: "platform.base".to_owned(),
        }
    }

    #[test]
    fn legacy_paid_plan_stays_open_and_a_closed_mark_does_not() {
        let legacy = [base()];
        assert_eq!(
            ticket_rule(Some(&legacy), &DefaultPlan::open()),
            TicketRule::Open
        );
        let closed = [
            base(),
            CatalogBenefit::Feature {
                key: "support.closed".to_owned(),
            },
        ];
        assert_eq!(
            ticket_rule(Some(&closed), &DefaultPlan::open()),
            TicketRule::Closed
        );
        let capped = [CatalogBenefit::Limit {
            key: "support.max_open_tickets".to_owned(),
            quantity: 4,
            unit: "tickets".to_owned(),
        }];
        assert_eq!(
            ticket_rule(Some(&capped), &DefaultPlan::open()),
            TicketRule::Cap(4)
        );
    }

    #[test]
    fn free_plan_applies_only_without_a_paid_projection() {
        let capped = DefaultPlan {
            enabled: true,
            support_open: true,
            ticket_quantity: Some(3),
        };
        assert_eq!(ticket_rule(None, &capped), TicketRule::Cap(3));
        assert_eq!(ticket_rule(None, &DefaultPlan::open()), TicketRule::Open);
        let disabled = DefaultPlan {
            enabled: false,
            support_open: true,
            ticket_quantity: None,
        };
        assert_eq!(ticket_rule(None, &disabled), TicketRule::Closed);
        let unchecked = DefaultPlan {
            enabled: true,
            support_open: false,
            ticket_quantity: Some(3),
        };
        assert_eq!(ticket_rule(None, &unchecked), TicketRule::Closed);
    }
}
