ALTER TABLE billing.catalog_revision
    ADD COLUMN benefits jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE billing.grant_outbox
    ADD COLUMN benefits jsonb NOT NULL DEFAULT '[]'::jsonb;
