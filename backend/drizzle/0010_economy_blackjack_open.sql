CREATE TABLE "economy_blackjack_open" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"bet" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_blackjack_open_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "economy_blackjack_open" ADD CONSTRAINT "economy_blackjack_open_guild_id_guild_settings_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_settings"("guild_id") ON DELETE cascade ON UPDATE no action;
