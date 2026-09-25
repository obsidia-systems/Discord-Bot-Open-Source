CREATE SCHEMA earnings;

CREATE TABLE earnings.daily_policy_revision (
  revision_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  currency_revision_id UUID NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 9000000000000),
  cooldown_seconds INTEGER NOT NULL CHECK (cooldown_seconds = 86400),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  state TEXT NOT NULL CHECK (state IN ('Published','Superseded')),
  published_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, revision)
);
CREATE UNIQUE INDEX earnings_one_daily_published ON earnings.daily_policy_revision (tenant_id) WHERE state='Published';

CREATE TABLE earnings.income_action (
  action_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  interaction_id TEXT NOT NULL,
  policy_revision_id UUID NOT NULL REFERENCES earnings.daily_policy_revision (revision_id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  ledger_key UUID NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('Pending','Settled','Rejected')),
  next_available_at TIMESTAMPTZ NOT NULL,
  admitted_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  ledger_transaction_id UUID,
  balance_after BIGINT,
  rejection_code TEXT,
  claim_token UUID,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ,
  UNIQUE (tenant_id, interaction_id)
);
CREATE UNIQUE INDEX earnings_one_pending_daily ON earnings.income_action (tenant_id,member_id) WHERE state='Pending';
CREATE INDEX earnings_pending_due ON earnings.income_action (admitted_at) WHERE state='Pending';

CREATE TABLE earnings.event_outbox (
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
CREATE INDEX earnings_outbox_due ON earnings.event_outbox (available_at) WHERE published_at IS NULL;

CREATE TABLE query_status.wallet (
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  member_id TEXT NOT NULL,
  currency_id UUID NOT NULL,
  balance BIGINT NOT NULL CHECK (balance >= 0),
  journal_sequence BIGINT NOT NULL CHECK (journal_sequence > 0),
  projection_watermark TIMESTAMPTZ NOT NULL,
  last_event_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, member_id)
);
