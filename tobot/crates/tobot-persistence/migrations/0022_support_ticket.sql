CREATE SCHEMA support;

CREATE TABLE support.ticket_template (
  template_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL
);
CREATE TABLE support.ticket_template_revision (
  revision_id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES support.ticket_template (template_id),
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  revision BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Published', 'Superseded')),
  member_capacity INTEGER NOT NULL DEFAULT 1 CHECK (member_capacity = 1),
  cooldown_seconds INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_seconds = 0),
  required_resource TEXT NOT NULL DEFAULT 'none' CHECK (required_resource = 'none'),
  published_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, revision)
);
CREATE UNIQUE INDEX support_one_template_published ON support.ticket_template_revision (tenant_id) WHERE state = 'Published';

CREATE TABLE support.support_panel_revision (
  revision_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  template_revision_id UUID NOT NULL REFERENCES support.ticket_template_revision (revision_id),
  revision BIGINT NOT NULL,
  channel_id TEXT NOT NULL,
  button_label TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Preparing', 'Published', 'Superseded', 'Failed', 'Degraded')),
  nonce TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, revision)
);
CREATE UNIQUE INDEX support_one_panel_published ON support.support_panel_revision (tenant_id) WHERE state = 'Published';
CREATE TABLE support.support_panel_binding (
  revision_id UUID PRIMARY KEY REFERENCES support.support_panel_revision (revision_id),
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  custom_id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL,
  installation_generation BIGINT NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, channel_id, message_id)
);
CREATE TABLE support.support_number (
  tenant_id UUID PRIMARY KEY REFERENCES installation.tenant (tenant_id),
  next_number BIGINT NOT NULL CHECK (next_number > 0)
);
CREATE TABLE support.support_case (
  case_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  guild_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  interaction_id TEXT NOT NULL UNIQUE,
  template_revision_id UUID NOT NULL REFERENCES support.ticket_template_revision (revision_id),
  panel_revision_id UUID NOT NULL REFERENCES support.support_panel_revision (revision_id),
  support_number BIGINT NOT NULL CHECK (support_number > 0),
  state TEXT NOT NULL CHECK (state IN ('Open', 'Claimed', 'Closed')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  claimed_by UUID,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, support_number)
);
CREATE UNIQUE INDEX support_one_active_member_case ON support.support_case (tenant_id, member_id) WHERE state IN ('Open', 'Claimed');
CREATE TABLE support.event_outbox (
  outbox_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES installation.tenant (tenant_id),
  event_id UUID NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  envelope BYTEA NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  publish_attempts INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ
);
CREATE INDEX support_outbox_due ON support.event_outbox (available_at) WHERE published_at IS NULL;

-- El token vence con el recibo de Edge; no se guarda en el caso ni en el bus.
ALTER TABLE edge.interaction_receipt ADD COLUMN interaction_token TEXT;
