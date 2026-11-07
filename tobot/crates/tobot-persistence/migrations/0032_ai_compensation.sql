CREATE TABLE platform_entitlement.compensation_grant (
    fact_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES installation.tenant (tenant_id),
    source_ref uuid NOT NULL UNIQUE,
    credit_minors bigint NOT NULL CHECK (credit_minors > 0),
    expires_at timestamptz,
    feature_key text NOT NULL CHECK (feature_key = 'ai.text'),
    delivered_at timestamptz,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_entitlement.ai_access (
    tenant_id uuid PRIMARY KEY REFERENCES installation.tenant (tenant_id),
    feature_key text NOT NULL,
    generation bigint NOT NULL CHECK (generation > 0),
    source_fact_id uuid NOT NULL REFERENCES platform_entitlement.compensation_grant (fact_id),
    state text NOT NULL CHECK (state = 'Active'),
    computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE edge.ask_input (
    tenant_id uuid NOT NULL,
    interaction_id text NOT NULL,
    actor_id text NOT NULL,
    prompt text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, interaction_id)
);
