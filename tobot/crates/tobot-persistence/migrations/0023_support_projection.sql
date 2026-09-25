CREATE TABLE query_status.support_ticket (
  tenant_id UUID NOT NULL,
  case_id UUID NOT NULL PRIMARY KEY,
  support_number BIGINT NOT NULL,
  member_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Open', 'Claimed', 'Closed')),
  version BIGINT NOT NULL,
  projection_watermark TIMESTAMPTZ NOT NULL,
  last_event_id UUID NOT NULL,
  UNIQUE (tenant_id, support_number)
);
