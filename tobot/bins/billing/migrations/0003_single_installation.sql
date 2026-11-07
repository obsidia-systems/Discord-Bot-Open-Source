CREATE UNIQUE INDEX one_active_installation_per_billing_owner
    ON billing.scope_binding (billing_owner_id)
    WHERE state = 'Active';
