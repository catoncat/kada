import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

// 数据库路径
function getDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'shooting-planner.db');
}

// 数据库实例
let sqlite: Database.Database | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
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
      selected_outfits TEXT,
      selected_props TEXT,
      params TEXT,
      customer TEXT,
      generated_plan TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scene_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      primary_image TEXT,
      supplementary_images TEXT,
      default_lighting TEXT,
      recommended_props TEXT,
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
      description TEXT,
      appearance_prompt TEXT,
      primary_image TEXT,
      reference_images TEXT,
      tags TEXT,
      project_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

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
  `);
}

function ensureColumns() {
  if (!sqlite) return;

  const hasColumn = (table: string, column: string): boolean => {
    const rows = sqlite!.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    return rows.some((r) => r.name === column);
  };

  const addColumnIfMissing = (table: string, column: string, sqlType: string) => {
    if (hasColumn(table, column)) return;
    console.log(`🧩 Adding missing column: ${table}.${column}`);
    sqlite!.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType};`);
  };

  // projects: 历史数据库可能缺少 customer/project_prompt 等列
  addColumnIfMissing('projects', 'project_prompt', 'TEXT');
  addColumnIfMissing('projects', 'customer', 'TEXT');
  addColumnIfMissing('projects', 'selected_props', 'TEXT');
  addColumnIfMissing('projects', 'selected_outfits', 'TEXT');
  addColumnIfMissing('projects', 'params', 'TEXT');
  addColumnIfMissing('projects', 'generated_plan', 'TEXT');
  addColumnIfMissing('projects', 'selected_models', 'TEXT');

  // generation_runs: 历史数据库可能缺少任务关联列
  addColumnIfMissing('generation_runs', 'task_id', 'TEXT');
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
    console.log('📦 Database closed');
  }
}
