import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  assetEmbeddings,
  embeddingProfiles,
  modelAssets,
  sceneAssets,
  tasks,
  type AssetEmbedding,
  type EmbeddingProfile,
} from '../../db/schema';
import { topKByCosine } from './cosine';
import { ApiMultimodalEmbeddingProvider } from './provider';
import {
  deleteVecEntry,
  getVectorEngineStatus,
  isSqliteVecAvailable,
  resetVecTable,
  searchVecKnn,
  upsertVecEntry,
} from './vector-engine';
import {
  calculateVectorNorm,
  fromFloat32Buffer,
  normalizeVector,
  toFloat32Buffer,
} from './vector-codec';

const EMBEDDING_TASK_TYPES = ['embedding-index', 'embedding-reindex'] as const;
const FALLBACK_MAX_CANDIDATES = 4000;

export interface EmbeddingProfileInput {
  id?: string;
  providerId?: string | null;
  endpoint: string;
  apiKeyRef?: string | null;
  model: string;
  vectorDim: number;
  normalize?: boolean;
}

export interface EmbeddingSearchInput {
  queryType: 'text' | 'image';
  text?: string;
  imagePath?: string;
  imageBase64?: string;
  assetId?: string;
  topK?: number;
  candidateAssetIds?: string[];
}

export interface EmbeddingSearchResultItem {
  assetId: string;
  profileId: string;
  score: number;
  distance: number | null;
  source: 'sqlite-vec' | 'fallback-scan';
  similarity?: number;
  asset: {
    assetType: 'scene' | 'model' | 'upload' | 'unknown';
    name: string | null;
    imagePath: string | null;
  };
}

export interface IndexAssetEmbeddingInput {
  assetId: string;
  profileId?: string;
  imagePath?: string;
  force?: boolean;
  version?: number;
}

export interface IndexAssetEmbeddingResult {
  assetId: string;
  profileId: string | null;
  status: 'indexed' | 'skipped';
  reason?: string;
}

interface ResolvedAssetRecord {
  assetType: 'scene' | 'model' | 'upload' | 'unknown';
  name: string | null;
  imagePath: string | null;
}

function now() {
  return new Date();
}

function resolveDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function normalizeUploadPath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  return null;
}

function toAbsolutePath(value: string): string {
  if (path.isAbsolute(value)) return value;
  const normalizedUploadPath = normalizeUploadPath(value);
  if (normalizedUploadPath) {
    return path.join(resolveDataDir(), normalizedUploadPath.slice(1));
  }
  return path.join(resolveDataDir(), value);
}

function toPublicUploadPath(value: string): string | null {
  const normalizedUploadPath = normalizeUploadPath(value);
  if (normalizedUploadPath) return normalizedUploadPath;
  if (path.isAbsolute(value)) {
    const dataDir = resolveDataDir();
    if (value.startsWith(dataDir)) {
      const rel = path.relative(dataDir, value).replace(/\\/g, '/');
      if (rel.startsWith('uploads/')) return `/${rel}`;
    }
  }
  return null;
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sanitizeCandidateAssetIds(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  );
}

function toSafeTopK(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 12;
  const rounded = Math.round(value);
  return Math.max(1, Math.min(64, rounded));
}

function profileRequiresReindex(
  previous: EmbeddingProfile | null,
  next: EmbeddingProfileInput,
): boolean {
  if (!previous) return true;
  if ((previous.providerId || null) !== (next.providerId || null)) return true;
  if ((previous.apiKeyRef || null) !== (next.apiKeyRef || null)) return true;
  if (previous.endpoint.trim() !== next.endpoint.trim()) return true;
  if (previous.model.trim() !== next.model.trim()) return true;
  if (previous.vectorDim !== next.vectorDim) return true;
  if (Boolean(previous.normalize) !== Boolean(next.normalize ?? true)) return true;
  return false;
}

function ensureValidVector(values: number[], expectedDim: number) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding API returned empty vector');
  }
  if (values.length !== expectedDim) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDim}, got ${values.length}`,
    );
  }
}

async function resolveCurrentProfileRow(): Promise<EmbeddingProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(embeddingProfiles)
    .orderBy(desc(embeddingProfiles.updatedAt));
  const active = rows.find((row) => row.status === 'active');
  if (active) return active;
  return rows.find((row) => row.status === 'reindexing') || null;
}

async function resolveProfileById(id: string): Promise<EmbeddingProfile | null> {
  const db = getDb();
  const [profile] = await db
    .select()
    .from(embeddingProfiles)
    .where(eq(embeddingProfiles.id, id))
    .limit(1);
  return profile || null;
}

export async function getActiveEmbeddingProfile(): Promise<EmbeddingProfile | null> {
  return resolveCurrentProfileRow();
}

export async function saveEmbeddingProfile(
  input: EmbeddingProfileInput,
): Promise<{ profile: EmbeddingProfile; needsReindex: boolean }> {
  const endpoint = input.endpoint.trim();
  const model = input.model.trim();
  const vectorDim = Math.round(input.vectorDim);
  if (!endpoint) throw new Error('endpoint 不能为空');
  if (!model) throw new Error('model 不能为空');
  if (!Number.isFinite(vectorDim) || vectorDim <= 0) {
    throw new Error('vectorDim 必须是正整数');
  }

  const db = getDb();
  const current = await resolveCurrentProfileRow();
  const targetId = input.id?.trim() || current?.id || randomUUID();
  const currentForTarget =
    (await resolveProfileById(targetId)) || current || null;
  const needsReindex = profileRequiresReindex(currentForTarget, {
    ...input,
    endpoint,
    model,
    vectorDim,
  });
  const status = needsReindex ? 'reindexing' : 'active';
  const timestamp = now();

  await db
    .update(embeddingProfiles)
    .set({
      status: 'disabled',
      updatedAt: timestamp,
    })
    .run();

  await db
    .insert(embeddingProfiles)
    .values({
      id: targetId,
      providerId: input.providerId?.trim() || null,
      endpoint,
      apiKeyRef: input.apiKeyRef?.trim() || null,
      model,
      vectorDim,
      normalize: input.normalize ?? true,
      status,
      createdAt: currentForTarget?.createdAt || timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: embeddingProfiles.id,
      set: {
        providerId: input.providerId?.trim() || null,
        endpoint,
        apiKeyRef: input.apiKeyRef?.trim() || null,
        model,
        vectorDim,
        normalize: input.normalize ?? true,
        status,
        updatedAt: timestamp,
      },
    })
    .run();

  const [saved] = await db
    .select()
    .from(embeddingProfiles)
    .where(eq(embeddingProfiles.id, targetId))
    .limit(1);

  if (!saved) {
    throw new Error('保存 embedding profile 失败');
  }

  return { profile: saved, needsReindex };
}

export async function setEmbeddingProfileStatus(
  profileId: string,
  status: 'active' | 'reindexing' | 'disabled',
) {
  const db = getDb();
  await db
    .update(embeddingProfiles)
    .set({
      status,
      updatedAt: now(),
    })
    .where(eq(embeddingProfiles.id, profileId))
    .run();
}

async function resolveAssetRecord(assetId: string): Promise<ResolvedAssetRecord> {
  if (assetId.startsWith('upload:')) {
    const fileName = assetId.slice('upload:'.length).trim();
    return {
      assetType: 'upload',
      name: fileName || null,
      imagePath: fileName ? `/uploads/${fileName}` : null,
    };
  }

  const db = getDb();
  const [scene] = await db
    .select({
      id: sceneAssets.id,
      name: sceneAssets.name,
      primaryImage: sceneAssets.primaryImage,
    })
    .from(sceneAssets)
    .where(eq(sceneAssets.id, assetId))
    .limit(1);
  if (scene) {
    return {
      assetType: 'scene',
      name: scene.name,
      imagePath: scene.primaryImage || null,
    };
  }

  const [model] = await db
    .select({
      id: modelAssets.id,
      name: modelAssets.name,
      primaryImage: modelAssets.primaryImage,
      referenceImages: modelAssets.referenceImages,
    })
    .from(modelAssets)
    .where(eq(modelAssets.id, assetId))
    .limit(1);
  if (model) {
    let fallbackRef: string | null = null;
    try {
      const parsed = model.referenceImages
        ? (JSON.parse(model.referenceImages) as unknown)
        : [];
      if (Array.isArray(parsed)) {
        const [first] = parsed.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        );
        fallbackRef = first || null;
      }
    } catch {
      fallbackRef = null;
    }

    return {
      assetType: 'model',
      name: model.name,
      imagePath: model.primaryImage || fallbackRef,
    };
  }

  return {
    assetType: 'unknown',
    name: null,
    imagePath: null,
  };
}

async function resolveImagePathForIndex(input: {
  assetId: string;
  explicitImagePath?: string;
}): Promise<{ absolutePath: string; publicPath: string | null; sourceHash: string }> {
  let imagePath = input.explicitImagePath;
  if (!imagePath) {
    const record = await resolveAssetRecord(input.assetId);
    imagePath = record.imagePath || undefined;
  }

  if (!imagePath) {
    throw new Error(`Asset ${input.assetId} has no image path`);
  }

  const absolutePath = toAbsolutePath(imagePath);
  const publicPath = toPublicUploadPath(imagePath) || toPublicUploadPath(absolutePath);
  const fileBuffer = await readFile(absolutePath);
  const sourceHash = hashBuffer(fileBuffer);
  return { absolutePath, publicPath, sourceHash };
}

async function getProvider() {
  return new ApiMultimodalEmbeddingProvider();
}

function buildProviderConfig(profile: EmbeddingProfile) {
  return {
    endpoint: profile.endpoint,
    apiKey: profile.apiKeyRef || null,
    model: profile.model,
  };
}

function toTaskSafeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'Unknown error');
}

export async function indexAssetEmbedding(
  input: IndexAssetEmbeddingInput,
): Promise<IndexAssetEmbeddingResult> {
  const db = getDb();
  const profile = input.profileId
    ? await resolveProfileById(input.profileId)
    : await resolveCurrentProfileRow();

  if (!profile || profile.status === 'disabled') {
    return {
      assetId: input.assetId,
      profileId: null,
      status: 'skipped',
      reason: 'No active embedding profile',
    };
  }

  const { absolutePath, sourceHash } = await resolveImagePathForIndex({
    assetId: input.assetId,
    explicitImagePath: input.imagePath,
  });

  const [existing] = await db
    .select()
    .from(assetEmbeddings)
    .where(
      and(
        eq(assetEmbeddings.assetId, input.assetId),
        eq(assetEmbeddings.profileId, profile.id),
      ),
    )
    .limit(1);

  if (
    existing &&
    existing.sourceHash === sourceHash &&
    !input.force
  ) {
    return {
      assetId: input.assetId,
      profileId: profile.id,
      status: 'skipped',
      reason: 'Source hash unchanged',
    };
  }

  const provider = await getProvider();
  let vector = await provider.embedImage({
    imagePath: absolutePath,
    config: buildProviderConfig(profile),
  });

  ensureValidVector(vector, profile.vectorDim);
  if (profile.normalize) {
    vector = normalizeVector(vector);
  }
  const vectorNorm = calculateVectorNorm(vector);
  const vectorBuffer = toFloat32Buffer(vector);

  const id = existing?.id || randomUUID();
  const timestamp = now();
  await db
    .insert(assetEmbeddings)
    .values({
      id,
      assetId: input.assetId,
      profileId: profile.id,
      vector: vectorBuffer,
      vectorNorm,
      indexedAt: timestamp,
      sourceHash,
      version: input.version ?? existing?.version ?? 1,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [assetEmbeddings.assetId, assetEmbeddings.profileId],
      set: {
        vector: vectorBuffer,
        vectorNorm,
        indexedAt: timestamp,
        sourceHash,
        version: input.version ?? existing?.version ?? 1,
        updatedAt: timestamp,
      },
    })
    .run();

  if (isSqliteVecAvailable()) {
    try {
      upsertVecEntry({
        assetId: input.assetId,
        profileId: profile.id,
        vector,
      });
    } catch (error) {
      console.warn(
        '[Embedding] sqlite-vec upsert failed, fallback scan still available:',
        toTaskSafeError(error),
      );
    }
  }

  return {
    assetId: input.assetId,
    profileId: profile.id,
    status: 'indexed',
  };
}

export async function reindexAllAssets(
  profileId?: string,
): Promise<{
  profileId: string;
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  failures: Array<{ assetId: string; error: string }>;
}> {
  const db = getDb();
  const profile = profileId
    ? await resolveProfileById(profileId)
    : await resolveCurrentProfileRow();
  if (!profile) throw new Error('No active embedding profile');

  await setEmbeddingProfileStatus(profile.id, 'reindexing');

  await db
    .delete(assetEmbeddings)
    .where(eq(assetEmbeddings.profileId, profile.id))
    .run();
  if (isSqliteVecAvailable()) {
    try {
      resetVecTable();
    } catch (error) {
      console.warn(
        '[Embedding] sqlite-vec reset failed, will continue with fallback-scan:',
        toTaskSafeError(error),
      );
    }
  }

  const scenes = await db
    .select({
      id: sceneAssets.id,
      imagePath: sceneAssets.primaryImage,
    })
    .from(sceneAssets);
  const models = await db
    .select({
      id: modelAssets.id,
      primaryImage: modelAssets.primaryImage,
      referenceImages: modelAssets.referenceImages,
    })
    .from(modelAssets);

  const targets: Array<{ assetId: string; imagePath?: string }> = [];
  for (const scene of scenes) {
    if (scene.imagePath?.trim()) {
      targets.push({ assetId: scene.id, imagePath: scene.imagePath });
    }
  }
  for (const model of models) {
    let imagePath = model.primaryImage || null;
    if (!imagePath && model.referenceImages) {
      try {
        const parsed = JSON.parse(model.referenceImages) as unknown;
        if (Array.isArray(parsed)) {
          const first = parsed.find(
            (item): item is string =>
              typeof item === 'string' && item.trim().length > 0,
          );
          if (first) imagePath = first;
        }
      } catch {
        imagePath = null;
      }
    }
    if (imagePath?.trim()) {
      targets.push({ assetId: model.id, imagePath });
    }
  }

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ assetId: string; error: string }> = [];

  for (const target of targets) {
    try {
      const result = await indexAssetEmbedding({
        assetId: target.assetId,
        imagePath: target.imagePath,
        profileId: profile.id,
        force: true,
      });
      if (result.status === 'indexed') indexed += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        assetId: target.assetId,
        error: toTaskSafeError(error),
      });
    }
  }

  await setEmbeddingProfileStatus(profile.id, 'active');
  return {
    profileId: profile.id,
    total: targets.length,
    indexed,
    skipped,
    failed,
    failures,
  };
}

export async function searchEmbeddings(
  input: EmbeddingSearchInput,
): Promise<{
  profileId: string;
  queryType: 'text' | 'image';
  source: 'sqlite-vec' | 'fallback-scan';
  vectorEngine: ReturnType<typeof getVectorEngineStatus>;
  results: EmbeddingSearchResultItem[];
}> {
  const profile = await resolveCurrentProfileRow();
  if (!profile || profile.status === 'disabled') {
    throw new Error('No active embedding profile');
  }

  const provider = await getProvider();
  const config = buildProviderConfig(profile);
  const topK = toSafeTopK(input.topK);
  const candidateAssetIds = sanitizeCandidateAssetIds(input.candidateAssetIds);

  let queryVector: number[];
  if (input.queryType === 'text') {
    const text = input.text?.trim();
    if (!text) throw new Error('text query is required');
    queryVector = await provider.embedText({ text, config });
  } else {
    let imagePath = input.imagePath;
    if (!imagePath && input.assetId) {
      const record = await resolveAssetRecord(input.assetId);
      imagePath = record.imagePath || undefined;
    }

    queryVector = await provider.embedImage({
      imagePath: imagePath ? toAbsolutePath(imagePath) : undefined,
      imageBase64: input.imageBase64,
      config,
    });
  }

  ensureValidVector(queryVector, profile.vectorDim);
  if (profile.normalize) {
    queryVector = normalizeVector(queryVector);
  }

  const vectorEngine = getVectorEngineStatus();
  const db = getDb();

  if (isSqliteVecAvailable()) {
    try {
      const knn = searchVecKnn({
        vector: queryVector,
        profileId: profile.id,
        topK: Math.max(topK, candidateAssetIds.length ? topK * 3 : topK),
      });

      let filtered = knn;
      if (candidateAssetIds.length > 0) {
        const allowed = new Set(candidateAssetIds);
        filtered = filtered.filter((item) => allowed.has(item.assetId));
      }
      filtered = filtered.slice(0, topK);

      const withAsset = await Promise.all(
        filtered.map(async (item) => {
          const record = await resolveAssetRecord(item.assetId);
          return {
            assetId: item.assetId,
            profileId: profile.id,
            score: item.score,
            distance: item.distance,
            source: 'sqlite-vec' as const,
            asset: record,
          };
        }),
      );

      return {
        profileId: profile.id,
        queryType: input.queryType,
        source: 'sqlite-vec',
        vectorEngine,
        results: withAsset,
      };
    } catch (error) {
      console.warn(
        '[Embedding] sqlite-vec search failed, fallback to cosine scan:',
        toTaskSafeError(error),
      );
    }
  }

  const rows = (await db
    .select()
    .from(assetEmbeddings)
    .where(eq(assetEmbeddings.profileId, profile.id))) as AssetEmbedding[];

  let candidates = rows;
  if (candidateAssetIds.length > 0) {
    const allowed = new Set(candidateAssetIds);
    candidates = candidates.filter((item) => allowed.has(item.assetId));
  }
  candidates = candidates.slice(0, FALLBACK_MAX_CANDIDATES);

  const ranked = topKByCosine({
    query: queryVector,
    candidates: candidates.map((row) => ({
      assetId: row.assetId,
      vector: fromFloat32Buffer(row.vector),
      vectorNorm: row.vectorNorm,
      meta: { indexedAt: row.indexedAt },
    })),
    k: topK,
  });

  const resultRows = await Promise.all(
    ranked.map(async (item) => {
      const record = await resolveAssetRecord(item.assetId);
      return {
        assetId: item.assetId,
        profileId: profile.id,
        score: item.score,
        distance: null,
        similarity: item.similarity,
        source: 'fallback-scan' as const,
        asset: record,
      };
    }),
  );

  return {
    profileId: profile.id,
    queryType: input.queryType,
    source: 'fallback-scan',
    vectorEngine: getVectorEngineStatus(),
    results: resultRows,
  };
}

export async function enqueueEmbeddingTask(params: {
  type: (typeof EMBEDDING_TASK_TYPES)[number];
  input: Record<string, unknown>;
  relatedId?: string | null;
  dedupeRunning?: boolean;
}) {
  const db = getDb();
  if (params.dedupeRunning) {
    const existing = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.type, params.type),
          inArray(tasks.status, ['pending', 'running']),
        ),
      )
      .orderBy(desc(tasks.createdAt))
      .limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
  }

  const taskId = randomUUID();
  const timestamp = now();
  await db.insert(tasks).values({
    id: taskId,
    type: params.type,
    status: 'pending',
    input: JSON.stringify(params.input),
    relatedId: params.relatedId || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const [created] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return created;
}

export async function removeAssetEmbedding(params: {
  assetId: string;
  profileId: string;
}) {
  const db = getDb();
  await db
    .delete(assetEmbeddings)
    .where(
      and(
        eq(assetEmbeddings.assetId, params.assetId),
        eq(assetEmbeddings.profileId, params.profileId),
      ),
    )
    .run();
  if (isSqliteVecAvailable()) {
    try {
      deleteVecEntry(params);
    } catch (error) {
      console.warn('[Embedding] sqlite-vec delete failed:', toTaskSafeError(error));
    }
  }
}

export async function getEmbeddingStatus() {
  const db = getDb();
  const profile = await resolveCurrentProfileRow();
  const engine = getVectorEngineStatus();

  const [allScenes, allModels] = await Promise.all([
    db.select({ id: sceneAssets.id, primaryImage: sceneAssets.primaryImage }).from(sceneAssets),
    db
      .select({
        id: modelAssets.id,
        primaryImage: modelAssets.primaryImage,
        referenceImages: modelAssets.referenceImages,
      })
      .from(modelAssets),
  ]);

  const totalSceneAssets = allScenes.filter((item) => item.primaryImage?.trim()).length;
  const totalModelAssets = allModels.filter((item) => {
    if (item.primaryImage?.trim()) return true;
    if (!item.referenceImages) return false;
    try {
      const parsed = JSON.parse(item.referenceImages) as unknown;
      return Array.isArray(parsed) && parsed.some((v) => typeof v === 'string' && v.trim());
    } catch {
      return false;
    }
  }).length;

  const totalAssets = totalSceneAssets + totalModelAssets;
  const indexedCount = profile
    ? (
        await db
          .select({ id: assetEmbeddings.id })
          .from(assetEmbeddings)
          .where(eq(assetEmbeddings.profileId, profile.id))
      ).length
    : 0;

  const embeddingTasks = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.type, EMBEDDING_TASK_TYPES))
    .orderBy(desc(tasks.createdAt))
    .limit(200);

  const taskStats = {
    pending: embeddingTasks.filter((item) => item.status === 'pending').length,
    running: embeddingTasks.filter((item) => item.status === 'running').length,
    completed: embeddingTasks.filter((item) => item.status === 'completed').length,
    failed: embeddingTasks.filter((item) => item.status === 'failed').length,
    latest: embeddingTasks[0] || null,
    latestFailed:
      embeddingTasks.find((item) => item.status === 'failed' && item.error) || null,
  };

  return {
    profile,
    vectorEngine: engine,
    stats: {
      totalAssets,
      indexedAssets: indexedCount,
      coverage: totalAssets > 0 ? indexedCount / totalAssets : 0,
    },
    tasks: taskStats,
  };
}
