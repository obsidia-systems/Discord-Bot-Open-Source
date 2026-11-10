//! Dueño de soporte S5. Una revisión se publica solo al vincular su mensaje de Discord.

use sqlx::Row;
use time::OffsetDateTime;
use tobot_envelope::EventEnvelope;
use uuid::Uuid;

use super::messaging::append_fact;
use super::{QueryStore, SupportStore};
use crate::{CatalogBenefit, DefaultPlan};

#[derive(Clone, Debug, serde::Serialize)]
pub struct SupportServerLimits {
    pub support_open: bool,
    pub open_per_member: i64,
    pub open_cap: Option<i64>,
}

#[derive(Clone, Debug, sqlx::FromRow, serde::Serialize)]
pub struct SupportPanelChoice {
    pub revision_id: Uuid,
    pub name: String,
    pub revision: i64,
    pub channel_id: String,
    pub button_label: String,
    pub state: String,
    pub message_id: String,
    pub category_id: Option<String>,
    pub overflow_category_id: Option<String>,
    pub staff_role_id: Option<String>,
    pub questions: serde_json::Value,
    pub timezone_offset_minutes: Option<i32>,
    pub weekly_hours: serde_json::Value,
    pub closed_hours: String,
    pub confirm_close: bool,
    pub inactivity_minutes: Option<i32>,
    pub transcript_enabled: bool,
    pub log_channel_id: Option<String>,
}

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
    pub resource_channel_id: Option<String>,
    pub outside_hours: bool,
    pub close_requested: bool,
    pub claimer_member_id: Option<String>,
    pub rating: Option<i16>,
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
    pub channel_id: Option<String>,
    pub rating: Option<i16>,
    pub outside_hours: bool,
    pub answers: serde_json::Value,
    pub transcript_ready: bool,
}

pub struct IntakeAnswer {
    pub question: String,
    pub answer: String,
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
    pub answers: &'a [IntakeAnswer],
}

pub enum SupportDecision {
    Opened(SupportCase),
    AlreadyOpen(SupportCase),
    AtCapacity,
    NotIncluded,
    UnknownButton,
    OutsideHours,
    MissingAnswers,
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
const CHOICE_COLUMNS: &str = "p.revision_id,p.name,p.revision,p.channel_id,p.button_label,p.state,b.message_id,r.category_id,r.overflow_category_id,r.staff_role_id,r.questions,r.timezone_offset_minutes,r.weekly_hours,r.closed_hours,r.confirm_close,r.inactivity_minutes,r.transcript_enabled,r.log_channel_id";
const CASE_COLUMNS: &str = "case_id,tenant_id,member_id,support_number,state,version,template_revision_id,panel_revision_id,resource_channel_id,outside_hours,close_requested,claimer_member_id,rating";
const JOINED_CASE_COLUMNS: &str = "c.case_id,c.tenant_id,c.member_id,c.support_number,c.state,c.version,c.template_revision_id,c.panel_revision_id,c.resource_channel_id,c.outside_hours,c.close_requested,c.claimer_member_id,c.rating";
const ACTIVE_CASE_STATES: &str = "'Provisioning','Open','Claimed','Closing'";

async fn write_desk<'c, E>(
    executor: E,
    tenant: Uuid,
    template_revision: Uuid,
    desk: &crate::DeskConfig,
) -> Result<u64, sqlx::Error>
where
    E: sqlx::Executor<'c, Database = sqlx::Postgres>,
{
    let questions = serde_json::to_value(
        desk.questions
            .iter()
            .map(|question| serde_json::json!({"title":question.title,"required":question.required}))
            .collect::<Vec<_>>(),
    )
    .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
    let hours = serde_json::to_value(
        desk.weekly_hours
            .iter()
            .map(|window| {
                serde_json::json!({"weekday":window.weekday,"start_minute":window.start_minute,"end_minute":window.end_minute})
            })
            .collect::<Vec<_>>(),
    )
    .map_err(|error| sqlx::Error::Protocol(error.to_string()))?;
    let updated = sqlx::query("UPDATE support.ticket_template_revision SET required_resource='channel',category_id=$3,overflow_category_id=$4,staff_role_id=$5,questions=$6,timezone_offset_minutes=$7,weekly_hours=$8,closed_hours=$9,confirm_close=$10,inactivity_minutes=$11,transcript_enabled=$12,log_channel_id=$13 WHERE tenant_id=$1 AND revision_id=$2")
        .bind(tenant).bind(template_revision).bind(&desk.category_id).bind(&desk.overflow_category_id)
        .bind(&desk.staff_role_id).bind(questions).bind(desk.timezone_offset_minutes).bind(hours)
        .bind(&desk.closed_hours).bind(desk.confirm_close).bind(desk.inactivity_minutes)
        .bind(desk.transcript_enabled).bind(&desk.log_channel_id).execute(executor).await?;
    Ok(updated.rows_affected())
}

impl SupportStore {
    /// # Errors
    /// Devuelve un error de base de datos o de pertenencia al tenant.
    pub async fn prepare_panel(
        &self,
        tenant: Uuid,
        guild: &str,
        channel: &str,
        label: &str,
        name: &str,
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
        // La plantilla queda en espera hasta que este panel confirme su propio mensaje.
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
            "INSERT INTO support.support_panel_revision (revision_id,tenant_id,template_revision_id,revision,channel_id,button_label,name,state,nonce,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'Preparing',$8,$9)"
        ).bind(revision_id).bind(tenant).bind(template_revision_id).bind(next_panel)
            .bind(channel).bind(label).bind(name).bind(&nonce).bind(now).execute(&mut *tx).await?;
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
        // Publicar este panel no apaga a los que ya tienen mensaje.
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
        let required_resource: String = sqlx::query_scalar(
            "SELECT required_resource FROM support.ticket_template_revision WHERE revision_id=$1",
        )
        .bind(panel.template_revision_id)
        .fetch_one(&mut *tx)
        .await?;
        append_fact(&mut tx,"support",tenant,guild,application,"TicketTemplatePublished",
            serde_json::json!({"revision_id":panel.template_revision_id,"member_capacity":1,"cooldown_seconds":0,"required_resource":required_resource}),now).await?;
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
        sqlx::query_as(&format!("SELECT {PANEL_COLUMNS} FROM support.support_panel_revision p LEFT JOIN support.support_panel_binding b ON b.revision_id=p.revision_id WHERE p.tenant_id=$1 AND p.state='Published' ORDER BY p.revision DESC LIMIT 1"))
            .bind(tenant).fetch_optional(&self.pool).await
    }

    /// Cupo del plan y la regla de un caso abierto por miembro.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn server_limits(&self, tenant: Uuid) -> Result<SupportServerLimits, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let rule = current_ticket_rule(&mut tx, tenant).await?;
        tx.commit().await?;
        Ok(match rule {
            TicketRule::Closed => SupportServerLimits {
                support_open: false,
                open_per_member: 1,
                open_cap: Some(0),
            },
            TicketRule::Open => SupportServerLimits {
                support_open: true,
                open_per_member: 1,
                open_cap: None,
            },
            TicketRule::Cap(quantity) => SupportServerLimits {
                support_open: true,
                open_per_member: 1,
                open_cap: Some(quantity),
            },
        })
    }

    /// Paneles con mensaje en Discord. Cada uno sigue siendo un tipo activo.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn panel_choices(&self, tenant: Uuid) -> Result<Vec<SupportPanelChoice>, sqlx::Error> {
        sqlx::query_as(&format!("SELECT {CHOICE_COLUMNS} FROM support.support_panel_revision p JOIN support.support_panel_binding b ON b.revision_id=p.revision_id JOIN support.ticket_template_revision r ON r.revision_id=p.template_revision_id WHERE p.tenant_id=$1 AND p.state='Published' ORDER BY p.revision DESC"))
            .bind(tenant).fetch_all(&self.pool).await
    }

    /// Un panel publicado, con el escritorio que usa su botón.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn published_choice(
        &self,
        tenant: Uuid,
        revision: Uuid,
    ) -> Result<Option<SupportPanelChoice>, sqlx::Error> {
        sqlx::query_as(&format!("SELECT {CHOICE_COLUMNS} FROM support.support_panel_revision p JOIN support.support_panel_binding b ON b.revision_id=p.revision_id JOIN support.ticket_template_revision r ON r.revision_id=p.template_revision_id WHERE p.tenant_id=$1 AND p.revision_id=$2 AND p.state='Published'"))
            .bind(tenant).bind(revision).fetch_optional(&self.pool).await
    }

    /// Actualiza el nombre y el escritorio de un panel que ya tiene mensaje.
    /// El botón de Discord no cambia de canal ni de identificador.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn save_published_panel(
        &self,
        tenant: Uuid,
        revision: Uuid,
        name: &str,
        desk: &crate::DeskConfig,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let template: Option<Uuid> = sqlx::query_scalar(
            "UPDATE support.support_panel_revision SET name=$3 WHERE tenant_id=$1 AND revision_id=$2 AND state='Published' RETURNING template_revision_id",
        )
        .bind(tenant)
        .bind(revision)
        .bind(name)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(template_revision) = template else {
            tx.commit().await?;
            return Ok(false);
        };
        if write_desk(&mut *tx, tenant, template_revision, desk).await? != 1 {
            return Err(sqlx::Error::Protocol("desk revision missing".to_owned()));
        }
        tx.commit().await?;
        Ok(true)
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
    #[allow(clippy::too_many_lines)]
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
            "SELECT {CASE_COLUMNS} FROM support.support_case WHERE tenant_id=$1 AND member_id=$2 AND state IN ({ACTIVE_CASE_STATES})"
        )).bind(click.tenant_id).bind(click.member_id).fetch_optional(&mut *tx).await? {
            tx.commit().await?;
            return Ok(SupportDecision::AlreadyOpen(existing));
        }
        let desk = sqlx::query("SELECT required_resource, questions, timezone_offset_minutes, weekly_hours, closed_hours FROM support.ticket_template_revision WHERE revision_id=$1")
            .bind(panel.template_revision_id).fetch_one(&mut *tx).await?;
        let required_resource: String = desk.try_get("required_resource")?;
        let questions: serde_json::Value = desk.try_get("questions")?;
        let closed_hours: String = desk.try_get("closed_hours")?;
        let offset_minutes: Option<i32> = desk.try_get("timezone_offset_minutes")?;
        let weekly_hours: serde_json::Value = desk.try_get("weekly_hours")?;
        let gate = crate::support_desk::hours_gate(
            &crate::DeskConfig {
                category_id: String::new(),
                overflow_category_id: None,
                staff_role_id: String::new(),
                questions: Vec::new(),
                timezone_offset_minutes: offset_minutes.unwrap_or(0),
                weekly_hours: weekly_windows(&weekly_hours),
                closed_hours,
                confirm_close: false,
                inactivity_minutes: None,
                transcript_enabled: false,
                log_channel_id: None,
            },
            now,
        );
        if gate == crate::HoursGate::Block {
            tx.commit().await?;
            return Ok(SupportDecision::OutsideHours);
        }
        let required_missing = questions.as_array().is_some_and(|items| {
            !items.is_empty()
                && items.iter().enumerate().any(|(index, item)| {
                    let required = item["required"].as_bool().unwrap_or(false);
                    let answer = click.answers.get(index).map(|entry| entry.answer.trim());
                    answer.is_none() || (required && answer.is_some_and(str::is_empty))
                })
        });
        if required_missing {
            tx.commit().await?;
            return Ok(SupportDecision::MissingAnswers);
        }
        // La fila del tenant ya está bloqueada: cuenta y admisión usan el mismo turno transaccional.
        match current_ticket_rule(&mut tx, click.tenant_id).await? {
            TicketRule::Closed => {
                tx.commit().await?;
                return Ok(SupportDecision::NotIncluded);
            }
            TicketRule::Cap(limit) => {
                let open_count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM support.support_case WHERE tenant_id=$1 AND state IN ({ACTIVE_CASE_STATES})"))
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
        let state = if required_resource == "channel" {
            "Provisioning"
        } else {
            "Open"
        };
        let outside_hours = gate == crate::HoursGate::Warn;
        sqlx::query("INSERT INTO support.support_case (case_id,tenant_id,guild_id,application_id,member_id,interaction_id,template_revision_id,panel_revision_id,support_number,state,opened_at,outside_hours,last_activity_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$11)")
            .bind(case_id).bind(click.tenant_id).bind(click.guild_id).bind(click.application_id)
            .bind(click.member_id).bind(click.interaction_id).bind(panel.template_revision_id)
            .bind(panel.revision_id).bind(number).bind(state).bind(now).bind(outside_hours).execute(&mut *tx).await?;
        for (position, answer) in click.answers.iter().enumerate().take(5) {
            sqlx::query("INSERT INTO support.intake_answer (case_id,position,question,answer) VALUES ($1,$2,$3,$4)")
                .bind(case_id).bind(i16::try_from(position).unwrap_or(0)).bind(&answer.question).bind(&answer.answer)
                .execute(&mut *tx).await?;
        }
        let case = SupportCase {
            case_id,
            tenant_id: click.tenant_id,
            member_id: click.member_id.to_owned(),
            support_number: number,
            state: state.to_owned(),
            version: 1,
            template_revision_id: panel.template_revision_id,
            panel_revision_id: panel.revision_id,
            resource_channel_id: None,
            outside_hours,
            close_requested: false,
            claimer_member_id: None,
            rating: None,
        };
        let mut opened_payload = case_payload(&case);
        opened_payload["interaction_id"] = serde_json::json!(click.interaction_id);
        opened_payload["channel_id"] = serde_json::json!(click.channel_id);
        opened_payload["message_id"] = serde_json::json!(click.message_id);
        opened_payload["custom_id"] = serde_json::json!(click.custom_id);
        opened_payload["outside_hours"] = serde_json::json!(case.outside_hours);
        opened_payload["answers"] = serde_json::json!(
            click
                .answers
                .iter()
                .map(
                    |answer| serde_json::json!({"question":answer.question,"answer":answer.answer})
                )
                .collect::<Vec<_>>()
        );
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
            "UPDATE support.support_case SET state=$5,version=version+1,claimed_by=CASE WHEN $6 THEN claimed_by ELSE $7 END,closed_at=CASE WHEN $6 THEN $8 ELSE closed_at END,close_requested=false WHERE tenant_id=$1 AND case_id=$2 AND version=$3 AND guild_id=$4 AND (state IN ('Open','Provisioning') OR ($6 AND state IN ('Claimed','Closing'))) RETURNING {CASE_COLUMNS}"
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

    /// Guarda la categoría, el rol y el resto del mostrador en la revisión que se está publicando.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn attach_desk(
        &self,
        tenant: Uuid,
        template_revision: Uuid,
        desk: &crate::DeskConfig,
    ) -> Result<(), sqlx::Error> {
        if write_desk(&self.pool, tenant, template_revision, desk).await? == 1 {
            Ok(())
        } else {
            Err(sqlx::Error::Protocol("desk revision missing".to_owned()))
        }
    }

    /// Confirma el canal y deja el caso `Open` una sola vez.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn bind_channel(
        &self,
        tenant: Uuid,
        guild: &str,
        application: &str,
        case_id: Uuid,
        channel_id: &str,
        now: OffsetDateTime,
    ) -> Result<Option<SupportCase>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let row: Option<SupportCase> = sqlx::query_as(&format!(
            "UPDATE support.support_case SET state='Open',version=version+1,resource_channel_id=$3,last_activity_at=$4 WHERE tenant_id=$1 AND case_id=$2 AND guild_id=$5 AND state='Provisioning' AND resource_channel_id IS NULL RETURNING {CASE_COLUMNS}"
        )).bind(tenant).bind(case_id).bind(channel_id).bind(now).bind(guild).fetch_optional(&mut *tx).await?;
        if let Some(case) = &row {
            let mut payload = case_payload(case);
            payload["channel_id"] = serde_json::json!(channel_id);
            payload["outside_hours"] = serde_json::json!(case.outside_hours);
            payload["reason_class"] = serde_json::json!("channel_confirmed");
            append_fact(
                &mut tx,
                "support",
                tenant,
                guild,
                application,
                "SupportCaseOpened",
                payload,
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(row)
    }

    /// Anota el miembro de Discord que reclamó, para devolverle la escritura.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn note_claimer(
        &self,
        tenant: Uuid,
        case_id: Uuid,
        member_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE support.support_case SET claimer_member_id=$3 WHERE tenant_id=$1 AND case_id=$2")
            .bind(tenant).bind(case_id).bind(member_id).execute(&self.pool).await?;
        Ok(())
    }

    /// Pide confirmación al autor sin cerrar el caso.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn request_close(
        &self,
        tenant: Uuid,
        case_id: Uuid,
        version: i64,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query("UPDATE support.support_case SET close_requested=true,version=version+1 WHERE tenant_id=$1 AND case_id=$2 AND version=$3 AND state IN ('Open','Claimed') AND close_requested=false")
            .bind(tenant).bind(case_id).bind(version).execute(&self.pool).await?;
        Ok(updated.rows_affected() == 1)
    }

    /// El rechazo deja el caso como estaba y sube la versión.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn deny_close(
        &self,
        tenant: Uuid,
        case_id: Uuid,
    ) -> Result<Option<SupportCase>, sqlx::Error> {
        sqlx::query_as(&format!("UPDATE support.support_case SET close_requested=false,version=version+1 WHERE tenant_id=$1 AND case_id=$2 AND close_requested=true RETURNING {CASE_COLUMNS}"))
            .bind(tenant).bind(case_id).fetch_optional(&self.pool).await
    }

    /// Guarda una valoración. La segunda no sustituye la primera.
    /// # Errors
    /// Devuelve un error de base de datos.
    #[allow(clippy::too_many_arguments)]
    pub async fn record_rating(
        &self,
        tenant: Uuid,
        guild: &str,
        application: &str,
        case_id: Uuid,
        member_id: &str,
        rating: i16,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        if !(1..=5).contains(&rating) {
            return Ok(false);
        }
        let mut tx = self.pool.begin().await?;
        let row: Option<SupportCase> = sqlx::query_as(&format!("UPDATE support.support_case SET rating=$4,version=version+1 WHERE tenant_id=$1 AND case_id=$2 AND member_id=$3 AND state='Closed' AND rating IS NULL RETURNING {CASE_COLUMNS}"))
            .bind(tenant).bind(case_id).bind(member_id).bind(rating).fetch_optional(&mut *tx).await?;
        if let Some(case) = &row {
            let mut payload = case_payload(case);
            payload["rating"] = serde_json::json!(rating);
            payload["reason_class"] = serde_json::json!("member_rating");
            append_fact(
                &mut tx,
                "support",
                tenant,
                guild,
                application,
                "SupportCaseClosed",
                payload,
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(row.is_some())
    }

    /// Resumen permitido del formulario, en el orden de las preguntas.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn intake_lines(&self, case_id: Uuid) -> Result<Vec<(String, String)>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT question, answer FROM support.intake_answer WHERE case_id=$1 ORDER BY position",
        )
        .bind(case_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| Ok((row.try_get("question")?, row.try_get("answer")?)))
            .collect()
    }

    /// Política del botón publicado, para decidir el modal antes de reservar cupo.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn button_desk(
        &self,
        custom_id: &str,
    ) -> Result<Option<crate::DeskConfig>, sqlx::Error> {
        let row = sqlx::query("SELECT r.category_id,r.overflow_category_id,r.staff_role_id,r.questions,r.timezone_offset_minutes,r.weekly_hours,r.closed_hours,r.confirm_close,r.inactivity_minutes,r.transcript_enabled,r.log_channel_id FROM support.support_panel_binding b JOIN support.support_panel_revision p ON p.revision_id=b.revision_id JOIN support.ticket_template_revision r ON r.revision_id=p.template_revision_id WHERE b.custom_id=$1 AND p.state='Published'")
            .bind(custom_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|row| desk_from_row(&row)).transpose()?.flatten())
    }

    /// Anota un mensaje del canal del caso. El cuerpo puede llegar después.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn observe_message(
        &self,
        channel_id: &str,
        message_id: &str,
        author_id: &str,
        body: Option<&str>,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let case_id: Option<Uuid> = sqlx::query_scalar("SELECT case_id FROM support.support_case WHERE resource_channel_id=$1 AND state IN ('Open','Claimed','Closing','Closed')")
            .bind(channel_id).fetch_optional(&self.pool).await?;
        let Some(case_id) = case_id else {
            return Ok(false);
        };
        sqlx::query("INSERT INTO support.transcript_line (case_id,message_id,author_id,body,observed_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (case_id,message_id) DO UPDATE SET body=COALESCE(support.transcript_line.body,EXCLUDED.body)")
            .bind(case_id).bind(message_id).bind(author_id).bind(body).bind(now).execute(&self.pool).await?;
        sqlx::query("UPDATE support.support_case SET last_activity_at=$2,warning_sent_at=NULL WHERE case_id=$1 AND state IN ('Open','Claimed')")
            .bind(case_id).bind(now).execute(&self.pool).await?;
        Ok(true)
    }

    /// Líneas capturadas, en orden de observación.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn transcript_lines(
        &self,
        case_id: Uuid,
    ) -> Result<Vec<crate::support_desk::TranscriptLine>, sqlx::Error> {
        let rows = sqlx::query("SELECT message_id,author_id,body,observed_at FROM support.transcript_line WHERE case_id=$1 ORDER BY observed_at,message_id")
            .bind(case_id).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|row| {
                Ok(crate::support_desk::TranscriptLine {
                    message_id: row.try_get("message_id")?,
                    author_id: row.try_get("author_id")?,
                    body: row.try_get("body")?,
                    observed_at: row.try_get("observed_at")?,
                })
            })
            .collect()
    }

    /// Guarda el artefacto. No reabre el caso.
    /// # Errors
    /// Devuelve un error de base de datos.
    #[allow(clippy::too_many_arguments)]
    pub async fn save_transcript(
        &self,
        tenant: Uuid,
        guild: &str,
        application: &str,
        case_id: Uuid,
        html: &str,
        coverage: &str,
        now: OffsetDateTime,
    ) -> Result<Option<SupportCase>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let row: Option<SupportCase> = sqlx::query_as(&format!("UPDATE support.support_case SET transcript_html=$3,transcript_coverage=$4,version=version+1 WHERE tenant_id=$1 AND case_id=$2 AND transcript_html IS NULL RETURNING {CASE_COLUMNS}"))
            .bind(tenant).bind(case_id).bind(html).bind(coverage).fetch_optional(&mut *tx).await?;
        if let Some(case) = &row {
            let mut payload = case_payload(case);
            payload["transcript_ready"] = serde_json::json!(true);
            payload["channel_id"] = serde_json::json!(case.resource_channel_id);
            payload["reason_class"] = serde_json::json!("transcript_stored");
            append_fact(
                &mut tx,
                "support",
                tenant,
                guild,
                application,
                "SupportCaseClosed",
                payload,
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(row)
    }

    /// Lee el HTML solo para quien ya pasó la autorización del tenant.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn transcript_html(
        &self,
        tenant: Uuid,
        case_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT transcript_html FROM support.support_case WHERE tenant_id=$1 AND case_id=$2",
        )
        .bind(tenant)
        .bind(case_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Marca el aviso de inactividad una sola vez para la actividad actual.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn mark_inactivity_warning(
        &self,
        case_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query("UPDATE support.support_case SET warning_sent_at=$2 WHERE case_id=$1 AND warning_sent_at IS NULL AND state IN ('Open','Claimed')")
            .bind(case_id).bind(now).execute(&self.pool).await?;
        Ok(updated.rows_affected() == 1)
    }

    /// Casos cuyo canal todavía no está confirmado.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn provisioning_cases(&self) -> Result<Vec<sqlx::postgres::PgRow>, sqlx::Error> {
        sqlx::query("SELECT c.case_id,c.tenant_id,c.guild_id,c.application_id,c.member_id,c.support_number,r.category_id,r.overflow_category_id,r.staff_role_id FROM support.support_case c JOIN support.ticket_template_revision r ON r.revision_id=c.template_revision_id WHERE c.state='Provisioning' AND c.resource_channel_id IS NULL ORDER BY c.opened_at LIMIT 16")
            .fetch_all(&self.pool).await
    }

    /// Casos abiertos con un plazo de inactividad.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn inactivity_cases(&self) -> Result<Vec<sqlx::postgres::PgRow>, sqlx::Error> {
        sqlx::query("SELECT c.case_id,c.tenant_id,c.guild_id,c.application_id,c.version,c.resource_channel_id,c.last_activity_at,c.warning_sent_at,r.inactivity_minutes FROM support.support_case c JOIN support.ticket_template_revision r ON r.revision_id=c.template_revision_id WHERE c.state IN ('Open','Claimed') AND r.inactivity_minutes IS NOT NULL AND c.resource_channel_id IS NOT NULL LIMIT 32")
            .fetch_all(&self.pool).await
    }

    /// Canales cerrados que todavía existen en Discord.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn channels_pending_delete(&self) -> Result<Vec<sqlx::postgres::PgRow>, sqlx::Error> {
        sqlx::query("SELECT c.case_id,c.tenant_id,c.guild_id,c.application_id,c.member_id,c.support_number,c.resource_channel_id,c.version,r.transcript_enabled,r.log_channel_id,r.confirm_close,c.transcript_html IS NOT NULL AS transcript_stored,c.rating IS NOT NULL AS rated FROM support.support_case c JOIN support.ticket_template_revision r ON r.revision_id=c.template_revision_id WHERE c.state='Closed' AND c.resource_channel_id IS NOT NULL AND c.channel_deleted_at IS NULL LIMIT 16")
            .fetch_all(&self.pool).await
    }

    /// El borrado fallido deja el canal para otro intento.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn mark_channel_deleted(
        &self,
        case_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE support.support_case SET channel_deleted_at=$2 WHERE case_id=$1 AND channel_deleted_at IS NULL")
            .bind(case_id).bind(now).execute(&self.pool).await?;
        Ok(())
    }

    /// Servidor del caso. La valoración llega por mensaje directo, sin guild en la interacción.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn case_provider_guild(&self, case_id: Uuid) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT guild_id FROM support.support_case WHERE case_id=$1")
            .bind(case_id)
            .fetch_optional(&self.pool)
            .await
    }

    /// Reserva el aviso de valoración. Solo el primer intento puede enviarlo.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn claim_rating_prompt(
        &self,
        case_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query("UPDATE support.support_case SET rating_prompted_at=$2 WHERE case_id=$1 AND state='Closed' AND rating IS NULL AND rating_prompted_at IS NULL")
            .bind(case_id).bind(now).execute(&self.pool).await?;
        Ok(updated.rows_affected() == 1)
    }

    /// Suelta el aviso si el mensaje directo no salió, para un solo reintento.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn release_rating_prompt(&self, case_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE support.support_case SET rating_prompted_at=NULL WHERE case_id=$1 AND rating IS NULL")
            .bind(case_id).execute(&self.pool).await?;
        Ok(())
    }

    /// Suelta el reclamo y devuelve la escritura al rol de staff.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn unclaim(
        &self,
        tenant: Uuid,
        guild: &str,
        application: &str,
        case_id: Uuid,
        version: i64,
        now: OffsetDateTime,
    ) -> Result<Option<SupportCase>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let row: Option<SupportCase> = sqlx::query_as(&format!(
            "UPDATE support.support_case SET state='Open',version=version+1,claimed_by=NULL,claimer_member_id=NULL WHERE tenant_id=$1 AND case_id=$2 AND version=$3 AND guild_id=$4 AND state='Claimed' RETURNING {CASE_COLUMNS}"
        )).bind(tenant).bind(case_id).bind(version).bind(guild).fetch_optional(&mut *tx).await?;
        if let Some(case) = &row {
            let mut payload = case_payload(case);
            payload["reason_class"] = serde_json::json!("claim_released");
            append_fact(
                &mut tx,
                "support",
                tenant,
                guild,
                application,
                "SupportCaseOpened",
                payload,
                now,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(row)
    }

    /// Datos del caso que el canal y los permisos necesitan.
    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn case_desk(
        &self,
        tenant: Uuid,
        case_id: Uuid,
    ) -> Result<Option<sqlx::postgres::PgRow>, sqlx::Error> {
        sqlx::query("SELECT c.case_id,c.member_id,c.support_number,c.state,c.version,c.resource_channel_id,c.claimer_member_id,c.close_requested,c.outside_hours,c.rating,r.staff_role_id,r.confirm_close,r.transcript_enabled,r.log_channel_id,r.category_id,r.overflow_category_id FROM support.support_case c JOIN support.ticket_template_revision r ON r.revision_id=c.template_revision_id WHERE c.tenant_id=$1 AND c.case_id=$2")
            .bind(tenant).bind(case_id).fetch_optional(&self.pool).await
    }
}

fn desk_from_row(row: &sqlx::postgres::PgRow) -> Result<Option<crate::DeskConfig>, sqlx::Error> {
    use sqlx::Row;
    let category: Option<String> = row.try_get("category_id")?;
    let staff: Option<String> = row.try_get("staff_role_id")?;
    let (Some(category_id), Some(staff_role_id)) = (category, staff) else {
        return Ok(None);
    };
    let questions: serde_json::Value = row.try_get("questions")?;
    let weekly: serde_json::Value = row.try_get("weekly_hours")?;
    Ok(Some(crate::DeskConfig {
        category_id,
        overflow_category_id: row.try_get("overflow_category_id")?,
        staff_role_id,
        questions: questions
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        Some(crate::SupportQuestion {
                            title: item["title"].as_str()?.to_owned(),
                            required: item["required"].as_bool().unwrap_or(false),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
        timezone_offset_minutes: row
            .try_get::<Option<i32>, _>("timezone_offset_minutes")?
            .unwrap_or(0),
        weekly_hours: weekly_windows(&weekly),
        closed_hours: row.try_get("closed_hours")?,
        confirm_close: row.try_get("confirm_close")?,
        inactivity_minutes: row.try_get("inactivity_minutes")?,
        transcript_enabled: row.try_get("transcript_enabled")?,
        log_channel_id: row.try_get("log_channel_id")?,
    }))
}

fn weekly_windows(value: &serde_json::Value) -> Vec<crate::WeeklyWindow> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(crate::WeeklyWindow {
                        weekday: u8::try_from(item["weekday"].as_i64()?).ok()?,
                        start_minute: u16::try_from(item["start_minute"].as_i64()?).ok()?,
                        end_minute: u16::try_from(item["end_minute"].as_i64()?).ok()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
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
            let channel = payload["channel_id"].as_str();
            let rating = payload["rating"]
                .as_i64()
                .and_then(|value| i16::try_from(value).ok());
            let outside = payload["outside_hours"].as_bool().unwrap_or(false);
            let answers = payload
                .get("answers")
                .cloned()
                .unwrap_or_else(|| serde_json::json!([]));
            let transcript_ready = payload["transcript_ready"].as_bool().unwrap_or(false);
            sqlx::query("INSERT INTO query_status.support_ticket (tenant_id,case_id,support_number,member_id,state,version,projection_watermark,last_event_id,channel_id,rating,outside_hours,answers,transcript_ready) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (case_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,projection_watermark=EXCLUDED.projection_watermark,last_event_id=EXCLUDED.last_event_id,channel_id=COALESCE(EXCLUDED.channel_id,query_status.support_ticket.channel_id),rating=COALESCE(EXCLUDED.rating,query_status.support_ticket.rating),outside_hours=EXCLUDED.outside_hours,answers=CASE WHEN EXCLUDED.answers='[]'::jsonb THEN query_status.support_ticket.answers ELSE EXCLUDED.answers END,transcript_ready=EXCLUDED.transcript_ready OR query_status.support_ticket.transcript_ready WHERE query_status.support_ticket.version<EXCLUDED.version")
                .bind(tenant).bind(case_id).bind(number).bind(member).bind(state).bind(version)
                .bind(now).bind(event.event_id).bind(channel).bind(rating).bind(outside).bind(answers).bind(transcript_ready).execute(&mut *tx).await?;
        }
        tx.commit().await
    }

    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn support_tickets(
        &self,
        tenant: Uuid,
    ) -> Result<Vec<SupportTicketStatus>, sqlx::Error> {
        sqlx::query_as("SELECT case_id,tenant_id,member_id,support_number,state,version,projection_watermark,channel_id,rating,outside_hours,answers,transcript_ready FROM query_status.support_ticket WHERE tenant_id=$1 ORDER BY support_number DESC LIMIT 100")
            .bind(tenant).fetch_all(&self.pool).await
    }

    /// # Errors
    /// Devuelve un error de base de datos.
    pub async fn support_ticket(
        &self,
        tenant: Uuid,
        case_id: Uuid,
    ) -> Result<Option<SupportTicketStatus>, sqlx::Error> {
        sqlx::query_as("SELECT case_id,tenant_id,member_id,support_number,state,version,projection_watermark,channel_id,rating,outside_hours,answers,transcript_ready FROM query_status.support_ticket WHERE tenant_id=$1 AND case_id=$2")
            .bind(tenant).bind(case_id).fetch_optional(&self.pool).await
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
