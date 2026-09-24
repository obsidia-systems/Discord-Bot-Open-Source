CREATE SCHEMA progression;

CREATE TABLE progression.progression_policy (
  policy_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active'))
);

CREATE TABLE progression.progression_policy_revision (
  revision_id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES progression.progression_policy (policy_id),
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  award INTEGER NOT NULL CHECK (award >= 1 AND award <= 100),
  revision BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Published', 'Superseded')),
  published_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, revision)
);
CREATE UNIQUE INDEX progression_one_published
  ON progression.progression_policy_revision (tenant_id) WHERE state = 'Published';

CREATE TABLE progression.xp_ledger_entry (
  entry_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  revision_id UUID NOT NULL REFERENCES progression.progression_policy_revision (revision_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('text')),
  delta INTEGER NOT NULL CHECK (delta >= 0 AND delta <= 100),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  level_before BIGINT NOT NULL CHECK (level_before >= 0),
  level_after BIGINT NOT NULL CHECK (level_after >= level_before),
  decision TEXT NOT NULL CHECK (decision IN ('Awarded', 'Skipped')),
  application_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE progression.event_outbox (
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
CREATE INDEX progression_outbox_due ON progression.event_outbox (available_at) WHERE published_at IS NULL;
