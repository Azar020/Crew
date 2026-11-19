CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"timezone_at_check_in" text NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"checked_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_checkout_order_check" CHECK ("attendance"."checked_out_at" IS NULL OR "attendance"."checked_out_at" >= "attendance"."checked_in_at")
);
--> statement-breakpoint
CREATE TABLE "attendance_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_audit_events" ADD CONSTRAINT "attendance_audit_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employee_work_date_unique_idx" ON "attendance" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_open_session_unique_idx" ON "attendance" USING btree ("employee_id") WHERE "attendance"."checked_out_at" IS NULL;--> statement-breakpoint
CREATE INDEX "attendance_owner_checked_in_idx" ON "attendance" USING btree ("employee_id","checked_in_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attendance_work_date_idx" ON "attendance" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "attendance_audit_events_attendance_created_idx" ON "attendance_audit_events" USING btree ("attendance_id","created_at");