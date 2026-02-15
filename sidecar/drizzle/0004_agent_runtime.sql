CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `engine` text NOT NULL DEFAULT 'coding-agent',
  `status` text NOT NULL DEFAULT 'idle',
  `provider_id` text,
  `created_at` integer,
  `updated_at` integer,
  `last_turn_at` integer
);

CREATE TABLE IF NOT EXISTS `agent_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `entry_type` text NOT NULL,
  `parent_entry_id` text,
  `payload_json` text NOT NULL,
  `created_at` integer
);

CREATE TABLE IF NOT EXISTS `agent_events` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `turn_id` text,
  `seq` integer NOT NULL,
  `event_type` text NOT NULL,
  `payload_json` text NOT NULL,
  `created_at` integer
);

CREATE TABLE IF NOT EXISTS `agent_outputs` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `turn_id` text,
  `kind` text NOT NULL,
  `ref_id` text,
  `content_json` text NOT NULL,
  `created_at` integer
);

CREATE INDEX IF NOT EXISTS `agent_events_session_seq_idx` ON `agent_events` (`session_id`, `seq`);
CREATE INDEX IF NOT EXISTS `agent_outputs_session_kind_idx` ON `agent_outputs` (`session_id`, `kind`);
