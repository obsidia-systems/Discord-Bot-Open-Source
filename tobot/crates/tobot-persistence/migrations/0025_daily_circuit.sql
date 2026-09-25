CREATE TABLE earnings.daily_circuit (
  tenant_id UUID PRIMARY KEY REFERENCES installation.tenant (tenant_id),
  enabled BOOLEAN NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL
);
