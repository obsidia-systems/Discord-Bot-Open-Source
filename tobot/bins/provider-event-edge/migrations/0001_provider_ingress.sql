CREATE SCHEMA IF NOT EXISTS provider_edge;

CREATE TABLE provider_edge.event_receipt (
    receipt_id uuid PRIMARY KEY,
    provider_account text NOT NULL,
    environment text NOT NULL CHECK (environment = 'test'),
    event_id text NOT NULL,
    event_type text NOT NULL,
    provider_created_at bigint NOT NULL,
    endpoint_generation integer NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    delivery_attempts integer NOT NULL DEFAULT 0,
    UNIQUE (provider_account, environment, event_id)
);
CREATE INDEX event_receipt_pending ON provider_edge.event_receipt (received_at)
    WHERE delivered_at IS NULL;
