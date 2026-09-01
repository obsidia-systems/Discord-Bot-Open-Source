ALTER TABLE "auto_delete_config" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
CREATE TABLE "auto_delete_pending" (
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"rule_channel_id" text NOT NULL,
	"delete_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auto_delete_pending_guild_id_message_id_pk" PRIMARY KEY("guild_id","message_id")
);--> statement-breakpoint
ALTER TABLE "auto_delete_pending" ADD CONSTRAINT "auto_delete_pending_guild_id_guild_settings_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_settings"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auto_delete_pending_due" ON "auto_delete_pending" USING btree ("delete_at");--> statement-breakpoint
CREATE INDEX "idx_auto_delete_pending_rule" ON "auto_delete_pending" USING btree ("guild_id","rule_channel_id");
