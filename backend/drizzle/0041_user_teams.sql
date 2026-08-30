CREATE TABLE IF NOT EXISTS `user_teams` (
	`user_id` text PRIMARY KEY NOT NULL,
	`team_data` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
