CREATE TABLE ledger.balance_projection (
  account_id UUID PRIMARY KEY REFERENCES ledger.account (account_id),
  tenant_id UUID NOT NULL REFERENCES ledger.currency (tenant_id),
  currency_id UUID NOT NULL REFERENCES ledger.currency (currency_id),
  current_balance BIGINT NOT NULL,
  available_balance BIGINT NOT NULL,
  journal_sequence BIGINT NOT NULL DEFAULT 0 CHECK (journal_sequence >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (current_balance = available_balance)
);

INSERT INTO ledger.balance_projection (account_id,tenant_id,currency_id,current_balance,available_balance,journal_sequence)
SELECT a.account_id,a.tenant_id,a.currency_id,a.balance,a.balance,
       COALESCE((SELECT MAX(t.journal_sequence) FROM ledger.monetary_transaction t
         JOIN ledger.monetary_posting p ON p.transaction_id=t.transaction_id
         WHERE p.account_id=a.account_id),0)
FROM ledger.account a;
