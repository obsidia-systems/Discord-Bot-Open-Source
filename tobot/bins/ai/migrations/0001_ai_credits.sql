CREATE SCHEMA IF NOT EXISTS ai_ledger;
CREATE SCHEMA IF NOT EXISTS ai_execution;
CREATE SCHEMA IF NOT EXISTS asset;

CREATE TABLE ai_ledger.pricing (
    pricing_revision_id uuid PRIMARY KEY,
    operation_class text NOT NULL CHECK (operation_class = 'text'),
    model_class text NOT NULL,
    estimate_amount bigint NOT NULL CHECK (estimate_amount > 0),
    maximum_amount bigint NOT NULL CHECK (maximum_amount >= estimate_amount),
    unit_charge bigint NOT NULL CHECK (unit_charge > 0),
    user_daily_ceiling bigint NOT NULL CHECK (user_daily_ceiling > 0),
    guild_daily_ceiling bigint NOT NULL CHECK (guild_daily_ceiling >= user_daily_ceiling),
    active boolean NOT NULL,
    published_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX one_active_text_price ON ai_ledger.pricing (operation_class) WHERE active;

CREATE TABLE ai_ledger.account (
    account_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL UNIQUE,
    posted_balance bigint NOT NULL CHECK (posted_balance >= 0),
    reserved_balance bigint NOT NULL CHECK (reserved_balance >= 0)
);

CREATE TABLE ai_ledger.lot (
    lot_id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES ai_ledger.account (account_id),
    tenant_id uuid NOT NULL,
    source_ref uuid NOT NULL UNIQUE,
    granted_amount bigint NOT NULL CHECK (granted_amount > 0),
    available_amount bigint NOT NULL CHECK (available_amount >= 0),
    granted_at timestamptz NOT NULL,
    expires_at timestamptz,
    state text NOT NULL CHECK (state IN ('Active', 'Depleted', 'Expired'))
);

CREATE TABLE ai_ledger.journal (
    entry_id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES ai_ledger.account (account_id),
    entry_type text NOT NULL,
    amount bigint NOT NULL CHECK (amount > 0),
    source_ref uuid NOT NULL,
    semantic_key text NOT NULL UNIQUE
);

CREATE TABLE ai_ledger.reservation (
    reservation_id uuid PRIMARY KEY,
    operation_id uuid NOT NULL UNIQUE,
    tenant_id uuid NOT NULL,
    actor_id text NOT NULL,
    estimated_amount bigint NOT NULL CHECK (estimated_amount > 0),
    captured_amount bigint NOT NULL DEFAULT 0 CHECK (captured_amount >= 0),
    state text NOT NULL CHECK (state IN ('Reserved', 'Uncertain', 'Disputed', 'Captured', 'Released')),
    expires_at timestamptz NOT NULL,
    uncertainty_deadline_at timestamptz,
    settled_at timestamptz
);

CREATE TABLE ai_ledger.allocation (
    allocation_id uuid PRIMARY KEY,
    reservation_id uuid NOT NULL REFERENCES ai_ledger.reservation (reservation_id),
    lot_id uuid NOT NULL REFERENCES ai_ledger.lot (lot_id),
    reserved_amount bigint NOT NULL CHECK (reserved_amount > 0),
    captured_amount bigint NOT NULL DEFAULT 0 CHECK (captured_amount >= 0)
);

CREATE TABLE ai_execution.operation (
    operation_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    actor_id text NOT NULL,
    semantic_key uuid NOT NULL,
    pricing_revision_id uuid NOT NULL,
    reservation_id uuid,
    input_ref uuid,
    result_ref uuid,
    state text NOT NULL,
    UNIQUE (tenant_id, actor_id, semantic_key)
);

CREATE TABLE ai_execution.attempt (
    attempt_id uuid PRIMARY KEY,
    operation_id uuid NOT NULL REFERENCES ai_execution.operation (operation_id),
    attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
    result_class text NOT NULL,
    UNIQUE (operation_id, attempt_number)
);

CREATE TABLE asset.object (
    asset_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    sha256 text NOT NULL,
    mime text NOT NULL,
    body bytea NOT NULL
);

CREATE TABLE ai_execution.protected_content (
    protected_content_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('OperationInput', 'OperationOutput')),
    asset_id uuid NOT NULL REFERENCES asset.object (asset_id),
    operation_id uuid NOT NULL,
    state text NOT NULL
);

CREATE TABLE ai_ledger.outbox (
    outbox_id uuid PRIMARY KEY,
    envelope text NOT NULL,
    published_at timestamptz
);
