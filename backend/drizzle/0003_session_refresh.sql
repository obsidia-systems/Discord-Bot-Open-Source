ALTER TABLE "panel_sessions" ADD COLUMN "refresh_token_enc" text;--> statement-breakpoint
ALTER TABLE "panel_sessions" ADD COLUMN "access_expires_at" timestamp with time zone;
