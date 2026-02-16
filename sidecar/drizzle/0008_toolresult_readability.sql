CREATE TABLE IF NOT EXISTS `agent_toolresult_readability` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `entry_id` TEXT NOT NULL,
  `session_id` TEXT NOT NULL,
  `turn_id` TEXT,
  `tool_call_id` TEXT,
  `source_hash` TEXT NOT NULL,
  `source_size` INTEGER NOT NULL DEFAULT 0,
  `rule_summary` TEXT NOT NULL,
  `rule_detail` TEXT NOT NULL,
  `enhanced_summary` TEXT,
  `enhanced_detail` TEXT,
  `enhanced_confidence` REAL,
  `enhanced_model` TEXT,
  `enhanced_reason` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending',
  `latency_ms` INTEGER,
  `error` TEXT,
  `created_at` INTEGER DEFAULT (unixepoch()),
  `updated_at` INTEGER DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS `agent_toolresult_readability_entry_unique`
ON `agent_toolresult_readability` (`entry_id`);

CREATE INDEX IF NOT EXISTS `idx_agent_toolresult_readability_session_created_at`
ON `agent_toolresult_readability` (`session_id`, `created_at`);

CREATE INDEX IF NOT EXISTS `idx_agent_toolresult_readability_session_source_hash`
ON `agent_toolresult_readability` (`session_id`, `source_hash`);
