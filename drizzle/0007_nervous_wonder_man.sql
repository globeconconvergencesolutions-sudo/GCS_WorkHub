ALTER TYPE "public"."task_category" ADD VALUE 'other';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "category_custom" text;