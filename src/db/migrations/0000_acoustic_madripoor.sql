CREATE TYPE "public"."access_level" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('invoices', 'expenses', 'receipts', 'payouts', 'taxes', 'filings', 'legal_documents', 'estimates', 'budgets', 'reports', 'trips', 'agents', 'business_details', 'personal_details');--> statement-breakpoint
CREATE TYPE "public"."thing_state" AS ENUM('draft', 'ready', 'sent', 'filed', 'amending', 'void');--> statement-breakpoint
CREATE TYPE "public"."thing_type" AS ENUM('invoice', 'expense', 'receipt', 'vat_declaration', 'annual_report', 'income_tax_return', 'balance_sheet', 'budget', 'trip', 'trip_report', 'payroll_run', 'scenario', 'billing_arrangement');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"two_factor_secret" text,
	"two_factor_enabled_at" timestamp with time zone,
	"bootstrap_completed_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_2fa_required" CHECK ("users"."two_factor_enabled_at" IS NOT NULL OR "users"."removed_at" IS NOT NULL OR "users"."bootstrap_completed_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"scope" jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"resource_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"access" "access_level" NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_kind" "actor_kind" NOT NULL,
	"agent_id" text,
	"action" text NOT NULL,
	"thing_type" "thing_type",
	"thing_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thing_type" "thing_type" NOT NULL,
	"thing_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_sessions_one_per_thing" UNIQUE("thing_type","thing_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_sessions" ADD CONSTRAINT "edit_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("removed_at") WHERE "users"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_user_expires_idx" ON "sessions" USING btree ("user_id","expires_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invites_email_accepted_idx" ON "invites" USING btree ("email","accepted_at");--> statement-breakpoint
CREATE INDEX "permissions_active_user_idx" ON "permissions" USING btree ("user_id") WHERE "permissions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_log_thing_at_idx" ON "audit_log" USING btree ("thing_type","thing_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_at_idx" ON "audit_log" USING btree ("actor_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "edit_sessions_heartbeat_idx" ON "edit_sessions" USING btree ("last_heartbeat_at");