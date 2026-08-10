CREATE TABLE `guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`prefix` text DEFAULT '!' NOT NULL,
	`log_channel_id` text,
	`welcome_enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugins_enabled` (
	`guild_id` text NOT NULL,
	`plugin_name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `plugin_name`),
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
