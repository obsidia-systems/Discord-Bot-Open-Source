ALTER TABLE commercial_catalog.revision
    DROP CONSTRAINT IF EXISTS revision_product_key_check;

ALTER TABLE commercial_catalog.revision
    ADD CONSTRAINT revision_product_key_check
    CHECK (product_key ~ '^[a-z][a-z0-9._-]{1,79}$');

ALTER TABLE commercial_catalog.revision
    ADD COLUMN benefits jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS commercial_catalog.one_current_base_revision;
CREATE UNIQUE INDEX one_active_revision_per_product
    ON commercial_catalog.revision (product_key) WHERE state = 'Active';
CREATE UNIQUE INDEX one_pending_revision_per_product
    ON commercial_catalog.revision (product_key) WHERE state = 'Pending';
CREATE UNIQUE INDEX one_active_revision_per_price
    ON commercial_catalog.revision (provider, environment, provider_account, provider_price_ref)
    WHERE state = 'Active';
CREATE UNIQUE INDEX one_pending_revision_per_price
    ON commercial_catalog.revision (provider, environment, provider_account, provider_price_ref)
    WHERE state = 'Pending';
