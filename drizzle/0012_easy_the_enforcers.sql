ALTER TABLE "deliverables" ADD COLUMN "evidence_public_id" text;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "evidence_bytes" integer;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "evidence_mime_type" text;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "evidence_original_name" text;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN "bytes" integer;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN "original_name" text;