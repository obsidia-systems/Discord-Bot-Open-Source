CREATE TABLE IF NOT EXISTS `welcome_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text,
	`is_enabled` integer DEFAULT false NOT NULL,
	`embed_data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
