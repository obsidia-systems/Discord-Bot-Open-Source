CREATE TABLE `economy_income` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`daily_pay` integer DEFAULT 100 NOT NULL,
	`weekly_pay` integer DEFAULT 500 NOT NULL,
	`monthly_pay` integer DEFAULT 2000 NOT NULL,
	`streak_enabled` integer DEFAULT false NOT NULL,
	`streak_bonus_percent` integer DEFAULT 5 NOT NULL,
	`role_salaries` text DEFAULT '[]' NOT NULL,
	`jobs` text DEFAULT '[]' NOT NULL,
	`crimes` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
