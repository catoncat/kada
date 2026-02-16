import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

type SqliteDatabase = InstanceType<typeof Database>;

// 数据库路径
function getDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'shooting-planner.db');
}

// 数据库实例
let sqlite: SqliteDatabase | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function getSqlite(): SqliteDatabase {
  if (!sqlite) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return sqlite;
}

export async function initDatabase() {
  const dbPath = getDbPath();
  console.log(`📦 Initializing database at: ${dbPath}`);

  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  db = drizzle(sqlite, { schema });

  // 确保表存在（开发模式使用手动创建，避免迁移冲突）
  ensureTables();
  ensureColumns();

  console.log('✅ Database initialized');
}

function ensureTables() {
  if (!sqlite) return;

  // 创建基础表（如果不存在）
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      routing_profile TEXT DEFAULT 'native',
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      text_model TEXT NOT NULL,
      image_model TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_builtin INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_prompt TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      selected_scene TEXT,
      customer TEXT,
      selected_models TEXT,
      generated_plan TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scene_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      primary_image TEXT,
      default_lighting TEXT,
      tags TEXT,
      is_outdoor INTEGER DEFAULT 0,
      style TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS model_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT,
      age_range_min INTEGER,
      age_range_max INTEGER,
      appearance_prompt TEXT,
      primary_image TEXT,
      reference_images TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS embedding_profiles (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      endpoint TEXT NOT NULL,
      api_key_ref TEXT,
      model TEXT NOT NULL,
      vector_dim INTEGER NOT NULL,
      normalize INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS asset_embeddings (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      vector BLOB NOT NULL,
      vector_norm REAL NOT NULL DEFAULT 0,
      indexed_at INTEGER,
      source_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS asset_embeddings_asset_profile_unique
    ON asset_embeddings(asset_id, profile_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      related_id TEXT,
      related_meta TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'ui',
      status TEXT NOT NULL DEFAULT 'queued',
      related_type TEXT,
      related_id TEXT,
      effective_prompt TEXT,
      prompt_context TEXT,
      diagnostics TEXT,
      validation TEXT,
      parent_run_id TEXT,
      task_id TEXT,
      error TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS generation_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'image',
      mime_type TEXT,
      file_path TEXT,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER,
      owner_type TEXT,
      owner_id TEXT,
      owner_slot TEXT,
      effective_prompt TEXT,
      prompt_context TEXT,
      reference_images TEXT,
      edit_instruction TEXT,
      parent_artifact_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS task_replay_requests (
      id TEXT PRIMARY KEY,
      source_task_id TEXT NOT NULL,
      new_task_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS workspace_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      revision INTEGER NOT NULL DEFAULT 1,
      canvas_viewport TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      last_message_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS workspace_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      action_cards TEXT,
      meta TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS workspace_nodes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 220,
      height INTEGER NOT NULL DEFAULT 160,
      z_index INTEGER NOT NULL DEFAULT 1,
      group_id TEXT,
      meta TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'coding-agent',
      status TEXT NOT NULL DEFAULT 'idle',
      provider_id TEXT,
      archived_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      last_turn_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      parent_entry_id TEXT,
      payload_json TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_id TEXT,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_outputs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_id TEXT,
      kind TEXT NOT NULL,
      ref_id TEXT,
      content_json TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

function ensureColumns() {
  if (!sqlite) return;

  const hasColumn = (table: string, column: string): boolean => {
    const rows = sqlite!.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name?: string;
    }>;
    return rows.some((r) => r.name === column);
  };

  const addColumnIfMissing = (
    table: string,
    column: string,
    sqlType: string,
  ) => {
    if (hasColumn(table, column)) return;
    console.log(`🧩 Adding missing column: ${table}.${column}`);
    sqlite!.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType};`);
  };

  // projects: 历史数据库可能缺少 customer/project_prompt 等列
  addColumnIfMissing('projects', 'project_prompt', 'TEXT');
  addColumnIfMissing('projects', 'customer', 'TEXT');
  addColumnIfMissing('projects', 'generated_plan', 'TEXT');
  addColumnIfMissing('projects', 'selected_models', 'TEXT');

  // generation_runs: 历史数据库可能缺少任务关联列
  addColumnIfMissing('generation_runs', 'task_id', 'TEXT');
  addColumnIfMissing('generation_runs', 'diagnostics', 'TEXT');
  addColumnIfMissing('generation_runs', 'validation', 'TEXT');

  // providers: 历史数据库可能缺少能力探测列
  addColumnIfMissing('providers', 'routing_profile', "TEXT DEFAULT 'native'");
  addColumnIfMissing('providers', 'capabilities', 'TEXT');

  // embedding_profiles: 迭代期补列
  addColumnIfMissing('embedding_profiles', 'provider_id', 'TEXT');
  addColumnIfMissing('embedding_profiles', 'endpoint', "TEXT DEFAULT ''");
  addColumnIfMissing('embedding_profiles', 'api_key_ref', 'TEXT');
  addColumnIfMissing('embedding_profiles', 'model', "TEXT DEFAULT ''");
  addColumnIfMissing('embedding_profiles', 'vector_dim', 'INTEGER DEFAULT 0');
  addColumnIfMissing(
    'embedding_profiles',
    'normalize',
    'INTEGER NOT NULL DEFAULT 1',
  );
  addColumnIfMissing(
    'embedding_profiles',
    'status',
    "TEXT NOT NULL DEFAULT 'active'",
  );
  addColumnIfMissing('embedding_profiles', 'created_at', 'INTEGER');
  addColumnIfMissing('embedding_profiles', 'updated_at', 'INTEGER');

  // asset_embeddings: 迭代期补列
  addColumnIfMissing('asset_embeddings', 'asset_id', 'TEXT');
  addColumnIfMissing('asset_embeddings', 'profile_id', 'TEXT');
  addColumnIfMissing('asset_embeddings', 'vector', 'BLOB');
  addColumnIfMissing(
    'asset_embeddings',
    'vector_norm',
    'REAL NOT NULL DEFAULT 0',
  );
  addColumnIfMissing('asset_embeddings', 'indexed_at', 'INTEGER');
  addColumnIfMissing('asset_embeddings', 'source_hash', "TEXT DEFAULT ''");
  addColumnIfMissing(
    'asset_embeddings',
    'version',
    'INTEGER NOT NULL DEFAULT 1',
  );
  addColumnIfMissing('asset_embeddings', 'created_at', 'INTEGER');
  addColumnIfMissing('asset_embeddings', 'updated_at', 'INTEGER');

  // workspace_sessions: 迭代期补列
  addColumnIfMissing(
    'workspace_sessions',
    'status',
    "TEXT NOT NULL DEFAULT 'active'",
  );
  addColumnIfMissing(
    'workspace_sessions',
    'revision',
    'INTEGER NOT NULL DEFAULT 1',
  );
  addColumnIfMissing('workspace_sessions', 'canvas_viewport', 'TEXT');
  addColumnIfMissing('workspace_sessions', 'last_message_at', 'INTEGER');

  // workspace_messages: 迭代期补列
  addColumnIfMissing('workspace_messages', 'action_cards', 'TEXT');
  addColumnIfMissing('workspace_messages', 'meta', 'TEXT');

  // workspace_nodes: 迭代期补列
  addColumnIfMissing('workspace_nodes', 'group_id', 'TEXT');
  addColumnIfMissing('workspace_nodes', 'meta', 'TEXT');

  // agent_sessions: 迭代期补列
  addColumnIfMissing(
    'agent_sessions',
    'engine',
    "TEXT NOT NULL DEFAULT 'coding-agent'",
  );
  addColumnIfMissing(
    'agent_sessions',
    'status',
    "TEXT NOT NULL DEFAULT 'idle'",
  );
  addColumnIfMissing('agent_sessions', 'provider_id', 'TEXT');
  addColumnIfMissing('agent_sessions', 'archived_at', 'INTEGER');
  addColumnIfMissing('agent_sessions', 'last_turn_at', 'INTEGER');

  // agent_entries: 迭代期补列
  addColumnIfMissing('agent_entries', 'parent_entry_id', 'TEXT');
  addColumnIfMissing(
    'agent_entries',
    'payload_json',
    "TEXT NOT NULL DEFAULT '{}'",
  );

  // agent_events: 迭代期补列
  addColumnIfMissing('agent_events', 'turn_id', 'TEXT');
  addColumnIfMissing('agent_events', 'seq', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(
    'agent_events',
    'event_type',
    "TEXT NOT NULL DEFAULT 'unknown'",
  );
  addColumnIfMissing(
    'agent_events',
    'payload_json',
    "TEXT NOT NULL DEFAULT '{}'",
  );

  // agent_outputs: 迭代期补列
  addColumnIfMissing('agent_outputs', 'turn_id', 'TEXT');
  addColumnIfMissing('agent_outputs', 'ref_id', 'TEXT');
  addColumnIfMissing(
    'agent_outputs',
    'content_json',
    "TEXT NOT NULL DEFAULT '{}'",
  );
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
    console.log('📦 Database closed');
  }
}
