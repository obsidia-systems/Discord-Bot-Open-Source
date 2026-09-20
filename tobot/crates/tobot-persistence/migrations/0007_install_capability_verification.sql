ALTER TABLE installation.installation
  ADD COLUMN verification_claimed_until TIMESTAMPTZ,
  ADD COLUMN verification_fencing_token BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN verification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0);

CREATE TABLE installation.module_capability (
  installation_id UUID NOT NULL REFERENCES installation.installation (installation_id),
  module_key TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  health_state TEXT NOT NULL CHECK (
    health_state IN ('Healthy', 'Degraded', 'Blocked', 'Unavailable', 'NotRequired')
  ),
  reason_code TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (installation_id, module_key, capability_key)
);

CREATE INDEX installation_verification_due
  ON installation.installation (verification_claimed_until, created_at)
  WHERE state = 'Verifying';
