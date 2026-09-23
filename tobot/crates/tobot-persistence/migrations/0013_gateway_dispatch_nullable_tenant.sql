ALTER TABLE edge.event_inbox ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE edge.event_outbox ALTER COLUMN tenant_id DROP NOT NULL;
