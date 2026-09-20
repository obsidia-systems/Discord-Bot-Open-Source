CREATE TABLE installation.event_outbox (
  outbox_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  event_id UUID NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  envelope BYTEA NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
  lease_token UUID,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ
);

CREATE INDEX installation_event_outbox_due
  ON installation.event_outbox (available_at)
  WHERE published_at IS NULL;

CREATE TABLE query_status.event_inbox (
  event_id UUID PRIMARY KEY,
  schema_name TEXT NOT NULL,
  raw_envelope BYTEA NOT NULL,
  stream_position TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE query_status.guild_shell
  ADD COLUMN provider_guild_id TEXT,
  ADD COLUMN installation_generation BIGINT,
  ADD COLUMN capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN last_event_id UUID;
