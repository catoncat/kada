CREATE TABLE `workspace_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`canvas_viewport` text,
	`created_at` integer,
	`updated_at` integer,
	`last_message_at` integer
);
--> statement-breakpoint
CREATE TABLE `workspace_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`action_cards` text,
	`meta` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `workspace_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text,
	`x` integer DEFAULT 0 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`width` integer DEFAULT 220 NOT NULL,
	`height` integer DEFAULT 160 NOT NULL,
	`z_index` integer DEFAULT 1 NOT NULL,
	`group_id` text,
	`meta` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `selected_models` text;
