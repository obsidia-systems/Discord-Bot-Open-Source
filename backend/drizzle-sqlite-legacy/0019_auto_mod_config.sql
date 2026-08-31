CREATE TABLE IF NOT EXISTS `auto_mod_config` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`ignored_roles` text DEFAULT '[]' NOT NULL,
	`ignored_channels` text DEFAULT '[]' NOT NULL,
	`log_channel_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
