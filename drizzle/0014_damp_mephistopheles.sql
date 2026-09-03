CREATE TYPE "public"."project_department_role" AS ENUM('home', 'contributing');--> statement-breakpoint
CREATE TABLE "project_departments" (
	"project_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"role" "project_department_role" DEFAULT 'contributing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "project_departments" ADD CONSTRAINT "project_departments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_departments" ADD CONSTRAINT "project_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_departments_pk" ON "project_departments" USING btree ("project_id","department_id");--> statement-breakpoint
CREATE INDEX "project_departments_department_idx" ON "project_departments" USING btree ("department_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
UPDATE "tasks" AS t SET "project_id" = m."project_id"
FROM "project_milestone_tasks" AS pmt
INNER JOIN "project_milestones" AS m ON m."id" = pmt."milestone_id"
WHERE t."id" = pmt."task_id" AND t."project_id" IS NULL;--> statement-breakpoint
INSERT INTO "project_departments" ("project_id", "department_id", "role")
SELECT p."id", p."department_id", 'home'::"project_department_role"
FROM "projects" AS p
WHERE p."department_id" IS NOT NULL
ON CONFLICT ("project_id", "department_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "project_departments" ("project_id", "department_id", "role")
SELECT DISTINCT t."project_id", u."department_id", 'contributing'::"project_department_role"
FROM "tasks" AS t
INNER JOIN "users" AS u ON u."id" = t."assignee_id"
INNER JOIN "projects" AS p ON p."id" = t."project_id"
WHERE t."project_id" IS NOT NULL
  AND u."department_id" IS NOT NULL
  AND u."department_id" IS DISTINCT FROM p."department_id"
ON CONFLICT ("project_id", "department_id") DO NOTHING;