-- Action Logs: configuración + historial de eventos.
CREATE TABLE `action_logs_config` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`routing_mode` text DEFAULT 'GLOBAL' NOT NULL,
	`global_channel_id` text,
	`channels_mapping` text DEFAULT '{}' NOT NULL,
	`ignored_channels` text DEFAULT '[]' NOT NULL,
	`ignored_roles` text DEFAULT '[]' NOT NULL,
	`ignore_bots` integer DEFAULT true NOT NULL,
	`enabled_events` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `action_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`category` text NOT NULL,
	`event_type` text NOT NULL,
	`executor_id` text,
	`executor_tag` text,
	`target_id` text,
	`target_tag` text,
	`channel_id` text,
	`summary` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
