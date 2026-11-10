ALTER TABLE support.ticket_template_revision
  DROP CONSTRAINT ticket_template_revision_required_resource_check;
ALTER TABLE support.ticket_template_revision
  ADD CONSTRAINT ticket_template_revision_required_resource_check
  CHECK (required_resource IN ('none', 'channel'));

ALTER TABLE support.ticket_template_revision
  ADD COLUMN category_id TEXT,
  ADD COLUMN overflow_category_id TEXT,
  ADD COLUMN staff_role_id TEXT,
  ADD COLUMN questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN timezone_offset_minutes INTEGER,
  ADD COLUMN weekly_hours JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN closed_hours TEXT NOT NULL DEFAULT 'open'
    CHECK (closed_hours IN ('open', 'block', 'warn')),
  ADD COLUMN confirm_close BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN inactivity_minutes INTEGER
    CHECK (inactivity_minutes IS NULL OR inactivity_minutes BETWEEN 5 AND 10080),
  ADD COLUMN transcript_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN log_channel_id TEXT;

ALTER TABLE support.support_case
  DROP CONSTRAINT support_case_state_check;
ALTER TABLE support.support_case
  ADD CONSTRAINT support_case_state_check
  CHECK (state IN ('Provisioning', 'Open', 'Claimed', 'Closing', 'Closed'));

DROP INDEX support.support_one_active_member_case;
CREATE UNIQUE INDEX support_one_active_member_case
  ON support.support_case (tenant_id, member_id)
  WHERE state IN ('Provisioning', 'Open', 'Claimed', 'Closing');

ALTER TABLE support.support_case
  ADD COLUMN resource_channel_id TEXT,
  ADD COLUMN outside_hours BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN close_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN claimer_member_id TEXT,
  ADD COLUMN last_activity_at TIMESTAMPTZ,
  ADD COLUMN warning_sent_at TIMESTAMPTZ,
  ADD COLUMN rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  ADD COLUMN transcript_html TEXT,
  ADD COLUMN transcript_coverage TEXT,
  ADD COLUMN channel_deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX support_one_resource_channel
  ON support.support_case (resource_channel_id)
  WHERE resource_channel_id IS NOT NULL;

CREATE TABLE support.intake_answer (
  case_id UUID NOT NULL REFERENCES support.support_case (case_id),
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  PRIMARY KEY (case_id, position)
);

CREATE TABLE support.transcript_line (
  case_id UUID NOT NULL REFERENCES support.support_case (case_id),
  message_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (case_id, message_id)
);

ALTER TABLE query_status.support_ticket
  DROP CONSTRAINT support_ticket_state_check;
ALTER TABLE query_status.support_ticket
  ADD CONSTRAINT support_ticket_state_check
  CHECK (state IN ('Provisioning', 'Open', 'Claimed', 'Closing', 'Closed'));

ALTER TABLE query_status.support_ticket
  ADD COLUMN channel_id TEXT,
  ADD COLUMN rating SMALLINT,
  ADD COLUMN outside_hours BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN transcript_ready BOOLEAN NOT NULL DEFAULT false;
