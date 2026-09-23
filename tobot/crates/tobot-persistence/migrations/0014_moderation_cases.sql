CREATE SCHEMA IF NOT EXISTS moderation;

CREATE TABLE moderation.policy (
  policy_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES installation.tenant (tenant_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE moderation.policy_revision (
  policy_revision_id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES moderation.policy (policy_id),
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  protected_targets JSONB NOT NULL,
  actor_capabilities JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE moderation.case (
  case_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  display_number BIGINT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('timeout', 'remove_timeout')),
  status TEXT NOT NULL CHECK (status IN (
    'Requested', 'Rejected', 'Authorized', 'Executing', 'Applied', 'Failed',
    'OutcomeUncertain', 'Compensated', 'Closed', 'Unresolved'
  )),
  actor_provider_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_label TEXT NOT NULL,
  reason TEXT NOT NULL,
  duration_seconds BIGINT,
  expires_at TIMESTAMPTZ,
  policy_revision_id UUID NOT NULL REFERENCES moderation.policy_revision (policy_revision_id),
  idempotency_key TEXT NOT NULL,
  interaction_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  incident_id UUID,
  correlation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, display_number)
);

CREATE TABLE moderation.case_event (
  case_event_id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES moderation.case (case_id),
  sequence_number BIGINT NOT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (case_id, sequence_number)
);

CREATE TABLE moderation.action_receipt (
  receipt_id UUID PRIMARY KEY,
  case_id UUID NOT NULL UNIQUE REFERENCES moderation.case (case_id),
  request_id UUID NOT NULL,
  fencing_token BIGINT NOT NULL,
  result_class TEXT NOT NULL CHECK (result_class IN ('NotSent', 'Transmitted', 'Confirmed', 'Uncertain', 'Blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE moderation.event_outbox (
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

CREATE INDEX moderation_event_outbox_due
  ON moderation.event_outbox (available_at)
  WHERE published_at IS NULL;
