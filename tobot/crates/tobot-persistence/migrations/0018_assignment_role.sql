CREATE SCHEMA assignment;

CREATE TABLE assignment.role_policy (
  policy_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active'))
);

CREATE TABLE assignment.role_policy_revision (
  revision_id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES assignment.role_policy (policy_id),
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  revision BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Published', 'Superseded')),
  published_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, revision)
);
CREATE UNIQUE INDEX assignment_one_published_role
  ON assignment.role_policy_revision (tenant_id) WHERE state = 'Published';

CREATE TABLE assignment.role_relation_claim (
  claim_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('automatic', 'cases', 'security')),
  status TEXT NOT NULL CHECK (status IN ('Active')),
  UNIQUE (tenant_id, guild_id, member_id, role_id, source)
);

CREATE TABLE assignment.role_assignment_intent (
  intent_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  revision_id UUID NOT NULL REFERENCES assignment.role_policy_revision (revision_id),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'Planned', 'Pending', 'Claimed', 'Applying', 'Applied', 'Unchanged', 'Skipped', 'Failed', 'OutcomeUncertain'
  )),
  reason TEXT,
  joined_at TIMESTAMPTZ NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  put_count INTEGER NOT NULL DEFAULT 0 CHECK (put_count >= 0 AND put_count <= 2),
  application_id TEXT NOT NULL,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX assignment_claimable ON assignment.role_assignment_intent (created_at)
  WHERE status IN ('Pending', 'Claimed', 'Applying', 'OutcomeUncertain');

CREATE TABLE assignment.role_assignment_attempt (
  attempt_id UUID PRIMARY KEY,
  intent_id UUID NOT NULL REFERENCES assignment.role_assignment_intent (intent_id),
  lease_token UUID NOT NULL,
  fencing_token BIGINT NOT NULL,
  result_class TEXT NOT NULL CHECK (result_class IN ('Claimed', 'Transmitted', 'Confirmed', 'Failed', 'Skipped', 'Unchanged')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intent_id, fencing_token, result_class)
);

CREATE TABLE assignment.event_outbox (
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
CREATE INDEX assignment_outbox_due ON assignment.event_outbox (available_at) WHERE published_at IS NULL;
