CREATE TYPE "public"."management_request_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."management_request_status" AS ENUM('open', 'in_progress', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('deadline_7d', 'deadline_3d', 'deadline_1d', 'deadline_today', 'overdue', 'escalation_department', 'escalation_management', 'approval_request', 'approval_decision', 'management_request', 'daily_summary', 'weekly_summary', 'monthly_summary', 'reminder', 'system');--> statement-breakpoint
CREATE TABLE "deadline_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"alert_type" "notification_type" NOT NULL,
	"alert_date" date NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_alert_log_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "management_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requestor_id" uuid NOT NULL,
	"assignee_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority" "management_request_priority" DEFAULT 'medium' NOT NULL,
	"status" "management_request_status" DEFAULT 'open' NOT NULL,
	"response_notes" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"deadline_alerts" integer DEFAULT 1 NOT NULL,
	"escalation_alerts" integer DEFAULT 1 NOT NULL,
	"approval_alerts" integer DEFAULT 1 NOT NULL,
	"management_request_alerts" integer DEFAULT 1 NOT NULL,
	"daily_summary" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deadline_alert_log" ADD CONSTRAINT "deadline_alert_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_alert_log" ADD CONSTRAINT "deadline_alert_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_alert_log" ADD CONSTRAINT "deadline_alert_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_requests" ADD CONSTRAINT "management_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_requests" ADD CONSTRAINT "management_requests_requestor_id_users_id_fk" FOREIGN KEY ("requestor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_requests" ADD CONSTRAINT "management_requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deadline_alert_log_user_idx" ON "deadline_alert_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deadline_alert_log_date_idx" ON "deadline_alert_log" USING btree ("alert_date");--> statement-breakpoint
CREATE INDEX "management_requests_status_idx" ON "management_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "management_requests_assignee_idx" ON "management_requests" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "management_requests_requestor_idx" ON "management_requests" USING btree ("requestor_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");