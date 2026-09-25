CREATE OR REPLACE FUNCTION ledger.assert_balanced_transaction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE debit_total NUMERIC;
DECLARE credit_total NUMERIC;
DECLARE line_count INTEGER;
DECLARE wrong_account_count INTEGER;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(p.amount) FILTER (WHERE p.direction='Debit'),0),
         COALESCE(SUM(p.amount) FILTER (WHERE p.direction='Credit'),0),
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
