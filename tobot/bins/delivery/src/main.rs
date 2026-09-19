//! Delivery hosts the governed Discord Transport boundary. No public listener
//! is mounted here: its HTTP capability is outbound-only.

use anyhow::Context;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let _token =
        std::env::var("TOBOT_DISCORD_BOT_TOKEN").context("missing TOBOT_DISCORD_BOT_TOKEN")?;
    let _redis_url = std::env::var("TOBOT_REDIS_URL").context("missing TOBOT_REDIS_URL")?;
    info!("delivery starting with governed outbound transport only");
    tokio::signal::ctrl_c().await?;
    Ok(())
}
