CREATE TABLE installation.authorization_transaction (
  transaction_id UUID PRIMARY KEY,
  state_hash BYTEA NOT NULL UNIQUE,
  verifier_ciphertext BYTEA NOT NULL,
  account_id UUID NOT NULL,
  session_id UUID NOT NULL,
  provider_guild_id TEXT NOT NULL,
  generation BIGINT NOT NULL CHECK (generation > 0),
  preset TEXT NOT NULL CHECK (preset IN ('GuildInstall', 'UserInstall', 'GuildRepair')),
  redirect_uri TEXT NOT NULL,
  requested_scopes TEXT[] NOT NULL,
  frozen_manifest JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  UNIQUE (provider_guild_id, generation)
);

CREATE INDEX install_authorization_pending
  ON installation.authorization_transaction (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE installation.callback_receipt (
  transaction_id UUID PRIMARY KEY REFERENCES installation.authorization_transaction (transaction_id),
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  provider_guild_hint TEXT,
  permissions_hint TEXT,
  provider_observed_guild_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL
);
