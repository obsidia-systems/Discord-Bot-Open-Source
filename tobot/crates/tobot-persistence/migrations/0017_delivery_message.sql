CREATE SCHEMA delivery;

CREATE TABLE delivery.message_intent (
  intent_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  revision_id UUID NOT NULL REFERENCES lifecycle.welcome_revision (revision_id),
  content TEXT NOT NULL,
  nonce VARCHAR(25) NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Claimed', 'Sending', 'Sent', 'Blocked', 'OutcomeUncertain', 'DeadLetter')),
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uncertain_at TIMESTAMPTZ,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  fencing_token BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX delivery_claimable ON delivery.message_intent (created_at) WHERE status IN ('Pending', 'Claimed', 'Sending', 'OutcomeUncertain');

CREATE TABLE delivery.message_attempt (
  attempt_id UUID PRIMARY KEY,
  intent_id UUID NOT NULL REFERENCES delivery.message_intent (intent_id),
  lease_token UUID NOT NULL,
  fencing_token BIGINT NOT NULL,
  result_class TEXT NOT NULL CHECK (result_class IN ('Claimed', 'Transmitted', 'Confirmed', 'Blocked', 'Uncertain', 'DeadLetter')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intent_id, fencing_token)
);

CREATE TABLE delivery.event_outbox (
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
CREATE INDEX delivery_outbox_due ON delivery.event_outbox (available_at) WHERE published_at IS NULL;

CREATE TABLE query_status.welcome_delivery (
  tenant_id UUID PRIMARY KEY,
  intent_id UUID NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  source_occurred_at TIMESTAMPTZ NOT NULL,
  projection_watermark TIMESTAMPTZ NOT NULL,
  last_event_id UUID NOT NULL
);
