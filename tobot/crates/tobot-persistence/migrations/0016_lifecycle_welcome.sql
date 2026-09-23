CREATE SCHEMA lifecycle;

CREATE TABLE lifecycle.welcome_revision (
  revision_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  revision BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Published', 'Superseded')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, revision)
);
CREATE UNIQUE INDEX lifecycle_one_published_welcome ON lifecycle.welcome_revision (tenant_id) WHERE state = 'Published';

CREATE TABLE lifecycle.join_decision (
  decision_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  revision_id UUID REFERENCES lifecycle.welcome_revision (revision_id),
  status TEXT NOT NULL CHECK (status IN ('Reserved', 'Suppressed', 'Requested')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lifecycle.event_outbox (
  outbox_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  event_id UUID NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  envelope BYTEA NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  publish_attempts INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ
);
CREATE INDEX lifecycle_outbox_due ON lifecycle.event_outbox (available_at) WHERE published_at IS NULL;
