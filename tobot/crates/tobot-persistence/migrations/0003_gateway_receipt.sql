CREATE TABLE edge.gateway_receipt (
  application_id TEXT NOT NULL,
  shard_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  gateway_sequence BIGINT NOT NULL,
  event_id UUID NOT NULL UNIQUE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (application_id, shard_id, session_id, gateway_sequence)
);
