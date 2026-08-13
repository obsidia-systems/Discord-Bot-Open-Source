CREATE TABLE `warnings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`moderator_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
