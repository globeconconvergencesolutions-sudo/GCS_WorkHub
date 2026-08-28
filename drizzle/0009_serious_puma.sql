CREATE TYPE "public"."management_request_kind" AS ENUM('leadership', 'work');--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TABLE "management_requests" ADD COLUMN "kind" "management_request_kind" DEFAULT 'leadership' NOT NULL;