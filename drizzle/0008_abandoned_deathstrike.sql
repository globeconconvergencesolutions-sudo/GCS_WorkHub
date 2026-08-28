ALTER TABLE "projects" ADD COLUMN "department_id" uuid;--> statement-breakpoint
UPDATE "projects" SET "department_id" = "users"."department_id" FROM "users" WHERE "projects"."owner_id" = "users"."id" AND "projects"."department_id" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_department_idx" ON "projects" USING btree ("department_id");