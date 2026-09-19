//! Gateway-only Edge process. It intentionally exposes no Discord interaction
//! webhook route; that ingress mode is mutually exclusive with S0.

use anyhow::Context;
use tobot_envelope::EventEnvelope;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let application_id = std::env::var("TOBOT_DISCORD_APPLICATION_ID")
        .context("missing TOBOT_DISCORD_APPLICATION_ID")?;
    let _token =
        std::env::var("TOBOT_DISCORD_BOT_TOKEN").context("missing TOBOT_DISCORD_BOT_TOKEN")?;
    info!(%application_id, ingress = "gateway", "discord edge starting");

    // Twilight Gateway wiring belongs here. The parsed envelope API is kept
    // ready now so provider types never leak into subsequent modules.
    tokio::signal::ctrl_c().await?;
    Ok(())
}

#[allow(dead_code)]
fn validate_gateway_receipt(raw: &[u8]) -> anyhow::Result<()> {
    let parsed = EventEnvelope::parse_s0(raw)?;
    let _key = parsed.event.gateway_deduplication_key();
    Ok(())
}
