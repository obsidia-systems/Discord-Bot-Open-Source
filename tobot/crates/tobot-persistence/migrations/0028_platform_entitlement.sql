CREATE SCHEMA IF NOT EXISTS platform_entitlement;

CREATE TABLE platform_entitlement.grant_source (
    fact_id uuid PRIMARY KEY,
    order_id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES installation.tenant (tenant_id),
    source_sequence bigint NOT NULL CHECK (source_sequence > 0),
    source_version text NOT NULL,
    schema_family text NOT NULL CHECK (schema_family='CommercialPayment'),
    state text NOT NULL CHECK (state IN ('Active','Grace','Restricted','Cancelled','Frozen','Reversed')),
    feature_key text NOT NULL,
    valid_until timestamptz,
    applied_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id,source_sequence)
);

CREATE TABLE platform_entitlement.projection (
    tenant_id uuid PRIMARY KEY REFERENCES installation.tenant (tenant_id),
    order_id uuid NOT NULL,
    source_sequence bigint NOT NULL CHECK (source_sequence > 0),
    generation bigint NOT NULL CHECK (generation > 0),
    state text NOT NULL CHECK (state IN ('Active','Grace','Restricted','Cancelled','Frozen','Reversed')),
    feature_key text NOT NULL,
    valid_until timestamptz,
    last_fact_id uuid NOT NULL REFERENCES platform_entitlement.grant_source (fact_id),
    computed_at timestamptz NOT NULL DEFAULT now()
);
