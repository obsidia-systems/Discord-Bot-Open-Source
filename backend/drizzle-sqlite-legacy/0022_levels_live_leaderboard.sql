-- Leaderboard en vivo: canal + message id
ALTER TABLE `xp_config` ADD COLUMN `live_leaderboard_channel_id` text;
--> statement-breakpoint
ALTER TABLE `xp_config` ADD COLUMN `live_leaderboard_message_id` text;
