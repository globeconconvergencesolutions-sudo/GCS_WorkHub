CREATE TYPE "public"."task_approval_status" AS ENUM('requested', 'approved', 'rejected', 'revision_requested');--> statement-breakpoint
CREATE TABLE "task_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"requestor_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"status" "task_approval_status" DEFAULT 'requested' NOT NULL,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_requestor_id_users_id_fk" FOREIGN KEY ("requestor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_approvals_task_idx" ON "task_approvals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_approvals_approver_idx" ON "task_approvals" USING btree ("approver_id");