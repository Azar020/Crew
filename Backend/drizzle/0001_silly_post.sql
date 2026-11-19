CREATE TABLE "employee_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" text[] NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_audit_events" ADD CONSTRAINT "employee_audit_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_events" ADD CONSTRAINT "employee_audit_events_target_id_employees_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_audit_events_target_created_idx" ON "employee_audit_events" USING btree ("target_id","created_at");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_email_trimmed_check" CHECK ("employees"."email" = btrim("employees"."email", E' \t\n\r\f\013'));
