import { load as loadSqliteVec } from 'sqlite-vec';
import { getSqlite } from '../../db';

export type VectorEngineMode = 'sqlite-vec' | 'fallback-scan';

export interface VectorEngineStatus {
  mode: VectorEngineMode;
  initialized: boolean;
  detail: string | null;
}

let initialized = false;
let mode: VectorEngineMode = 'fallback-scan';
let detail: string | null = null;
let vecDimension: number | null = null;

function parseVectorDimFromCreateSql(sql: string | null | undefined): number | null {
  if (!sql) return null;
  const match = sql.match(/embedding\s+float\[(\d+)\]/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureInitialized() {
  if (!initialized) initializeVectorEngine();
}

export function initializeVectorEngine() {
  if (initialized) return;
  initialized = true;

  try {
    const sqlite = getSqlite();
    loadSqliteVec(sqlite);
    mode = 'sqlite-vec';
    detail = 'sqlite-vec loaded';
    console.log('🧠 Vector engine: sqlite-vec');
  } catch (error) {
    mode = 'fallback-scan';
    detail = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ sqlite-vec unavailable, fallback to cosine scan. ${detail}`);
  }
}

export function getVectorEngineStatus(): VectorEngineStatus {
  return {
    mode,
    initialized,
    detail,
  };
}

export function isSqliteVecAvailable(): boolean {
  return mode === 'sqlite-vec';
}

export function ensureVecTable(vectorDim: number) {
  ensureInitialized();
  if (!isSqliteVecAvailable()) return;

  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='vec_asset_embeddings' LIMIT 1",
    )
    .get() as { sql?: string | null } | undefined;

  const existingDim = parseVectorDimFromCreateSql(row?.sql);
  if (existingDim !== null && existingDim !== vectorDim) {
    sqlite.exec('DROP TABLE IF EXISTS vec_asset_embeddings;');
    vecDimension = null;
  }

  if (existingDim === vectorDim && vecDimension === vectorDim) {
    return;
  }

  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_asset_embeddings
    USING vec0(
      embedding float[${vectorDim}],
      asset_id text,
      profile_id text
    );
  `);
  vecDimension = vectorDim;
}

export function resetVecTable() {
  ensureInitialized();
  if (!isSqliteVecAvailable()) return;
  const sqlite = getSqlite();
  sqlite.exec('DROP TABLE IF EXISTS vec_asset_embeddings;');
  vecDimension = null;
}

export function upsertVecEntry(params: {
  assetId: string;
  profileId: string;
  vector: number[];
}) {
  ensureInitialized();
  if (!isSqliteVecAvailable()) return;
  ensureVecTable(params.vector.length);

  const sqlite = getSqlite();
  sqlite
    .prepare('DELETE FROM vec_asset_embeddings WHERE asset_id = ? AND profile_id = ?')
    .run(params.assetId, params.profileId);
  sqlite
    .prepare(
      'INSERT INTO vec_asset_embeddings (embedding, asset_id, profile_id) VALUES (?, ?, ?)',
    )
    .run(JSON.stringify(params.vector), params.assetId, params.profileId);
}

export function deleteVecEntry(params: { assetId: string; profileId: string }) {
  ensureInitialized();
  if (!isSqliteVecAvailable()) return;
  const sqlite = getSqlite();
  sqlite
    .prepare('DELETE FROM vec_asset_embeddings WHERE asset_id = ? AND profile_id = ?')
    .run(params.assetId, params.profileId);
}

export function searchVecKnn(params: {
  vector: number[];
  profileId: string;
  topK: number;
}): Array<{ assetId: string; profileId: string; distance: number; score: number }> {
  ensureInitialized();
  if (!isSqliteVecAvailable()) return [];

  ensureVecTable(params.vector.length);
  const sqlite = getSqlite();

  const fetchLimit = Math.max(params.topK * 4, params.topK + 10);
  const rows = sqlite
    .prepare(`
      SELECT asset_id as assetId, profile_id as profileId, distance
      FROM vec_asset_embeddings
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance ASC
    `)
    .all(JSON.stringify(params.vector), fetchLimit) as Array<{
    assetId: string;
    profileId: string;
    distance: number;
  }>;

  const filtered = rows
    .filter((row) => row.profileId === params.profileId)
    .slice(0, params.topK)
    .map((row) => ({
      assetId: row.assetId,
      profileId: row.profileId,
      distance: row.distance,
      score: 1 / (1 + Math.max(0, row.distance)),
    }));

  return filtered;
}
