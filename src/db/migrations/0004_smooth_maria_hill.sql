CREATE TABLE "receipt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"version_num" integer NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"semantic_summary" text,
	"actor_id" text,
	"actor_kind" "actor_kind" NOT NULL,
	"agent_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_versions_monotonic" UNIQUE("receipt_id","version_num")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"vendor" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"notes" text,
	"current_version_id" text,
	"state" "thing_state" DEFAULT 'draft' NOT NULL,
	"auto_refresh_locked" boolean DEFAULT false NOT NULL,
	"refresh_pending" boolean DEFAULT false NOT NULL,
	"underlying_data_changed" boolean DEFAULT false NOT NULL,
	"underlying_data_changed_payload" jsonb,
	"filed_ref" text,
	"filed_at" timestamp with time zone,
	"disclaimer_dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_versions" ADD CONSTRAINT "receipt_versions_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_versions" ADD CONSTRAINT "receipt_versions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_versions_receipt_ver_idx" ON "receipt_versions" USING btree ("receipt_id","version_num" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "receipt_versions_created_at_idx" ON "receipt_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "receipts_entity_occurred_idx" ON "receipts" USING btree ("entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "receipts_state_active_idx" ON "receipts" USING btree ("state") WHERE "receipts"."state" <> 'void';--> statement-breakpoint
-- Hand-edited: DEFERRABLE INITIALLY DEFERRED FK so the parent row and its
-- first version row can be inserted in the same transaction (docs/data-model.md §3.1).
-- drizzle-kit can't emit DEFERRABLE today, so this constraint is added
-- by hand. Do not regenerate — this file is append-only.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_current_version_id_receipt_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."receipt_versions"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;