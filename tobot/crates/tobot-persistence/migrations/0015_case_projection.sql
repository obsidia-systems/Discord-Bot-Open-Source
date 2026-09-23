CREATE TABLE query_status.moderation_case (
  case_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  display_number BIGINT NOT NULL,
  action TEXT NOT NULL,
  target_label TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  actor_provider_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  projection_watermark TIMESTAMPTZ NOT NULL,
  last_event_id UUID NOT NULL,
  UNIQUE (tenant_id, display_number)
);

CREATE INDEX query_status_moderation_case_tenant
  ON query_status.moderation_case (tenant_id, display_number DESC);
