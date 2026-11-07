CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE billing.catalog_revision (
    revision_id uuid PRIMARY KEY,
    product_key text NOT NULL,
    provider_price_ref text NOT NULL UNIQUE,
    currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
    unit_amount bigint NOT NULL CHECK (unit_amount > 0),
    interval_name text NOT NULL CHECK (interval_name IN ('month','year')),
    feature_key text NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing.billing_owner (
    billing_owner_id uuid PRIMARY KEY,
    account_id uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing.scope_binding (
    binding_id uuid PRIMARY KEY,
    billing_owner_id uuid NOT NULL REFERENCES billing.billing_owner,
    tenant_id uuid NOT NULL,
    guild_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('Active','Ended')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_binding_per_tenant ON billing.scope_binding (tenant_id) WHERE state='Active';

CREATE TABLE billing.provider_customer_mapping (
    mapping_id uuid PRIMARY KEY,
    billing_owner_id uuid NOT NULL REFERENCES billing.billing_owner,
    provider_account text NOT NULL,
    environment text NOT NULL CHECK (environment='test'),
    provider_customer_ref text NOT NULL,
    state text NOT NULL CHECK (state IN ('Active','Ended')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_customer_per_owner ON billing.provider_customer_mapping (billing_owner_id,provider_account,environment) WHERE state='Active';
CREATE UNIQUE INDEX one_owner_per_provider_customer ON billing.provider_customer_mapping (provider_account,environment,provider_customer_ref) WHERE state='Active';

CREATE TABLE billing.commercial_order (
    order_id uuid PRIMARY KEY,
    semantic_key uuid NOT NULL UNIQUE,
    billing_owner_id uuid NOT NULL REFERENCES billing.billing_owner,
    tenant_id uuid NOT NULL,
    guild_id text NOT NULL,
    revision_id uuid NOT NULL REFERENCES billing.catalog_revision,
    state text NOT NULL CHECK (state IN ('Open','Fulfilled','Expired','Cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    fulfilled_at timestamptz
);
CREATE UNIQUE INDEX one_open_order_per_scope ON billing.commercial_order (tenant_id) WHERE state='Open';

CREATE TABLE billing.checkout_attempt (
    attempt_id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES billing.commercial_order,
    state text NOT NULL CHECK (state IN ('Creating','Open','Completed','Failed','Expired','Cancelled')),
    provider_session_ref text UNIQUE,
    provider_subscription_ref text UNIQUE,
    checkout_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    next_reconcile_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz
);
CREATE UNIQUE INDEX one_nonterminal_attempt ON billing.checkout_attempt (order_id) WHERE state IN ('Creating','Open');

CREATE TABLE billing.invoice (
    invoice_id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES billing.commercial_order,
    provider_invoice_ref text NOT NULL UNIQUE,
    provider_payment_intent_ref text,
    state text NOT NULL CHECK (state IN ('Open','Paid','Void','Uncollectible')),
    period_end timestamptz,
    paid_at timestamptz,
    UNIQUE (order_id,provider_invoice_ref)
);

CREATE TABLE billing.subscription (
    subscription_id uuid PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE REFERENCES billing.commercial_order,
    provider_subscription_ref text NOT NULL UNIQUE,
    state text NOT NULL CHECK (state IN ('Incomplete','Active','PastDue','Paused','Disputed','Restricted','Cancelled')),
    period_end timestamptz,
    grace_until timestamptz,
    next_reconcile_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing.commercial_refund (
    refund_id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES billing.commercial_order,
    invoice_id uuid NOT NULL REFERENCES billing.invoice,
    provider_refund_ref text NOT NULL UNIQUE,
    state text NOT NULL CHECK (state IN ('Pending','Succeeded','Failed')),
    amount bigint NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing.commercial_dispute (
    dispute_id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES billing.commercial_order,
    provider_dispute_ref text NOT NULL UNIQUE,
    state text NOT NULL CHECK (state IN ('Open','Won','Lost')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing.provider_event (
    event_id text PRIMARY KEY,
    receipt_id uuid NOT NULL UNIQUE,
    event_type text NOT NULL,
    provider_created_at bigint NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    applied_at timestamptz,
    last_error text
);
CREATE INDEX pending_provider_event ON billing.provider_event (next_attempt_at) WHERE applied_at IS NULL;

CREATE TABLE billing.dunning_attempt (
    attempt_id uuid PRIMARY KEY,
    invoice_id uuid NOT NULL UNIQUE REFERENCES billing.invoice,
    due_at timestamptz NOT NULL,
    state text NOT NULL CHECK (state IN ('Scheduled','Sent','Inconclusive','Skipped')),
    attempted_at timestamptz
);

CREATE TABLE billing.grant_outbox (
    fact_id uuid PRIMARY KEY,
    source_sequence bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
    order_id uuid NOT NULL REFERENCES billing.commercial_order,
    tenant_id uuid NOT NULL,
    schema_family text NOT NULL CHECK (schema_family='CommercialPayment'),
    source_version text NOT NULL,
    state text NOT NULL CHECK (state IN ('Active','Grace','Restricted','Cancelled','Frozen','Reversed')),
    feature_key text NOT NULL,
    valid_until timestamptz,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id,source_version,state)
);
CREATE INDEX pending_grant_outbox ON billing.grant_outbox (created_at) WHERE published_at IS NULL;
