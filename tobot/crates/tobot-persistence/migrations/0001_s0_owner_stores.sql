CREATE SCHEMA IF NOT EXISTS edge;
CREATE SCHEMA IF NOT EXISTS installation;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS query_status;

CREATE TABLE edge.event_inbox (
  event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  schema_name TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  raw_envelope BYTEA NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edge.event_outbox (
  outbox_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
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

CREATE INDEX edge_event_outbox_due ON edge.event_outbox (available_at) WHERE published_at IS NULL;

CREATE TABLE edge.interaction_receipt (
  receipt_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  interaction_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Reserved', 'Acknowledged', 'Deferred', 'Expired', 'Failed')),
  acknowledgement_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE (tenant_id, interaction_id)
);

CREATE TABLE installation.tenant (
  tenant_id UUID PRIMARY KEY,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('Guild', 'User')),
  provider_tenant_ref TEXT NOT NULL,
  application_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Active', 'Removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_type, provider_tenant_ref, application_id)
);

CREATE TABLE installation.installation (
  installation_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  generation BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Pending', 'Verifying', 'Installed', 'Degraded', 'Removed')),
  manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, generation)
);

CREATE TABLE identity.oauth_transaction (
  transaction_id UUID PRIMARY KEY,
  state_hash BYTEA NOT NULL UNIQUE,
  verifier_ciphertext BYTEA NOT NULL,
  redirect_uri TEXT NOT NULL,
  requested_scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE identity.authorization_session (
  session_id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  credential_generation BIGINT NOT NULL,
  csrf_secret_hash BYTEA NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE query_status.guild_shell (
  tenant_id UUID PRIMARY KEY,
  installation_state TEXT NOT NULL,
  health_state TEXT NOT NULL,
  projection_watermark TIMESTAMPTZ NOT NULL,
  probe_state TEXT NOT NULL
);
