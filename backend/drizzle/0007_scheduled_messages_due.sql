ALTER TABLE "scheduled_messages" ADD COLUMN "content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "ping_role_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "next_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_scheduled_messages_due" ON "scheduled_messages" USING btree ("is_active","next_run_at");
