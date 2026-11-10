//! Canal privado, permisos, transcripción y mantenimiento del ticket.

use sqlx::Row;
use time::OffsetDateTime;
use tobot_delivery_client::SupportDeliveryClient;
use tobot_persistence::{
    IntakeAnswer, SupportCase, SupportStore, ticket_channel_name, transcript_html,
};
use tracing::{info, warn};
use uuid::Uuid;

use super::AppState;

#[allow(clippy::too_many_arguments)]
pub(super) async fn provision_case(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    tenant: Uuid,
    guild: &str,
    application: &str,
    case_id: Uuid,
    member_id: &str,
    number: i64,
) -> anyhow::Result<Option<String>> {
    let Some(row) = store.case_desk(tenant, case_id).await? else {
        return Ok(None);
    };
    let state: String = row.try_get("state")?;
    if let Some(channel) = row.try_get::<Option<String>, _>("resource_channel_id")? {
        return Ok(Some(channel));
    }
    if state != "Provisioning" {
        return Ok(None);
    }
    let Some(category) = row.try_get::<Option<String>, _>("category_id")? else {
        return Ok(None);
    };
    let Some(staff) = row.try_get::<Option<String>, _>("staff_role_id")? else {
        return Ok(None);
    };
    let overflow: Option<String> = row.try_get("overflow_category_id")?;
    let channel = match delivery
        .create_channel(
            guild,
            &ticket_channel_name(number),
            &category,
            overflow.as_deref(),
            member_id,
            &staff,
        )
        .await
    {
        Ok(channel) => channel,
        Err(error) => {
            warn!(%error, %case_id, "ticket channel was not created");
            return Ok(None);
        }
    };
    if store
        .bind_channel(
            tenant,
            guild,
            application,
            case_id,
            &channel,
            OffsetDateTime::now_utc(),
        )
        .await?
        .is_none()
    {
        let _ = delivery.delete_channel(&channel).await;
        return Ok(None);
    }
    let lines = store.intake_lines(case_id).await?;
    let mut content = format!("Ticket #{number} is open.");
    if row.try_get::<bool, _>("outside_hours")? {
        content.push_str(" Support is outside its usual hours.");
    }
    for (question, answer) in lines {
        let question = question.replace(['@', '\n'], " ");
        let answer = answer.replace(['@', '\n'], " ");
        content.push('\n');
        content.push_str(&question);
        content.push_str(": ");
        content.push_str(&answer);
    }
    let id = case_id.to_string();
    let claim = format!("support-staff:claim:{id}");
    let close = format!("support-staff:close:{id}");
    let transcript = format!("support-staff:transcript:{id}");
    if let Err(error) = delivery
        .post_message(
            &channel,
            &content,
            &[
                (claim.as_str(), "Claim"),
                (close.as_str(), "Close"),
                (transcript.as_str(), "Transcript"),
            ],
        )
        .await
    {
        warn!(%error, %case_id, "ticket control message was not posted");
    }
    Ok(Some(channel))
}

pub(super) async fn sync_access(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    tenant: Uuid,
    case_id: Uuid,
    mode: &str,
    member_id: Option<&str>,
) {
    let Ok(Some(row)) = store.case_desk(tenant, case_id).await else {
        return;
    };
    let Ok(Some(channel)) = row.try_get::<Option<String>, _>("resource_channel_id") else {
        return;
    };
    let Ok(Some(staff)) = row.try_get::<Option<String>, _>("staff_role_id") else {
        return;
    };
    if let Err(error) = delivery.set_access(&channel, &staff, member_id, mode).await {
        warn!(%error, %case_id, mode, "ticket access was not updated");
    }
}

pub(super) async fn finish_closed(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    tenant: Uuid,
    guild: &str,
    application: &str,
    case_id: Uuid,
) {
    let Ok(Some(row)) = store.case_desk(tenant, case_id).await else {
        return;
    };
    let Ok(state) = row.try_get::<String, _>("state") else {
        return;
    };
    if state != "Closed" && state != "Closing" {
        return;
    }
    let Ok(Some(channel)) = row.try_get::<Option<String>, _>("resource_channel_id") else {
        return;
    };
    let Ok(Some(staff)) = row.try_get::<Option<String>, _>("staff_role_id") else {
        return;
    };
    let member: String = row.try_get("member_id").unwrap_or_default();
    let _ = delivery
        .set_access(&channel, &staff, Some(member.as_str()), "closed")
        .await;
    let transcript_enabled: bool = row.try_get("transcript_enabled").unwrap_or(false);
    let number: i64 = row.try_get("support_number").unwrap_or(0);
    if transcript_enabled {
        store_transcript(
            store,
            delivery,
            tenant,
            guild,
            application,
            case_id,
            &channel,
            &row,
            number,
        )
        .await;
        let stored = store
            .transcript_html(tenant, case_id)
            .await
            .ok()
            .flatten()
            .is_some();
        if !stored {
            return;
        }
    }
    let rated = row
        .try_get::<Option<i16>, _>("rating")
        .ok()
        .flatten()
        .is_some();
    if !rated {
        ask_rating(store, delivery, case_id, &member, number).await;
    }
    match delivery.delete_channel(&channel).await {
        Ok(()) => {
            if let Err(error) = store
                .mark_channel_deleted(case_id, OffsetDateTime::now_utc())
                .await
            {
                warn!(%error, %case_id, "deleted ticket channel was not recorded");
            }
        }
        Err(error) => warn!(%error, %case_id, "closed ticket channel remains for retry"),
    }
}

async fn ask_rating(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    case_id: Uuid,
    member: &str,
    number: i64,
) {
    let claimed = store
        .claim_rating_prompt(case_id, OffsetDateTime::now_utc())
        .await
        .unwrap_or(false);
    if !claimed {
        return;
    }
    let id = case_id.to_string();
    let buttons: Vec<(String, String)> = (1..=5)
        .map(|score| (format!("support-rate:{id}:{score}"), score.to_string()))
        .collect();
    let refs: Vec<(&str, &str)> = buttons
        .iter()
        .map(|(custom_id, label)| (custom_id.as_str(), label.as_str()))
        .collect();
    if let Err(error) = delivery
        .direct_message(member, &format!("Rate ticket #{number} from 1 to 5."), &refs)
        .await
    {
        warn!(%error, %case_id, "ticket rating could not be delivered");
        let _ = store.release_rating_prompt(case_id).await;
    }
}

#[allow(clippy::too_many_arguments)]
async fn store_transcript(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
    tenant: Uuid,
    guild: &str,
    application: &str,
    case_id: Uuid,
    channel: &str,
    row: &sqlx::postgres::PgRow,
    number: i64,
) {
    if let Ok(messages) = delivery.messages(channel).await {
        let now = OffsetDateTime::now_utc();
        for message in messages {
            let body = if message.body.is_empty() {
                None
            } else {
                Some(message.body.as_str())
            };
            let _ = store
                .observe_message(channel, &message.message_id, &message.author_id, body, now)
                .await;
        }
    }
    let Ok(lines) = store.transcript_lines(case_id).await else {
        return;
    };
    let (html, coverage) = transcript_html(number, &lines);
    if store
        .save_transcript(
            tenant,
            guild,
            application,
            case_id,
            &html,
            coverage,
            OffsetDateTime::now_utc(),
        )
        .await
        .ok()
        .flatten()
        .is_none()
    {
        return;
    }
    if let Ok(Some(log_channel)) = row.try_get::<Option<String>, _>("log_channel_id")
        && let Err(error) = delivery
            .post_message(
                &log_channel,
                &format!("Transcript for ticket #{number} is stored for this server."),
                &[],
            )
            .await
    {
        warn!(%error, %case_id, "ticket transcript log was not posted");
    }
}

pub(super) fn opened_text(case: &SupportCase, channel: Option<&str>) -> String {
    let place = channel.map(|id| format!(" in <#{id}>")).unwrap_or_default();
    let hours = if case.outside_hours {
        " Support is outside its usual hours."
    } else {
        ""
    };
    format!("Ticket #{} is open{place}.{hours}", case.support_number)
}

pub(super) async fn maintain(
    store: &SupportStore,
    delivery: &SupportDeliveryClient,
) -> anyhow::Result<()> {
    for row in store.provisioning_cases().await? {
        let tenant: Uuid = row.try_get("tenant_id")?;
        let case_id: Uuid = row.try_get("case_id")?;
        let guild: String = row.try_get("guild_id")?;
        let application: String = row.try_get("application_id")?;
        let member: String = row.try_get("member_id")?;
        let number: i64 = row.try_get("support_number")?;
        provision_case(
            store,
            delivery,
            tenant,
            &guild,
            &application,
            case_id,
            &member,
            number,
        )
        .await?;
    }
    let now = OffsetDateTime::now_utc();
    for row in store.inactivity_cases().await? {
        let minutes: i32 = row.try_get("inactivity_minutes")?;
        let Some(last) = row.try_get::<Option<OffsetDateTime>, _>("last_activity_at")? else {
            continue;
        };
        let case_id: Uuid = row.try_get("case_id")?;
        let channel: String = row.try_get("resource_channel_id")?;
        let warned = row.try_get::<Option<OffsetDateTime>, _>("warning_sent_at")?;
        let warn_at = last + time::Duration::minutes(i64::from(minutes) / 2);
        let close_at = last + time::Duration::minutes(i64::from(minutes));
        if warned.is_none() && now >= warn_at {
            if delivery
                .post_message(
                    &channel,
                    "This ticket will close soon because nobody has written.",
                    &[],
                )
                .await
                .is_ok()
            {
                let _ = store.mark_inactivity_warning(case_id, now).await;
            }
            continue;
        }
        if warned.is_some() && now >= close_at {
            let tenant: Uuid = row.try_get("tenant_id")?;
            let guild: String = row.try_get("guild_id")?;
            let application: String = row.try_get("application_id")?;
            let version: i64 = row.try_get("version")?;
            if let Some(closed) = store
                .transition(
                    tenant,
                    &guild,
                    &application,
                    case_id,
                    version,
                    Uuid::nil(),
                    true,
                    now,
                )
                .await?
            {
                info!(%case_id, "ticket closed for inactivity");
                finish_closed(
                    store,
                    delivery,
                    tenant,
                    &guild,
                    &application,
                    closed.case_id,
                )
                .await;
            }
        }
    }
    for row in store.channels_pending_delete().await? {
        let tenant: Uuid = row.try_get("tenant_id")?;
        let guild: String = row.try_get("guild_id")?;
        let application: String = row.try_get("application_id")?;
        let case_id: Uuid = row.try_get("case_id")?;
        finish_closed(store, delivery, tenant, &guild, &application, case_id).await;
    }
    Ok(())
}

pub(super) fn form_answers(
    payload: &serde_json::Value,
    questions: &[tobot_persistence::SupportQuestion],
) -> Vec<IntakeAnswer> {
    let submitted = payload["answers"].as_array().cloned().unwrap_or_default();
    questions
        .iter()
        .enumerate()
        .map(|(index, question)| IntakeAnswer {
            question: question.title.clone(),
            answer: submitted
                .get(index)
                .and_then(|item| item["answer"].as_str())
                .unwrap_or("")
                .to_owned(),
        })
        .collect()
}

pub(super) async fn categories(
    state: &AppState,
    guild: &str,
) -> Result<Vec<tobot_discord_adapter::TextChannel>, tobot_discord_adapter::TransportError> {
    state.support_delivery.categories(guild).await
}
