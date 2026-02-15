CREATE TABLE IF NOT EXISTS `embedding_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `provider_id` text,
  `endpoint` text NOT NULL,
  `api_key_ref` text,
  `model` text NOT NULL,
  `vector_dim` integer NOT NULL,
  `normalize` integer NOT NULL DEFAULT 1,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer,
  `updated_at` integer
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `asset_embeddings` (
  `id` text PRIMARY KEY NOT NULL,
  `asset_id` text NOT NULL,
  `profile_id` text NOT NULL,
  `vector` blob NOT NULL,
  `vector_norm` real NOT NULL DEFAULT 0,
  `indexed_at` integer,
  `source_hash` text NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` integer,
  `updated_at` integer
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `asset_embeddings_asset_profile_unique`
ON `asset_embeddings` (`asset_id`, `profile_id`);
