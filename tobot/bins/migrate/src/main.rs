use anyhow::Context;
use tobot_persistence::Migrations;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let database_url = std::env::var("TOBOT_DATABASE_URL").context("missing TOBOT_DATABASE_URL")?;
    let migrations = Migrations::connect(&database_url).await?;
    migrations.migrate().await?;
    Ok(())
}
