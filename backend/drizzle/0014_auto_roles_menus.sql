-- Roles automáticos al unirse + menús interactivos (metadatos).
CREATE TABLE `auto_roles` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`human_roles` text DEFAULT '[]' NOT NULL,
	`bot_roles` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `reaction_roles_menus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`mode` text DEFAULT 'reactions' NOT NULL,
	`roles_mapping` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
