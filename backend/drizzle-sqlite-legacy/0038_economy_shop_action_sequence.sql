ALTER TABLE `economy_shop_items` ADD COLUMN `action_sequence` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `economy_owned_roles` ADD COLUMN `expires_at` integer;
