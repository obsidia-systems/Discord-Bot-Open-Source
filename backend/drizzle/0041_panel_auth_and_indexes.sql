CREATE TABLE IF NOT EXISTS `panel_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`global_name` text,
	`avatar` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `panel_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `panel_users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_panel_sessions_user` ON `panel_sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_action_logs_guild_created` ON `action_logs` (`guild_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mod_logs_guild` ON `mod_logs` (`guild_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_warnings_guild_user` ON `warnings` (`guild_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_form_responses_form` ON `form_responses` (`form_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sent_embeds_guild` ON `sent_embeds` (`guild_id`,`created_at`);
