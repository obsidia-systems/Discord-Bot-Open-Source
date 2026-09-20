//! Redis Streams adapter. SQL outbox remains publication authority; this
//! adapter is intentionally unable to accept arbitrary topic/path requests.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use redis::{
    AsyncTypedCommands, from_redis_value,
    streams::{StreamReadOptions, StreamReadReply},
};
use thiserror::Error;
use tobot_envelope::EventEnvelope;

pub const EVENT_STREAM: &str = "tobot:events:v1";

#[derive(Debug, Error)]
pub enum BusError {
    #[error("Redis operation failed: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Redis accepted XADD without returning a stream id")]
    MissingStreamId,
    #[error("Redis stream entry contains an invalid envelope encoding")]
    InvalidEnvelope,
}

#[derive(Clone)]
pub struct RedisStreamPublisher {
    client: redis::Client,
}

pub struct BusMessage {
    pub stream_id: String,
    pub envelope: Vec<u8>,
}

#[derive(Clone)]
pub struct RedisStreamConsumer {
    client: redis::Client,
    group: String,
    consumer: String,
}

impl RedisStreamPublisher {
    /// # Errors
    ///
    /// Returns an error for an invalid Redis URL.
    pub fn connect(redis_url: &str) -> Result<Self, BusError> {
        Ok(Self {
            client: redis::Client::open(redis_url)?,
        })
    }

    /// Publishes an already-committed canonical fact. The caller must mark its
    /// own outbox row only after this method succeeds.
    ///
    /// # Errors
    ///
    /// Returns the Redis error without treating the fact as published.
    pub async fn publish(&self, event: &EventEnvelope, raw: &[u8]) -> Result<String, BusError> {
        let mut connection = self.client.get_multiplexed_async_connection().await?;
        let id: Option<String> = connection
            .xadd(
                EVENT_STREAM,
                "*",
                &[
                    ("event_id", event.event_id.to_string()),
                    ("schema_name", event.schema_name.clone()),
                    ("schema_version", event.schema_version.to_string()),
                    ("application_id", event.application_id.clone()),
                    ("envelope", URL_SAFE_NO_PAD.encode(raw)),
                ],
            )
            .await?;
        id.ok_or(BusError::MissingStreamId)
    }
}

impl RedisStreamConsumer {
    /// # Errors
    ///
    /// Returns an error for an invalid Redis URL.
    pub fn connect(redis_url: &str, group: &str, consumer: &str) -> Result<Self, BusError> {
        Ok(Self {
            client: redis::Client::open(redis_url)?,
            group: group.to_owned(),
            consumer: consumer.to_owned(),
        })
    }

    /// Creates the durable group when absent and reads new messages.
    ///
    /// # Errors
    ///
    /// Returns a Redis error or a malformed-message error.
    pub async fn read(&self) -> Result<Vec<BusMessage>, BusError> {
        let mut connection = self.client.get_multiplexed_async_connection().await?;
        let create: redis::RedisResult<()> = connection
            .xgroup_create_mkstream(EVENT_STREAM, &self.group, "0")
            .await;
        if let Err(error) = create
            && !error.to_string().contains("BUSYGROUP")
        {
            return Err(BusError::Redis(error));
        }
        let options = StreamReadOptions::default()
            .group(&self.group, &self.consumer)
            .count(50)
            .block(1_000);
        let reply: Option<StreamReadReply> = connection
            .xread_options(&[EVENT_STREAM], &[">"], &options)
            .await?;
        let mut messages = Vec::new();
        for key in reply.unwrap_or_default().keys {
            for entry in key.ids {
                let Some(value) = entry.map.get("envelope") else {
                    continue;
                };
                let encoded: String =
                    from_redis_value(value.clone()).map_err(|_| BusError::InvalidEnvelope)?;
                let envelope = URL_SAFE_NO_PAD
                    .decode(encoded)
                    .map_err(|_| BusError::InvalidEnvelope)?;
                messages.push(BusMessage {
                    stream_id: entry.id,
                    envelope,
                });
            }
        }
        Ok(messages)
    }

    /// # Errors
    ///
    /// Returns a Redis error if the durable group receipt cannot be recorded.
    pub async fn acknowledge(&self, stream_id: &str) -> Result<(), BusError> {
        let mut connection = self.client.get_multiplexed_async_connection().await?;
        let _: usize = connection
            .xack(EVENT_STREAM, &self.group, &[stream_id])
            .await?;
        Ok(())
    }
}
