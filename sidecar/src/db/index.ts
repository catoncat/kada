import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

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

  // 执行迁移
  const migrationsPath = path.join(process.cwd(), 'drizzle');
  if (existsSync(migrationsPath)) {
    migrate(db, { migrationsFolder: migrationsPath });
    console.log('✅ Database migrations applied');
  }

  // 确保表存在（开发模式）
  ensureTables();

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

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'single',
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
    console.log('📦 Database closed');
  }
}
