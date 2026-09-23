ALTER TABLE identity.audit_event DROP CONSTRAINT audit_event_outcome_check;

ALTER TABLE identity.audit_event
  ADD CONSTRAINT audit_event_outcome_check CHECK (outcome IN (
    'oauth_rejected',
    'install_rejected',
    'repair_admitted',
    'session_revoked',
    'login_succeeded',
    'login_rejected',
    'session_idle_expired',
    'session_absolute_expired'
  ));
