DELETE FROM "xp_rewards" AS a USING "xp_rewards" AS b
WHERE a."guild_id" = b."guild_id" AND a."level" = b."level" AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_xp_rewards_guild_level" ON "xp_rewards" USING btree ("guild_id","level");
