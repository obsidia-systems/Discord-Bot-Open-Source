CREATE TABLE earnings.circuit_audit (
  audit_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  actor_account_id UUID NOT NULL,
  credit_enabled BOOLEAN NOT NULL,
  daily_enabled BOOLEAN NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Requested','Applied','Failed')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX earnings_circuit_audit_tenant_time ON earnings.circuit_audit (tenant_id,created_at DESC);
