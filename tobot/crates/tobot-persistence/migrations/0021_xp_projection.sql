CREATE TABLE query_status.xp_member (
  tenant_id UUID PRIMARY KEY,
  member_id TEXT NOT NULL,
  revision_id UUID NOT NULL,
  balance BIGINT NOT NULL,
  level BIGINT NOT NULL,
  source_message_id TEXT NOT NULL,
  source_occurred_at TIMESTAMPTZ NOT NULL,
  projection_watermark TIMESTAMPTZ NOT NULL,
  last_event_id UUID NOT NULL
);
