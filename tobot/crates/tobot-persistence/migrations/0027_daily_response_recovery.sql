ALTER TABLE earnings.income_action ADD COLUMN response_state TEXT NOT NULL DEFAULT 'Pending'
  CHECK (response_state IN ('Pending','Delivered','Expired'));
ALTER TABLE earnings.income_action ADD COLUMN response_finished_at TIMESTAMPTZ;
CREATE INDEX earnings_response_due ON earnings.income_action (settled_at)
  WHERE state IN ('Settled','Rejected') AND response_state='Pending';
