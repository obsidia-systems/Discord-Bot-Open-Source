ALTER TABLE platform_entitlement.grant_source
    ADD COLUMN benefits jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE platform_entitlement.projection
    ADD COLUMN benefits jsonb NOT NULL DEFAULT '[]'::jsonb;
