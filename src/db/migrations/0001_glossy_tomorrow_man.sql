ALTER TYPE "public"."resource_type" ADD VALUE 'benefits' BEFORE 'agents';--> statement-breakpoint
ALTER TYPE "public"."resource_type" ADD VALUE 'travel_compensation' BEFORE 'agents';--> statement-breakpoint
ALTER TYPE "public"."resource_type" ADD VALUE 'compliance_tasks' BEFORE 'agents';--> statement-breakpoint
ALTER TYPE "public"."thing_type" ADD VALUE 'commute_mileage_claim' BEFORE 'payroll_run';--> statement-breakpoint
ALTER TYPE "public"."thing_type" ADD VALUE 'employer_benefit_enrollment' BEFORE 'payroll_run';--> statement-breakpoint
ALTER TYPE "public"."thing_type" ADD VALUE 'compliance_task' BEFORE 'payroll_run';