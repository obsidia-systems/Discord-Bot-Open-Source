CREATE TABLE query_status.role_assignment (
  tenant_id UUID PRIMARY KEY,
  intent_id UUID NOT NULL,
  role_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL,
  source_occurred_at TIMESTAMPTZ NOT NULL,
  projection_watermark TIMESTAMPTZ NOT NULL,
  last_event_id UUID NOT NULL
);
