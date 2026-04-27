CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense', 'asset', 'liability', 'equity');--> statement-breakpoint
CREATE TYPE "public"."category_scope" AS ENUM('entity', 'personal', 'global');--> statement-breakpoint
CREATE TYPE "public"."expense_paid_by" AS ENUM('entity', 'personal_reimbursable', 'personal_no_reimburse');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('not_applicable', 'pending', 'paid_back');--> statement-breakpoint
ALTER TYPE "public"."resource_type" ADD VALUE 'categories' BEFORE 'payouts';--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" "category_scope" NOT NULL,
	"entity_id" text,
	"name" text NOT NULL,
	"parent_id" text,
	"kind" "category_kind" NOT NULL,
	"code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_entity_scope_match" CHECK (("categories"."scope" = 'entity') = ("categories"."entity_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "expense_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"version_num" integer NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"semantic_summary" text,
	"actor_id" text,
	"actor_kind" "actor_kind" NOT NULL,
	"agent_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_versions_monotonic" UNIQUE("expense_id","version_num")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"category_id" text,
	"vendor" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"amount_in_base" numeric(20, 4),
	"vat_amount" numeric(20, 4),
	"vat_rate" numeric(6, 4),
	"vat_deductible" boolean DEFAULT true NOT NULL,
	"paid_by" "expense_paid_by" DEFAULT 'entity' NOT NULL,
	"reimbursement_status" "reimbursement_status" DEFAULT 'not_applicable' NOT NULL,
	"linked_receipt_id" text,
	"linked_transaction_id" text,
	"trip_id" text,
	"description" text,
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
ALTER TABLE "categories" ADD CONSTRAINT "categories_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_versions" ADD CONSTRAINT "expense_versions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_versions" ADD CONSTRAINT "expense_versions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_linked_receipt_id_receipts_id_fk" FOREIGN KEY ("linked_receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_scope_entity_idx" ON "categories" USING btree ("scope","entity_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_entity_kind_active_idx" ON "categories" USING btree ("entity_id","kind","archived_at") WHERE "categories"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "expense_versions_expense_ver_idx" ON "expense_versions" USING btree ("expense_id","version_num" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expense_versions_created_at_idx" ON "expense_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "expenses_entity_occurred_idx" ON "expenses" USING btree ("entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_linked_receipt_idx" ON "expenses" USING btree ("linked_receipt_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "expenses_reimbursement_idx" ON "expenses" USING btree ("paid_by","reimbursement_status") WHERE "expenses"."reimbursement_status" <> 'not_applicable';--> statement-breakpoint
CREATE INDEX "expenses_state_active_idx" ON "expenses" USING btree ("state") WHERE "expenses"."state" <> 'void';--> statement-breakpoint
-- Hand-edited: DEFERRABLE INITIALLY DEFERRED FK so expenses + first
-- version row can land in one transaction (docs/data-model.md §3.1).
-- drizzle-kit can't emit DEFERRABLE; this constraint is added by hand,
-- mirroring receipts (0004_smooth_maria_hill.sql). Do not regenerate.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_current_version_id_expense_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."expense_versions"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;