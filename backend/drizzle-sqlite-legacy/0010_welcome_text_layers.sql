ALTER TABLE `welcome_settings` ADD COLUMN `avatar_border_width` integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_settings` ADD COLUMN `avatar_border_color` text DEFAULT '#FFFFFF' NOT NULL;--> statement-breakpoint
ALTER TABLE `welcome_settings` ADD COLUMN `text_layers` text;
