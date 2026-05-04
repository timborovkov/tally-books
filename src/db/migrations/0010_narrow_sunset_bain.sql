CREATE TYPE "public"."document_kind" AS ENUM('contract', 'addendum', 'invoice_received', 'filing', 'government_mail', 'insurance', 'guide', 'identification', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_owner_type" AS ENUM('party', 'person', 'entity');--> statement-breakpoint
CREATE TYPE "public"."invoice_delivery_method" AS ENUM('e_invoice', 'pdf', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('client', 'supplier', 'contractor', 'employee');--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "party_kind" NOT NULL,
	"name" text NOT NULL,
	"legal_entity_id" text,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tax_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text,
	"kind" "document_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"blob_id" text NOT NULL,
	"owner_type" "document_owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_invoice_counters" (
	"entity_id" text NOT NULL,
	"year" integer NOT NULL,
	"next_seq" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_invoice_counters_entity_id_year_pk" PRIMARY KEY("entity_id","year")
);
--> statement-breakpoint
CREATE TABLE "invoice_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"version_num" integer NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"semantic_summary" text,
	"actor_id" text,
	"actor_kind" "actor_kind" NOT NULL,
	"agent_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_versions_monotonic" UNIQUE("invoice_id","version_num")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"client_id" text,
	"number" text,
	"issue_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" numeric(20, 4),
	"vat_total" numeric(20, 4),
	"currency" text NOT NULL,
	"total_in_base" numeric(20, 4),
	"delivery_method" "invoice_delivery_method" DEFAULT 'pdf' NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_ref" text,
	"mirror_invoice_id" text,
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_entity_number_uniq" UNIQUE("entity_id","number"),
	CONSTRAINT "invoices_number_required_unless_draft_or_void" CHECK ("invoices"."state" IN ('draft', 'void') OR "invoices"."number" IS NOT NULL),
	CONSTRAINT "invoices_filed_ref_state_match" CHECK ("invoices"."filed_ref" IS NULL OR "invoices"."state" IN ('filed', 'sent'))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_blob_id_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."blobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_invoice_counters" ADD CONSTRAINT "entity_invoice_counters_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_versions" ADD CONSTRAINT "invoice_versions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_versions" ADD CONSTRAINT "invoice_versions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_parties_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_mirror_invoice_id_invoices_id_fk" FOREIGN KEY ("mirror_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parties_kind_active_idx" ON "parties" USING btree ("kind","archived_at") WHERE "parties"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "parties_name_idx" ON "parties" USING btree ("name");--> statement-breakpoint
CREATE INDEX "parties_legal_entity_idx" ON "parties" USING btree ("legal_entity_id") WHERE "parties"."legal_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "documents_entity_kind_created_idx" ON "documents" USING btree ("entity_id","kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "documents_active_idx" ON "documents" USING btree ("archived_at") WHERE "documents"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoice_versions_invoice_ver_idx" ON "invoice_versions" USING btree ("invoice_id","version_num" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invoice_versions_created_at_idx" ON "invoice_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoices_entity_issue_date_idx" ON "invoices" USING btree ("entity_id","issue_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invoices_entity_state_idx" ON "invoices" USING btree ("entity_id","state");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_mirror_idx" ON "invoices" USING btree ("mirror_invoice_id") WHERE "invoices"."mirror_invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_unpaid_idx" ON "invoices" USING btree ("entity_id","due_date") WHERE "invoices"."paid_at" IS NULL AND "invoices"."state" = 'sent';--> statement-breakpoint
-- Hand-edited: DEFERRABLE INITIALLY DEFERRED FK so invoices + first
-- version row can land in one transaction (docs/data-model.md §3.1).
-- drizzle-kit can't emit DEFERRABLE; this constraint is added by hand,
-- mirroring expenses (0009_mushy_thunderbolt.sql) and receipts
-- (0004_smooth_maria_hill.sql). Do not regenerate.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_current_version_id_invoice_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."invoice_versions"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;