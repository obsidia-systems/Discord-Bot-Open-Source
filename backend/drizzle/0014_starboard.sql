CREATE TABLE "starboard_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"channel_id" text,
	"emojis" text DEFAULT '["unicode:⭐"]' NOT NULL,
	"threshold" integer DEFAULT 3 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allow_self_star" boolean DEFAULT false NOT NULL,
	"allow_bots" boolean DEFAULT false NOT NULL,
	"ignore_channel_ids" text DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starboard_settings" ADD CONSTRAINT "starboard_settings_guild_id_guild_settings_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_settings"("guild_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "starboard_posts" (
	"original_message_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"starboard_message_id" text NOT NULL,
	"star_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starboard_posts" ADD CONSTRAINT "starboard_posts_guild_id_guild_settings_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_settings"("guild_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "starboard_posts_starboard_message" ON "starboard_posts" USING btree ("starboard_message_id");
--> statement-breakpoint
CREATE INDEX "idx_starboard_posts_guild" ON "starboard_posts" USING btree ("guild_id");
