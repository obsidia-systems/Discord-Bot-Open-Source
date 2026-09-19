//! Delivery hosts the governed Discord Transport boundary. No public listener
//! is mounted here: its HTTP capability is outbound-only.

use anyhow::Context;
use time::OffsetDateTime;
use tobot_bus::RedisStreamPublisher;
use tobot_outbox::EdgeOutboxRelay;
use tobot_persistence::Store;
use tracing::{error, info};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter("info")
        .init();
    let _token =
        std::env::var("TOBOT_DISCORD_BOT_TOKEN").context("missing TOBOT_DISCORD_BOT_TOKEN")?;
    let redis_url = std::env::var("TOBOT_REDIS_URL").context("missing TOBOT_REDIS_URL")?;
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let store = Store::connect(&database_url).await?;
    let publisher = RedisStreamPublisher::connect(&redis_url)?;
    let relay = EdgeOutboxRelay::new(store, publisher);
    info!("delivery starting with governed outbound transport only");
    loop {
        tokio::select! {
            result = relay.relay_once(OffsetDateTime::now_utc(), 100) => match result {
                Ok(0) => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
                Ok(count) => info!(count, "relayed edge outbox facts"),
                Err(error) => {
                    error!(error = %error, "outbox relay failed; leased work will be recovered");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            },
            signal = tokio::signal::ctrl_c() => {
                signal?;
                break;
            }
        }
    }
    Ok(())
}
