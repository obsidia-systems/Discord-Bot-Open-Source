CREATE TABLE IF NOT EXISTS `bot_presence_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`status` text DEFAULT 'online' NOT NULL,
	`activity_type` text DEFAULT 'Playing' NOT NULL,
	`activity_name` text DEFAULT '' NOT NULL,
	`stream_url` text,
	`state` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
