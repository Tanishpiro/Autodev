INSERT INTO "opportunities" ("id", "title", "customer", "email", "value", "type", "scope", "stage") VALUES
  ('opp_portal', 'Customer Portal Build', 'Northstar Retail', 'ops@northstar.example', 42000, 'software', 'Build a customer portal with account management and order tracking.', 'Qualified'),
  ('opp_erp', 'ERP Rollout', 'Stark Logistics', 'ops@stark.example', 75000, 'implementation', 'ERP rollout for three warehouses.', 'Proposal')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "audit" ("id", "action", "detail") VALUES ('audit_seed', 'app.started', 'DeliveryFlow initialized')
ON CONFLICT ("id") DO NOTHING;
