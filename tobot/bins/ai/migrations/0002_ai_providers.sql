CREATE TABLE ai_execution.provider (
    provider_id uuid PRIMARY KEY,
    display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
    kind text NOT NULL CHECK (kind IN ('gemini', 'ollama', 'openai')),
    base_url text NOT NULL CHECK (char_length(base_url) BETWEEN 8 AND 300),
    secret_ciphertext bytea,
    secret_hint text,
    enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX one_enabled_ai_provider ON ai_execution.provider ((true)) WHERE enabled;

CREATE TABLE ai_execution.model (
    model_id uuid PRIMARY KEY,
    provider_id uuid NOT NULL REFERENCES ai_execution.provider (provider_id),
    model_name text NOT NULL CHECK (char_length(model_name) BETWEEN 1 AND 64),
    input_micro_usd bigint CHECK (input_micro_usd IS NULL OR input_micro_usd BETWEEN 0 AND 1000000000000),
    output_micro_usd bigint CHECK (output_micro_usd IS NULL OR output_micro_usd BETWEEN 0 AND 1000000000000),
    UNIQUE (provider_id, model_name)
);

CREATE TABLE ai_execution.binding (
    capability text PRIMARY KEY CHECK (capability = 'ask'),
    provider_id uuid NOT NULL REFERENCES ai_execution.provider (provider_id),
    model_id uuid NOT NULL REFERENCES ai_execution.model (model_id),
    pricing_revision_id uuid NOT NULL REFERENCES ai_ledger.pricing (pricing_revision_id),
    updated_at timestamptz NOT NULL
);

ALTER TABLE ai_execution.attempt
    ADD COLUMN input_tokens bigint,
    ADD COLUMN output_tokens bigint,
    ADD COLUMN cost_micro_usd bigint,
    ADD COLUMN model_name text,
    ADD COLUMN occurred_at timestamptz;

ALTER TABLE ai_execution.attempt
    ADD CONSTRAINT attempt_usage_check CHECK (
        (input_tokens IS NULL OR input_tokens >= 0)
        AND (output_tokens IS NULL OR output_tokens >= 0)
        AND (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
        AND (model_name IS NULL OR char_length(model_name) BETWEEN 1 AND 64)
    );
