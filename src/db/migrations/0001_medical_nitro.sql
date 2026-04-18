CREATE TYPE "public"."entity_kind" AS ENUM('legal', 'personal');--> statement-breakpoint
CREATE TYPE "public"."period_kind" AS ENUM('month', 'quarter', 'year', 'custom');--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"freeform_context_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdictions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"legal_name" text NOT NULL,
	"tax_residency" text,
	"ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"name" text NOT NULL,
	"entity_type" text,
	"jurisdiction_id" text NOT NULL,
	"business_id" text,
	"vat_registered" boolean DEFAULT false NOT NULL,
	"vat_number" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"financial_year_start_month" integer NOT NULL,
	"base_currency" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_fy_start_month_range" CHECK ("entities"."financial_year_start_month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "entity_person_links" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text NOT NULL,
	"share_percent" numeric(7, 4),
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"kind" "period_kind" NOT NULL,
	"label" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lock_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_periods_entity_kind_label_uniq" UNIQUE("entity_id","kind","label")
);
--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_person_links" ADD CONSTRAINT "entity_person_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_person_links" ADD CONSTRAINT "entity_person_links_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_jurisdiction_idx" ON "entities" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "entities_active_idx" ON "entities" USING btree ("archived_at") WHERE "entities"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "entity_person_links_entity_idx" ON "entity_person_links" USING btree ("entity_id","valid_to");--> statement-breakpoint
CREATE INDEX "entity_person_links_person_idx" ON "entity_person_links" USING btree ("person_id","valid_to");--> statement-breakpoint
CREATE INDEX "financial_periods_entity_kind_start_idx" ON "financial_periods" USING btree ("entity_id","kind","start_at");