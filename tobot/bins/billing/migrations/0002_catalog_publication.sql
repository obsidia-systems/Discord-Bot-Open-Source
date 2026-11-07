ALTER TABLE billing.catalog_revision
    DROP CONSTRAINT IF EXISTS catalog_revision_provider_price_ref_key;

ALTER TABLE billing.catalog_revision
    ADD COLUMN publication jsonb;
