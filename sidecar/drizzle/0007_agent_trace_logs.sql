CREATE TABLE IF NOT EXISTS `agent_trace_logs` (
  `seq` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `id` TEXT NOT NULL,
  `trace_id` TEXT NOT NULL,
  `request_id` TEXT,
  `session_id` TEXT,
  `turn_id` TEXT,
  `client_message_id` TEXT,
  `channel` TEXT NOT NULL,
  `event` TEXT NOT NULL,
  `level` TEXT NOT NULL DEFAULT 'info',
  `ok` INTEGER NOT NULL DEFAULT 1,
  `data_json` TEXT NOT NULL,
  `created_at` INTEGER NOT NULL,
  UNIQUE(`id`)
);

CREATE INDEX IF NOT EXISTS `idx_agent_trace_logs_trace_seq`
  ON `agent_trace_logs` (`trace_id`, `seq`);

CREATE INDEX IF NOT EXISTS `idx_agent_trace_logs_session_turn_seq`
  ON `agent_trace_logs` (`session_id`, `turn_id`, `seq`);

CREATE INDEX IF NOT EXISTS `idx_agent_trace_logs_created_at`
  ON `agent_trace_logs` (`created_at`);

CREATE INDEX IF NOT EXISTS `idx_agent_trace_logs_request_id`
  ON `agent_trace_logs` (`request_id`);
