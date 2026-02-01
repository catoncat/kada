CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`selected_scene` text,
	`selected_outfits` text,
	`selected_props` text,
	`params` text,
	`customer` text,
	`generated_plan` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`text_model` text NOT NULL,
	`image_model` text NOT NULL,
	`is_default` integer DEFAULT false,
	`is_builtin` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `scene_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`primary_image` text,
	`supplementary_images` text,
	`default_lighting` text,
	`recommended_props` text,
	`tags` text,
	`is_outdoor` integer DEFAULT false,
	`style` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`error` text,
	`related_id` text,
	`related_meta` text,
	`created_at` integer,
	`updated_at` integer
);
