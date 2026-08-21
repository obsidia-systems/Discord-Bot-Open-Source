CREATE TABLE `economy_shop_items` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`icon` text DEFAULT '🛒' NOT NULL,
	`stock` integer,
	`reward_type` text NOT NULL,
	`reward_config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `economy_shop_items_guild_idx` ON `economy_shop_items` (`guild_id`);
--> statement-breakpoint
CREATE TABLE `economy_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`price_paid` integer NOT NULL,
	`status` text DEFAULT 'fulfilled' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `economy_purchases_guild_user_idx` ON `economy_purchases` (`guild_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `economy_user_boosts` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`module` text NOT NULL,
	`multiplier` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`purchase_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `economy_user_boosts_lookup_idx` ON `economy_user_boosts` (`guild_id`,`user_id`,`module`);
--> statement-breakpoint
CREATE TABLE `economy_owned_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`item_id` text,
	`purchase_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `economy_owned_roles_user_idx` ON `economy_owned_roles` (`guild_id`,`user_id`);
