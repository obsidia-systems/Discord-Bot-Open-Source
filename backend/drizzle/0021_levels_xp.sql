-- Rangos y XP: config, recompensas y progreso de usuarios
CREATE TABLE IF NOT EXISTS `xp_config` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`text_xp_min` integer DEFAULT 15 NOT NULL,
	`text_xp_max` integer DEFAULT 25 NOT NULL,
	`cooldown_seconds` integer DEFAULT 60 NOT NULL,
	`voice_enabled` integer DEFAULT false NOT NULL,
	`voice_xp_per_minute` integer DEFAULT 10 NOT NULL,
	`xp_multiplier` integer DEFAULT 1 NOT NULL,
	`ignored_roles` text DEFAULT '[]' NOT NULL,
	`ignored_channels` text DEFAULT '[]' NOT NULL,
	`level_up_channel_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `xp_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`level` integer NOT NULL,
	`role_id` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_xp` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`guild_id`, `user_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
