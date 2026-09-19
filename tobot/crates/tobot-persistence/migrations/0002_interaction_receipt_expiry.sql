ALTER TABLE edge.interaction_receipt
  ADD COLUMN IF NOT EXISTS acknowledgement_error TEXT;

CREATE INDEX IF NOT EXISTS edge_interaction_receipt_expiry
  ON edge.interaction_receipt (expires_at)
  WHERE state = 'Reserved';
