use anyhow::Context;
use tobot_persistence::Store;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let store = Store::connect(&database_url).await?;
    store.migrate().await?;
    Ok(())
}
