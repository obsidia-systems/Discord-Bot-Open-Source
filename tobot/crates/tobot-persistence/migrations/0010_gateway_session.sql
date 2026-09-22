CREATE TABLE edge.gateway_session (
  shard_id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence >= 0),
  resume_gateway_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
