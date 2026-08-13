CREATE TABLE `embed_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`embed_data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `mod_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`action` text NOT NULL,
	`target_user_id` text,
	`target_channel_id` text,
	`moderator_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
