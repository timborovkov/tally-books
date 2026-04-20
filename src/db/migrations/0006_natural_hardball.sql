CREATE TABLE "blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_id" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blobs_bucket_key_uniq" UNIQUE("bucket","object_key")
);
--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blobs_bucket_sha256_idx" ON "blobs" USING btree ("bucket","sha256");