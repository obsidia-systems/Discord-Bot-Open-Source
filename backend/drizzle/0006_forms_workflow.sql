ALTER TABLE "guild_forms" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_forms" ADD COLUMN "submit_mode" text DEFAULT 'cooldown' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_forms" ADD COLUMN "required_role_ids" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_forms" ADD COLUMN "blocked_role_ids" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_forms" ADD COLUMN "ping_role_id" text;--> statement-breakpoint
ALTER TABLE "guild_forms" ADD COLUMN "thank_you_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_forms" ADD COLUMN "accept_role_id" text;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "form_responses" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_form_responses_user" ON "form_responses" USING btree ("form_id","user_id","created_at");
