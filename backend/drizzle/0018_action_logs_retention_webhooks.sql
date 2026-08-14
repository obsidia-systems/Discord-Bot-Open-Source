-- Action Logs overhaul: retención + cache de webhooks.
ALTER TABLE `action_logs_config` ADD COLUMN `data_retention_days` integer DEFAULT 14 NOT NULL;
--> statement-breakpoint
ALTER TABLE `action_logs_config` ADD COLUMN `webhooks_mapping` text DEFAULT '{}' NOT NULL;
