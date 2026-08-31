CREATE TABLE `guild_forms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`modal_title` text DEFAULT 'Formulario' NOT NULL,
	`button_label` text DEFAULT 'Abrir formulario' NOT NULL,
	`embed_title` text DEFAULT 'Formulario del servidor' NOT NULL,
	`embed_description` text DEFAULT 'Haz clic en el botón para completar el formulario.' NOT NULL,
	`embed_color` text DEFAULT '#5865F2' NOT NULL,
	`embed_image_url` text,
	`embed_thumbnail_url` text,
	`publish_channel_id` text,
	`reception_channel_id` text,
	`questions` text DEFAULT '[]' NOT NULL,
	`cooldown_minutes` integer DEFAULT 0 NOT NULL,
	`published_channel_id` text,
	`published_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `form_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`avatar_url` text,
	`answers` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `guild_forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
