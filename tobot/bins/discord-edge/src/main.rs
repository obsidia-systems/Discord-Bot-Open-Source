//! Gateway-only Discord Edge. It has no public interaction-webhook listener.

use anyhow::Context;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tobot_delivery_client::InternalDeliveryTransport;
use tobot_discord_adapter::InteractionCallback;
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_interaction_edge::{InteractionEdge, InteractionIngressRequest, ProbeAcknowledgement};
use tobot_persistence::Store;
use tracing::{info, warn};
use twilight_gateway::{Event, EventTypeFlags, Intents, Shard, ShardId, StreamExt as _};
use twilight_model::gateway::payload::incoming::InteractionCreate;
use uuid::Uuid;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let application_id = std::env::var("TOBOT_DISCORD_APPLICATION_ID")
        .context("missing TOBOT_DISCORD_APPLICATION_ID")?;
    let bot_token =
        std::env::var("TOBOT_DISCORD_BOT_TOKEN").context("missing TOBOT_DISCORD_BOT_TOKEN")?;
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let delivery_url = std::env::var("TOBOT_DELIVERY_URL").context("missing TOBOT_DELIVERY_URL")?;
    let internal_service_token = std::env::var("TOBOT_INTERNAL_SERVICE_TOKEN")
        .context("missing TOBOT_INTERNAL_SERVICE_TOKEN")?;
    let store = Store::connect(&database_url)
        .await
        .context("discord edge database unavailable")?;
    let delivery_transport = InternalDeliveryTransport::new(&delivery_url, internal_service_token)
        .context("invalid Delivery transport configuration")?;
    let interaction_edge = InteractionEdge::new(store.clone(), delivery_transport);
    let mut shard = Shard::new(ShardId::ONE, bot_token, Intents::GUILDS);

    info!(%application_id, ingress = "gateway", shard = 0, "discord edge starting");
    while let Some(next_event) = shard.next_event(EventTypeFlags::all()).await {
        let event = match next_event {
            Ok(event) => event,
            Err(error) => {
                warn!(error = %error, shard = shard.id().number(), "gateway event error");
                continue;
            }
        };

        let Event::InteractionCreate(interaction) = event else {
            continue;
        };
        let Some(session) = shard.session() else {
            warn!(
                shard = shard.id().number(),
                "interaction received without a gateway session"
            );
            continue;
        };

        if let Err(error) = accept_interaction(
            &interaction_edge,
            &store,
            &application_id,
            shard.id().number(),
            session.id(),
            session.sequence(),
            *interaction,
        )
        .await
        {
            warn!(error = %error, shard = shard.id().number(), "interaction ingress failed");
        }
    }

    Ok(())
}

async fn accept_interaction(
    interaction_edge: &InteractionEdge<InternalDeliveryTransport>,
    store: &Store,
    configured_application_id: &str,
    shard_id: u32,
    session_id: &str,
    gateway_sequence: u64,
    interaction: InteractionCreate,
) -> anyhow::Result<()> {
    let interaction = interaction.0;
    let application_id = interaction.application_id.to_string();
    if application_id != configured_application_id {
        anyhow::bail!("received interaction for an unexpected application");
    }
    let guild_id = interaction
        .guild_id
        .map(|id| id.to_string())
        .context("S0 diagnostic interaction must originate from a guild")?;
    let context = store
        .resolve_active_guild_tenant(&application_id, &guild_id)
        .await?
        .context("interaction belongs to no active installed guild")?;
    let now = OffsetDateTime::now_utc();
    let timestamp = now.format(&Rfc3339)?;
    let correlation_id = Uuid::now_v7();
    let gateway_event_id = Uuid::now_v7();
    let gateway_event = EventEnvelope {
        event_id: gateway_event_id,
        schema_name: "GatewayEventAccepted".to_owned(),
        schema_version: 1,
        occurred_at: timestamp.clone(),
        received_at: timestamp,
        application_id,
        tenant_id: Some(context.tenant_id.as_uuid()),
        guild_id: Some(guild_id),
        shard_id: Some(shard_id),
        session_id: Some(session_id.to_owned()),
        gateway_sequence: Some(gateway_sequence),
        correlation_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        // Do not persist Discord's interaction token or the unbounded raw
        // Gateway payload. The provider identifiers are sufficient for S0.
        payload: serde_json::json!({
            "interaction_id": interaction.id.to_string(),
            "kind": "S0DiagnosticInteraction"
        }),
    };
    let interaction_event = EventEnvelope {
        event_id: Uuid::now_v7(),
        schema_name: "InteractionAccepted".to_owned(),
        schema_version: 1,
        occurred_at: gateway_event.occurred_at.clone(),
        received_at: gateway_event.received_at.clone(),
        application_id: gateway_event.application_id.clone(),
        tenant_id: gateway_event.tenant_id,
        guild_id: gateway_event.guild_id.clone(),
        shard_id: gateway_event.shard_id,
        session_id: gateway_event.session_id.clone(),
        gateway_sequence: gateway_event.gateway_sequence,
        correlation_id,
        causation_id: Some(gateway_event_id),
        trace_context: TraceContext {
            trace_id: correlation_id.to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: gateway_event.payload.clone(),
    };
    let gateway_raw = serde_json::to_vec(&gateway_event)?;
    let interaction_raw = serde_json::to_vec(&interaction_event)?;
    let callback = InteractionCallback {
        application_id: interaction.application_id.get(),
        interaction_id: interaction.id.get(),
        interaction_token: interaction.token,
        ephemeral: true,
    };
    let outcome = interaction_edge
        .accept_and_acknowledge(InteractionIngressRequest {
            context,
            callback,
            gateway_event: &gateway_event,
            gateway_raw: &gateway_raw,
            interaction_event: &interaction_event,
            interaction_raw: &interaction_raw,
            acknowledgement: ProbeAcknowledgement::Deferred,
            now,
        })
        .await?;
    info!(?outcome, event_id = %interaction_event.event_id, "interaction receipt processed");
    Ok(())
}
