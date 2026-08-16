ALTER TABLE `auto_mod_config` ADD COLUMN `punishments` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_xp` ADD COLUMN `xp_frozen_until` integer;
