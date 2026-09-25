CREATE SCHEMA ledger;

CREATE TABLE ledger.currency (
  tenant_id UUID PRIMARY KEY,
  currency_id UUID NOT NULL UNIQUE,
  application_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  issued BIGINT NOT NULL DEFAULT 0 CHECK (issued >= 0),
  credit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  write_ready BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ledger.currency_policy_revision (
  revision_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES ledger.currency (tenant_id),
  revision BIGINT NOT NULL CHECK (revision > 0),
  starting_grant BIGINT NOT NULL CHECK (starting_grant >= 0),
  wallet_ceiling BIGINT NOT NULL CHECK (wallet_ceiling > 0),
  issuance_ceiling BIGINT NOT NULL CHECK (issuance_ceiling > 0),
  published_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, revision)
);

CREATE TABLE ledger.account (
  account_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES ledger.currency (tenant_id),
  currency_id UUID NOT NULL REFERENCES ledger.currency (currency_id),
  kind TEXT NOT NULL CHECK (kind IN ('Issuance', 'Wallet')),
  member_id TEXT,
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK ((kind='Issuance' AND member_id IS NULL AND balance <= 0) OR
         (kind='Wallet' AND member_id IS NOT NULL AND balance >= 0))
);
CREATE UNIQUE INDEX ledger_one_issuance ON ledger.account (tenant_id) WHERE kind='Issuance';
CREATE UNIQUE INDEX ledger_one_member_wallet ON ledger.account (tenant_id, member_id) WHERE kind='Wallet';

CREATE TABLE ledger.monetary_transaction (
  transaction_id UUID PRIMARY KEY,
  journal_sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id UUID NOT NULL REFERENCES ledger.currency (tenant_id),
  currency_id UUID NOT NULL REFERENCES ledger.currency (currency_id),
  kind TEXT NOT NULL CHECK (kind IN ('StartingGrant', 'DailyIncome')),
  source_id UUID NOT NULL,
  policy_revision_id UUID NOT NULL,
  idempotency_key UUID NOT NULL,
  request_hash BYTEA NOT NULL,
  member_id TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, kind, source_id)
);

CREATE TABLE ledger.monetary_posting (
  transaction_id UUID NOT NULL REFERENCES ledger.monetary_transaction (transaction_id),
  line SMALLINT NOT NULL CHECK (line IN (1,2)),
  account_id UUID NOT NULL REFERENCES ledger.account (account_id),
  direction TEXT NOT NULL CHECK (direction IN ('Debit','Credit')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  PRIMARY KEY (transaction_id, line),
  UNIQUE (transaction_id, account_id)
);

CREATE FUNCTION ledger.assert_balanced_transaction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE debit_total NUMERIC;
DECLARE credit_total NUMERIC;
DECLARE line_count INTEGER;
DECLARE wrong_account_count INTEGER;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(amount) FILTER (WHERE direction='Debit'),0),
         COALESCE(SUM(amount) FILTER (WHERE direction='Credit'),0),
         COUNT(*) FILTER (WHERE a.tenant_id<>t.tenant_id OR a.currency_id<>t.currency_id)
  INTO line_count, debit_total, credit_total, wrong_account_count
  FROM ledger.monetary_transaction t
  LEFT JOIN ledger.monetary_posting p ON p.transaction_id=t.transaction_id
  LEFT JOIN ledger.account a ON a.account_id=p.account_id
  WHERE t.transaction_id=NEW.transaction_id;
  IF line_count<>2 OR debit_total<>credit_total OR wrong_account_count<>0 THEN
    RAISE EXCEPTION 'unbalanced or cross-tenant monetary transaction %', NEW.transaction_id;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_balance_on_transaction
AFTER INSERT ON ledger.monetary_transaction DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ledger.assert_balanced_transaction();

CREATE TABLE ledger.starting_grant_receipt (
  tenant_id UUID NOT NULL REFERENCES ledger.currency (tenant_id),
  member_id TEXT NOT NULL,
  transaction_id UUID REFERENCES ledger.monetary_transaction (transaction_id),
  policy_revision_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, member_id)
);

CREATE TABLE ledger.event_outbox (
  outbox_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES ledger.currency (tenant_id),
  event_id UUID NOT NULL UNIQUE,
  envelope BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ
);
CREATE INDEX ledger_outbox_due ON ledger.event_outbox (created_at) WHERE published_at IS NULL;

CREATE TABLE ledger.reconciliation (
  tenant_id UUID PRIMARY KEY REFERENCES ledger.currency (tenant_id),
  checked_sequence BIGINT NOT NULL DEFAULT 0,
  checked_at TIMESTAMPTZ NOT NULL,
  healthy BOOLEAN NOT NULL
);

CREATE FUNCTION ledger.immutable_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'monetary journal is append-only'; END $$;
CREATE TRIGGER ledger_no_transaction_mutation BEFORE UPDATE OR DELETE ON ledger.monetary_transaction
FOR EACH ROW EXECUTE FUNCTION ledger.immutable_journal();
CREATE TRIGGER ledger_no_posting_mutation BEFORE UPDATE OR DELETE ON ledger.monetary_posting
FOR EACH ROW EXECUTE FUNCTION ledger.immutable_journal();
