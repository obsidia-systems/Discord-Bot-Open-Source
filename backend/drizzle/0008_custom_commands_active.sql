ALTER TABLE "custom_commands" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_custom_commands_guild_name" ON "custom_commands" USING btree ("guild_id","name");
