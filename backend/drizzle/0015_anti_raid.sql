CREATE TABLE "anti_raid_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"alert_channel_id" text,
	"join_flood_enabled" boolean DEFAULT true NOT NULL,
	"join_count" integer DEFAULT 10 NOT NULL,
	"join_window_seconds" integer DEFAULT 10 NOT NULL,
	"join_action" text DEFAULT 'kick' NOT NULL,
	"account_age_enabled" boolean DEFAULT false NOT NULL,
	"account_age_days" integer DEFAULT 7 NOT NULL,
	"account_age_action" text DEFAULT 'kick' NOT NULL,
	"lockdown_join_action" text DEFAULT 'timeout' NOT NULL,
	"timeout_seconds" integer DEFAULT 3600 NOT NULL,
	"whitelist_role_ids" text DEFAULT '[]' NOT NULL,
	"nuke_enabled" boolean DEFAULT false NOT NULL,
	"nuke_window_seconds" integer DEFAULT 10 NOT NULL,
	"nuke_punishment" text DEFAULT 'strip' NOT NULL,
	"nuke_thresholds" text DEFAULT '{}' NOT NULL,
	"nuke_whitelist_user_ids" text DEFAULT '[]' NOT NULL,
	"nuke_whitelist_role_ids" text DEFAULT '[]' NOT NULL,
	"lockdown_active" boolean DEFAULT false NOT NULL,
	"lockdown_started_at" timestamp with time zone,
	"lockdown_by_user_id" text,
	"lockdown_snapshot" text DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anti_raid_settings" ADD CONSTRAINT "anti_raid_settings_guild_id_guild_settings_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_settings"("guild_id") ON DELETE cascade ON UPDATE no action;
