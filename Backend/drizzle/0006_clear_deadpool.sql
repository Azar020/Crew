CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "leave_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"leave_request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" text[] NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "status" "leave_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "leave_type" text DEFAULT 'casual' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_audit_events" ADD CONSTRAINT "leave_audit_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_audit_events_leave_created_idx" ON "leave_audit_events" USING btree ("leave_request_id","created_at");--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_employees_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_status_idx" ON "leave_requests" USING btree ("employee_id","status");