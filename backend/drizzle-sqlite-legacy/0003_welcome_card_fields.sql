-- Migra welcome_settings de embed JSON → campos de tarjeta PNG.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__welcome_settings_new` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text,
	`is_enabled` integer DEFAULT false NOT NULL,
	`background_url` text,
	`blur_amount` integer DEFAULT 4 NOT NULL,
	`primary_text` text DEFAULT '¡Bienvenido!' NOT NULL,
	`secondary_text` text DEFAULT '{username}' NOT NULL,
	`message_content` text DEFAULT '{user}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__welcome_settings_new` (
	`guild_id`,
	`channel_id`,
	`is_enabled`,
	`background_url`,
	`blur_amount`,
	`primary_text`,
	`secondary_text`,
	`message_content`,
	`updated_at`
)
SELECT
	`guild_id`,
	`channel_id`,
	`is_enabled`,
	NULL,
	4,
	'¡Bienvenido!',
	'{username}',
	'{user}',
	`updated_at`
FROM `welcome_settings`;
--> statement-breakpoint
DROP TABLE IF EXISTS `welcome_settings`;
--> statement-breakpoint
ALTER TABLE `__welcome_settings_new` RENAME TO `welcome_settings`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
