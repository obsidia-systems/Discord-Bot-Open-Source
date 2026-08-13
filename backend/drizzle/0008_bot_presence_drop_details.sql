-- Elimina `details` (no visible en presencia de bots Discord).
ALTER TABLE `bot_presence_settings` DROP COLUMN `details`;
