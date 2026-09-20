CREATE TABLE identity.account (
  account_id UUID PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('Active', 'Disabled')),
  credential_generation BIGINT NOT NULL DEFAULT 0 CHECK (credential_generation >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE identity.external_identity (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES identity.account (account_id),
  username TEXT NOT NULL,
  display_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE identity.oauth_credential (
  credential_id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES identity.account (account_id),
  generation BIGINT NOT NULL CHECK (generation > 0),
  access_token_ciphertext BYTEA NOT NULL,
  refresh_token_ciphertext BYTEA NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  UNIQUE (account_id, generation)
);

ALTER TABLE identity.authorization_session
  ADD CONSTRAINT authorization_session_account_fk
  FOREIGN KEY (account_id) REFERENCES identity.account (account_id),
  ADD COLUMN csrf_secret_ciphertext BYTEA NOT NULL;

CREATE INDEX authorization_session_active
  ON identity.authorization_session (account_id, idle_expires_at)
  WHERE revoked_at IS NULL;
