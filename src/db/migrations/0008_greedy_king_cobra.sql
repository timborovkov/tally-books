CREATE TYPE "public"."intake_ocr_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."intake_status" AS ENUM('new', 'needs_review', 'routed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."intake_target_flow" AS ENUM('expense', 'trip', 'mileage', 'benefit', 'compliance_evidence');--> statement-breakpoint
CREATE TABLE "intake_items" (
	"id" text PRIMARY KEY NOT NULL,
	"blob_id" text NOT NULL,
	"uploaded_by_id" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "intake_status" DEFAULT 'new' NOT NULL,
	"is_personal" text,
	"entity_id" text,
	"target_flow" "intake_target_flow",
	"receipt_id" text,
	"ocr_status" "intake_ocr_status" DEFAULT 'queued' NOT NULL,
	"ocr_error" text,
	"extraction" jsonb,
	"extraction_provider" text,
	"previous_route_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_blob_id_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."blobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intake_items_status_uploaded_idx" ON "intake_items" USING btree ("status","uploaded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "intake_items_entity_idx" ON "intake_items" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "intake_items_receipt_idx" ON "intake_items" USING btree ("receipt_id");