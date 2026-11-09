CREATE TABLE commercial_catalog.default_plan (
    plan_key text PRIMARY KEY CHECK (plan_key = 'free'),
    enabled boolean NOT NULL,
    support_open boolean NOT NULL,
    ticket_quantity integer CHECK (ticket_quantity IS NULL OR ticket_quantity BETWEEN 1 AND 1000)
);

INSERT INTO commercial_catalog.default_plan (plan_key, enabled, support_open, ticket_quantity)
VALUES ('free', true, true, NULL);
