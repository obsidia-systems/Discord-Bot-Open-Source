CREATE SCHEMA IF NOT EXISTS commercial_catalog;

CREATE TABLE commercial_catalog.revision (
    revision_id uuid PRIMARY KEY,
    product_key text NOT NULL CHECK (product_key = 'base'),
    product_kind text NOT NULL CHECK (product_kind = 'BasePlan'),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
    provider text NOT NULL CHECK (provider = 'Stripe'),
    environment text NOT NULL CHECK (environment = 'test'),
    provider_account text NOT NULL,
    provider_price_ref text NOT NULL CHECK (provider_price_ref ~ '^price_[A-Za-z0-9]+$'),
    currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
    unit_amount bigint NOT NULL CHECK (unit_amount > 0),
    interval_name text NOT NULL CHECK (interval_name IN ('month','year')),
    feature_key text NOT NULL,
    regions text[] NOT NULL CHECK (array_length(regions,1) > 0),
    tax_classification text NOT NULL,
    merchant_of_record text NOT NULL,
    terms_url text NOT NULL,
    privacy_url text NOT NULL,
    support_url text NOT NULL,
    grace_seconds bigint NOT NULL CHECK (grace_seconds BETWEEN 0 AND 2592000),
    state text NOT NULL CHECK (state IN ('Pending','Active','Retired')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE UNIQUE INDEX one_current_base_revision ON commercial_catalog.revision (product_key)
    WHERE state IN ('Pending','Active');

CREATE TABLE commercial_catalog.delivery_outbox (
    revision_id uuid PRIMARY KEY REFERENCES commercial_catalog.revision (revision_id),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    delivered_at timestamptz
);
