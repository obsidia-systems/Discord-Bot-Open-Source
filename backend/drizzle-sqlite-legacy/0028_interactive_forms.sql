CREATE TABLE `interactive_forms` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`modal_title` text DEFAULT 'Formulario' NOT NULL,
	`button_label` text DEFAULT 'Abrir formulario' NOT NULL,
	`embed_title` text DEFAULT 'Formulario del servidor' NOT NULL,
	`embed_description` text DEFAULT 'Haz clic en el botón para completar el formulario.' NOT NULL,
	`embed_color` text DEFAULT '#5865F2' NOT NULL,
	`publish_channel_id` text,
	`reception_channel_id` text,
	`questions` text DEFAULT '[]' NOT NULL,
	`published_channel_id` text,
	`published_message_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild_settings`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
