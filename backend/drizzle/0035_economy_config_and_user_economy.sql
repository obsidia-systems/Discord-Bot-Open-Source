CREATE TABLE `economy_config` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`currency_name` text DEFAULT 'Adobos Coins' NOT NULL,
	`currency_symbol` text DEFAULT '🪙' NOT NULL,
	`start_balance` integer DEFAULT 0 NOT NULL,
	`transfer_tax` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_economy` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`wallet` integer DEFAULT 0 NOT NULL,
	`bank` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `user_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
