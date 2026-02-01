CREATE TABLE `generation_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`type` text DEFAULT 'image' NOT NULL,
	`mime_type` text,
	`file_path` text,
	`width` integer,
	`height` integer,
	`size_bytes` integer,
	`owner_type` text,
	`owner_id` text,
	`owner_slot` text,
	`effective_prompt` text,
	`prompt_context` text,
	`reference_images` text,
	`edit_instruction` text,
	`parent_artifact_id` text,
	`created_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`trigger` text DEFAULT 'ui' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`related_type` text,
	`related_id` text,
	`effective_prompt` text,
	`prompt_context` text,
	`parent_run_id` text,
	`task_id` text,
	`error` text,
	`created_at` integer,
	`updated_at` integer
);
