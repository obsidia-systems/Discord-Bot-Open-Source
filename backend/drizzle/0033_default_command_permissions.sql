CREATE TABLE `default_command_permissions` (
	`guild_id` text NOT NULL,
	`command_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`allowed_roles` text DEFAULT '[]' NOT NULL,
	`ephemeral` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `command_name`),
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
