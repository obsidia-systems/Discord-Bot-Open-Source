CREATE TABLE identity.audit_event (
  audit_id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  account_id UUID,
  session_id UUID,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'oauth_rejected',
    'install_rejected',
    'repair_admitted',
    'session_revoked'
  )),
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 64),
  subject_ref TEXT CHECK (subject_ref IS NULL OR char_length(subject_ref) BETWEEN 1 AND 64)
);

CREATE INDEX identity_audit_event_occurred
  ON identity.audit_event (occurred_at);
