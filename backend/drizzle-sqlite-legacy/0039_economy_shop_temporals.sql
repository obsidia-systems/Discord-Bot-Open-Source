ALTER TABLE `economy_owned_roles` ADD COLUMN `delete_role_on_expire` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `economy_owned_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`item_id` text,
	`purchase_id` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `economy_owned_channels_user_idx` ON `economy_owned_channels` (`guild_id`,`user_id`);
