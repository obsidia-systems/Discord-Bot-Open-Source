CREATE TABLE `custom_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT 'Comando personalizado' NOT NULL,
	`response_data` text DEFAULT '{}' NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
