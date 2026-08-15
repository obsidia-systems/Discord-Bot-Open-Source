-- Multiplicadores por rol + formato de anuncio de nivel
ALTER TABLE `xp_config` ADD COLUMN `custom_multipliers` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `level_up_format` text DEFAULT 'TEXT' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `level_up_message` text DEFAULT '🎉 {user} subió al **nivel {level}**!' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `level_up_image` text;
