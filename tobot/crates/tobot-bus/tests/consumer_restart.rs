//! A consumer that dies before acknowledging must see the same stream entry
//! again when the process restarts under the same group and consumer name.

use std::env;

use redis::AsyncTypedCommands;
use tobot_bus::{EVENT_STREAM, RedisStreamConsumer, RedisStreamPublisher};
use tobot_envelope::{EventEnvelope, TraceContext};
use uuid::Uuid;

#[tokio::test]
async fn restarted_consumer_rereads_its_unacknowledged_entry() -> Result<(), String> {
    let Some(url) = test_redis_url()? else {
        return Ok(());
    };
    let client = redis::Client::open(url.as_str()).map_err(|error| error.to_string())?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| error.to_string())?;
    let _: usize = connection
        .del(EVENT_STREAM)
        .await
        .map_err(|error| error.to_string())?;

    let publisher = RedisStreamPublisher::connect(&url).map_err(|error| error.to_string())?;
    let event = installation_fact();
    let raw = serde_json::to_vec(&event).map_err(|error| error.to_string())?;
    publisher
        .publish(&event, &raw)
        .await
        .map_err(|error| error.to_string())?;

    let group = format!("query-status-{}", Uuid::now_v7());
    let consumer_name = "query-status";
    let first = RedisStreamConsumer::connect(&url, &group, consumer_name)
        .map_err(|error| error.to_string())?;
    let delivered = first.read().await.map_err(|error| error.to_string())?;
    let stream_id = delivered
        .first()
        .map(|message| message.stream_id.clone())
        .ok_or_else(|| "published fact was not delivered".to_owned())?;

    let restarted = RedisStreamConsumer::connect(&url, &group, consumer_name)
        .map_err(|error| error.to_string())?;
    let pending = restarted.read().await.map_err(|error| error.to_string())?;
    let pending_id = pending
        .first()
        .map(|message| message.stream_id.clone())
        .ok_or_else(|| "restarted consumer skipped its pending entry".to_owned())?;
    if pending_id != stream_id {
        return Err("restarted consumer read a different stream entry".to_owned());
    }
    restarted
        .acknowledge(&pending_id)
        .await
        .map_err(|error| error.to_string())?;
    let after_ack = restarted.read().await.map_err(|error| error.to_string())?;
    if !after_ack.is_empty() {
        return Err("acknowledged entry was delivered again".to_owned());
    }
    Ok(())
}

fn test_redis_url() -> Result<Option<String>, String> {
    let Ok(url) = env::var("TOBOT_TEST_REDIS_URL") else {
        if env::var("TOBOT_REQUIRE_REDIS").is_ok() {
            return Err("TOBOT_TEST_REDIS_URL is required".to_owned());
        }
        return Ok(None);
    };
    let database = url
        .split('?')
        .next()
        .and_then(|path| path.rsplit('/').next())
        .unwrap_or("0");
    if database != "1" {
        return Err("refusing to run the consumer restart against Redis database 0".to_owned());
    }
    Ok(Some(url))
}

fn installation_fact() -> EventEnvelope {
    let event_id = Uuid::now_v7();
    EventEnvelope {
        event_id,
        schema_name: "InstallationStateChanged".to_owned(),
        schema_version: 1,
        occurred_at: "2026-09-22T08:20:18Z".to_owned(),
        received_at: "2026-09-22T08:20:18Z".to_owned(),
        application_id: "app".to_owned(),
        tenant_id: Some(event_id),
        guild_id: Some("guild".to_owned()),
        shard_id: None,
        session_id: None,
        gateway_sequence: None,
        correlation_id: event_id,
        causation_id: None,
        trace_context: TraceContext {
            trace_id: event_id.to_string(),
            span_id: event_id.to_string(),
        },
        payload: serde_json::json!({ "generation": 1, "state": "Verifying" }),
    }
}
