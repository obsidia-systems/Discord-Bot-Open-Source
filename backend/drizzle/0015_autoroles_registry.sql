-- Registro persistente de menús de autoroles.
CREATE TABLE `autoroles_registry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`title` text DEFAULT 'Autoroles' NOT NULL,
	`type` text DEFAULT 'BUTTONS' NOT NULL,
	`roles_mapping` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
