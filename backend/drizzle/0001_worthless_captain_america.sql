ALTER TABLE "giveaways" ADD COLUMN "claimed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "claimed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "claimed_until" timestamp with time zone;