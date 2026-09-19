//! Redis Streams adapter. SQL outbox remains publication authority; this
//! adapter is intentionally unable to accept arbitrary topic/path requests.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use redis::AsyncTypedCommands;
use thiserror::Error;
use tobot_envelope::EventEnvelope;

pub const EVENT_STREAM: &str = "tobot:events:v1";

#[derive(Debug, Error)]
pub enum BusError {
    #[error("Redis operation failed: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Redis accepted XADD without returning a stream id")]
    MissingStreamId,
}

#[derive(Clone)]
pub struct RedisStreamPublisher {
    client: redis::Client,
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
