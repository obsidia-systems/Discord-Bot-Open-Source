-- DR-055: one Active binding per installation. An owner may fund another installation.
DROP INDEX IF EXISTS billing.one_active_installation_per_billing_owner;
