CREATE TABLE identity.guild_discovery_observation (
  account_id UUID NOT NULL REFERENCES identity.account (account_id),
  provider_guild_id TEXT NOT NULL,
  guild_name TEXT NOT NULL,
  icon_hash TEXT,
  owner_hint BOOLEAN NOT NULL,
  permissions_hint TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, provider_guild_id),
  CHECK (expires_at > observed_at)
);

CREATE INDEX guild_discovery_fresh_by_account
  ON identity.guild_discovery_observation (account_id, expires_at DESC);
