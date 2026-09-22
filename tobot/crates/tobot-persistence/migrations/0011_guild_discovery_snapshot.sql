CREATE TABLE identity.guild_discovery_snapshot (
  account_id UUID PRIMARY KEY REFERENCES identity.account (account_id),
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > observed_at)
);
