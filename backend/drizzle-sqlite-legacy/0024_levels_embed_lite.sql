-- Embed Builder Lite: títulos, colores y thumbnails
ALTER TABLE `xp_config` ADD COLUMN `level_up_embed_title` text DEFAULT '¡Subida de Nivel!' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `level_up_embed_color` text DEFAULT '#E11D48' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `level_up_show_thumbnail` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `leaderboard_embed_title` text DEFAULT '🏆 Clasificación — Top 10' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `leaderboard_embed_description` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `leaderboard_embed_color` text DEFAULT '#E11D48' NOT NULL;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `leaderboard_show_thumbnail` integer DEFAULT false NOT NULL;
