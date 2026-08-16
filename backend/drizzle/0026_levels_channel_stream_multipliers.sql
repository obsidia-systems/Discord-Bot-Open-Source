ALTER TABLE `xp_config` ADD COLUMN `stream_multiplier` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `custom_channel_multipliers` text DEFAULT '[]' NOT NULL;
