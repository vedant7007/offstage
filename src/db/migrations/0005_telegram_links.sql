CREATE TABLE "telegram_links" (
	"chat_id_hash" text PRIMARY KEY NOT NULL,
	"chat_id_enc" text NOT NULL,
	"phone_hash" text,
	"recipient_type" text,
	"recipient_id" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "telegram_links_phone_hash_index" ON "telegram_links" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "telegram_links_recipient_id_index" ON "telegram_links" USING btree ("recipient_id");