CREATE TABLE "attendance_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_breaks_order_check" CHECK ("attendance_breaks"."ended_at" IS NULL OR "attendance_breaks"."ended_at" >= "attendance_breaks"."started_at")
);
--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_breaks_active_unique_idx" ON "attendance_breaks" USING btree ("employee_id") WHERE "attendance_breaks"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "attendance_breaks_attendance_started_idx" ON "attendance_breaks" USING btree ("attendance_id","started_at");--> statement-breakpoint
CREATE INDEX "attendance_breaks_employee_started_idx" ON "attendance_breaks" USING btree ("employee_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);