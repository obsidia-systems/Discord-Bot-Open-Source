ALTER TABLE "auto_mod_config" ADD COLUMN "warn_on_hit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_mod_config" ADD COLUMN "dm_on_hit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_mod_config" ADD COLUMN "skip_staff" boolean DEFAULT false NOT NULL;
