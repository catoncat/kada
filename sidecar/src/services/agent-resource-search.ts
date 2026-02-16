import path from 'node:path';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import {
  generationArtifacts,
  modelAssets,
  projects,
  sceneAssets,
} from '../db/schema';

export type AgentMentionKind = 'project' | 'scene' | 'model' | 'image';

export interface AgentMentionImageRef {
  id: string;
  kind: AgentMentionKind;
  resourceId: string;
  filePath: string;
  label?: string;
}

export interface AgentMention {
  mentionId: string;
  kind: AgentMentionKind;
  resourceId: string;
  resourceTitle: string;
  images?: AgentMentionImageRef[];
}

export interface AgentResourceSearchItem {
  kind: AgentMentionKind;
  id: string;
  title: string;
  subtitle: string;
  image: string | null;
}

export interface AgentResourceImageListResult {
  found: boolean;
  resourceTitle: string | null;
  data: AgentMentionImageRef[];
}

export interface ResolvedAgentMention extends AgentMention {
  images: AgentMentionImageRef[];
}

export interface ResolvedAgentMentionsResult {
  mentions: ResolvedAgentMention[];
  dropped: Array<{ mentionId: string | null; reason: string }>;
}

const KIND_ORDER: AgentMentionKind[] = ['project', 'scene', 'model', 'image'];
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 80;
const DEFAULT_IMAGE_LIMIT = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toUploadPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return null;
}

function scoreField(field: string, query: string, weight: number): number {
  if (!field || !query) return 0;
  const normalized = field.toLowerCase();
  if (normalized === query) return weight * 3;
  if (normalized.startsWith(query)) return weight * 2;
  if (normalized.includes(query)) return weight;
  return 0;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(value)));
}

function parseModelReferenceImages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) =>
        typeof entry === 'string' ? toUploadPath(entry) : null,
      )
      .filter((entry): entry is string => Boolean(entry));
  } catch {
    return [];
  }
}

function dedupeImages(items: AgentMentionImageRef[]): AgentMentionImageRef[] {
  const seen = new Set<string>();
  const out: AgentMentionImageRef[] = [];
  for (const item of items) {
    const key = `${item.id}::${item.filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function isAgentMentionKind(value: unknown): value is AgentMentionKind {
  return (
    typeof value === 'string' &&
    (value === 'project' ||
      value === 'scene' ||
      value === 'model' ||
      value === 'image')
  );
}

function stableKinds(kinds?: AgentMentionKind[]): AgentMentionKind[] {
  if (!Array.isArray(kinds) || kinds.length === 0) return [...KIND_ORDER];
  const set = new Set(kinds);
  return KIND_ORDER.filter((kind) => set.has(kind));
}

function matchScore(
  query: string,
  fields: Array<{ value: string; weight: number }>,
): number {
  if (!query) return 1;
  return fields.reduce(
    (sum, field) => sum + scoreField(field.value, query, field.weight),
    0,
  );
}

function sortByScoreThenUpdatedAt<T extends { score: number; ts: number }>(
  items: T[],
): T[] {
  return items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.ts - a.ts;
  });
}

export function parseAgentMentionKinds(
  raw: string | null | undefined,
): AgentMentionKind[] {
  if (!raw) return [...KIND_ORDER];
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry): entry is AgentMentionKind => isAgentMentionKind(entry));
  return stableKinds(parsed);
}

async function searchProjects(input: {
  query: string;
  limit: number;
}): Promise<AgentResourceSearchItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      projectPrompt: projects.projectPrompt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .limit(Math.max(input.limit * 4, 40));

  const query = input.query.toLowerCase();
  const scored = rows
    .map((row) => {
      const score = matchScore(query, [
        { value: row.title, weight: 3 },
        { value: row.projectPrompt || '', weight: 1 },
      ]);
      return {
        score,
        ts: row.updatedAt?.getTime() ?? 0,
        item: {
          kind: 'project' as const,
          id: row.id,
          title: row.title,
          subtitle: row.projectPrompt || '项目',
          image: null,
        },
      };
    })
    .filter((entry) => entry.score > 0);

  return sortByScoreThenUpdatedAt(scored)
    .slice(0, input.limit)
    .map((entry) => entry.item);
}

async function searchScenes(input: {
  query: string;
  limit: number;
}): Promise<AgentResourceSearchItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: sceneAssets.id,
      name: sceneAssets.name,
      description: sceneAssets.description,
      primaryImage: sceneAssets.primaryImage,
      updatedAt: sceneAssets.updatedAt,
    })
    .from(sceneAssets)
    .orderBy(desc(sceneAssets.updatedAt))
    .limit(Math.max(input.limit * 4, 40));

  const query = input.query.toLowerCase();
  const scored = rows
    .map((row) => {
      const score = matchScore(query, [
        { value: row.name, weight: 3 },
        { value: row.description || '', weight: 1 },
      ]);
      return {
        score,
        ts: row.updatedAt?.getTime() ?? 0,
        item: {
          kind: 'scene' as const,
          id: row.id,
          title: row.name,
          subtitle: row.description || '场景',
          image: toUploadPath(row.primaryImage),
        },
      };
    })
    .filter((entry) => entry.score > 0);

  return sortByScoreThenUpdatedAt(scored)
    .slice(0, input.limit)
    .map((entry) => entry.item);
}

async function searchModels(input: {
  query: string;
  limit: number;
}): Promise<AgentResourceSearchItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: modelAssets.id,
      name: modelAssets.name,
      gender: modelAssets.gender,
      appearancePrompt: modelAssets.appearancePrompt,
      primaryImage: modelAssets.primaryImage,
      updatedAt: modelAssets.updatedAt,
    })
    .from(modelAssets)
    .orderBy(desc(modelAssets.updatedAt))
    .limit(Math.max(input.limit * 4, 40));

  const query = input.query.toLowerCase();
  const scored = rows
    .map((row) => {
      const score = matchScore(query, [
        { value: row.name, weight: 3 },
        { value: row.appearancePrompt || '', weight: 1 },
      ]);
      return {
        score,
        ts: row.updatedAt?.getTime() ?? 0,
        item: {
          kind: 'model' as const,
          id: row.id,
          title: row.name,
          subtitle: row.gender || row.appearancePrompt || '模特',
          image: toUploadPath(row.primaryImage),
        },
      };
    })
    .filter((entry) => entry.score > 0);

  return sortByScoreThenUpdatedAt(scored)
    .slice(0, input.limit)
    .map((entry) => entry.item);
}

async function searchImages(input: {
  query: string;
  limit: number;
}): Promise<AgentResourceSearchItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: generationArtifacts.id,
      filePath: generationArtifacts.filePath,
      ownerType: generationArtifacts.ownerType,
      ownerSlot: generationArtifacts.ownerSlot,
      effectivePrompt: generationArtifacts.effectivePrompt,
      createdAt: generationArtifacts.createdAt,
    })
    .from(generationArtifacts)
    .where(
      and(
        isNull(generationArtifacts.deletedAt),
        isNotNull(generationArtifacts.filePath),
      ),
    )
    .orderBy(desc(generationArtifacts.createdAt))
    .limit(Math.max(input.limit * 4, 80));

  const query = input.query.toLowerCase();
  const scored = rows
    .map((row) => {
      const normalizedPath = toUploadPath(row.filePath);
      if (!normalizedPath) return null;

      const title = path.basename(normalizedPath);
      const subtitle = [row.ownerType, row.ownerSlot]
        .filter(Boolean)
        .join(' · ');
      const score = matchScore(query, [
        { value: title, weight: 3 },
        { value: subtitle, weight: 1 },
        { value: row.effectivePrompt || '', weight: 1 },
      ]);
      return {
        score,
        ts: row.createdAt?.getTime() ?? 0,
        item: {
          kind: 'image' as const,
          id: row.id,
          title,
          subtitle: subtitle || '图片产物',
          image: normalizedPath,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => entry.score > 0);

  return sortByScoreThenUpdatedAt(scored)
    .slice(0, input.limit)
    .map((entry) => entry.item);
}

export async function searchAgentResources(input: {
  q?: string;
  kinds?: AgentMentionKind[];
  limit?: number;
}): Promise<AgentResourceSearchItem[]> {
  const query = (input.q || '').trim();
  const limit = normalizeLimit(input.limit, DEFAULT_SEARCH_LIMIT);
  const kinds = stableKinds(input.kinds);
  const perKindLimit = Math.max(limit, 10);

  const [projectsResult, scenesResult, modelsResult, imagesResult] =
    await Promise.all([
      kinds.includes('project')
        ? searchProjects({ query, limit: perKindLimit })
        : Promise.resolve([]),
      kinds.includes('scene')
        ? searchScenes({ query, limit: perKindLimit })
        : Promise.resolve([]),
      kinds.includes('model')
        ? searchModels({ query, limit: perKindLimit })
        : Promise.resolve([]),
      kinds.includes('image')
        ? searchImages({ query, limit: perKindLimit })
        : Promise.resolve([]),
    ]);

  const byKind: Record<AgentMentionKind, AgentResourceSearchItem[]> = {
    project: projectsResult,
    scene: scenesResult,
    model: modelsResult,
    image: imagesResult,
  };

  const seen = new Set<string>();
  const output: AgentResourceSearchItem[] = [];
  for (const kind of stableKinds(kinds)) {
    for (const item of byKind[kind]) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
      if (output.length >= limit) {
        return output;
      }
    }
  }

  return output;
}

export async function listAgentResourceImages(input: {
  kind: AgentMentionKind;
  id: string;
  limit?: number;
}): Promise<AgentResourceImageListResult> {
  const db = getDb();
  const limit = normalizeLimit(input.limit, DEFAULT_IMAGE_LIMIT);

  if (input.kind === 'image') {
    const [artifact] = await db
      .select({
        id: generationArtifacts.id,
        filePath: generationArtifacts.filePath,
      })
      .from(generationArtifacts)
      .where(
        and(
          eq(generationArtifacts.id, input.id),
          isNull(generationArtifacts.deletedAt),
        ),
      )
      .limit(1);
    const filePath = toUploadPath(artifact?.filePath);
    if (!artifact || !filePath) {
      return {
        found: false,
        resourceTitle: null,
        data: [],
      };
    }
    return {
      found: true,
      resourceTitle: path.basename(filePath),
      data: [
        {
          id: artifact.id,
          kind: 'image',
          resourceId: artifact.id,
          filePath,
          label: '图片产物',
        },
      ],
    };
  }

  if (input.kind === 'scene') {
    const [scene] = await db
      .select({
        id: sceneAssets.id,
        name: sceneAssets.name,
        primaryImage: sceneAssets.primaryImage,
      })
      .from(sceneAssets)
      .where(eq(sceneAssets.id, input.id))
      .limit(1);
    if (!scene) {
      return {
        found: false,
        resourceTitle: null,
        data: [],
      };
    }

    const output: AgentMentionImageRef[] = [];
    const primaryPath = toUploadPath(scene.primaryImage);
    if (primaryPath) {
      output.push({
        id: `scene:${scene.id}:primary`,
        kind: 'scene',
        resourceId: scene.id,
        filePath: primaryPath,
        label: '场景主图',
      });
    }

    const artifacts = await db
      .select({
        id: generationArtifacts.id,
        filePath: generationArtifacts.filePath,
        ownerSlot: generationArtifacts.ownerSlot,
      })
      .from(generationArtifacts)
      .where(
        and(
          eq(generationArtifacts.ownerType, 'asset'),
          eq(generationArtifacts.ownerId, scene.id),
          isNull(generationArtifacts.deletedAt),
          isNotNull(generationArtifacts.filePath),
        ),
      )
      .orderBy(desc(generationArtifacts.createdAt))
      .limit(limit);

    for (const artifact of artifacts) {
      const normalizedPath = toUploadPath(artifact.filePath);
      if (!normalizedPath) continue;
      output.push({
        id: artifact.id,
        kind: 'image',
        resourceId: artifact.id,
        filePath: normalizedPath,
        label: artifact.ownerSlot || '场景产物',
      });
    }

    return {
      found: true,
      resourceTitle: scene.name,
      data: dedupeImages(output).slice(0, limit),
    };
  }

  if (input.kind === 'model') {
    const [model] = await db
      .select({
        id: modelAssets.id,
        name: modelAssets.name,
        primaryImage: modelAssets.primaryImage,
        referenceImages: modelAssets.referenceImages,
      })
      .from(modelAssets)
      .where(eq(modelAssets.id, input.id))
      .limit(1);
    if (!model) {
      return {
        found: false,
        resourceTitle: null,
        data: [],
      };
    }

    const output: AgentMentionImageRef[] = [];
    const primaryPath = toUploadPath(model.primaryImage);
    if (primaryPath) {
      output.push({
        id: `model:${model.id}:primary`,
        kind: 'model',
        resourceId: model.id,
        filePath: primaryPath,
        label: '模特主图',
      });
    }

    const refs = parseModelReferenceImages(model.referenceImages);
    refs.forEach((filePath, index) => {
      output.push({
        id: `model:${model.id}:ref:${index}`,
        kind: 'model',
        resourceId: model.id,
        filePath,
        label: `模特参考图 ${index + 1}`,
      });
    });

    return {
      found: true,
      resourceTitle: model.name,
      data: dedupeImages(output).slice(0, limit),
    };
  }

  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      selectedScene: projects.selectedScene,
    })
    .from(projects)
    .where(eq(projects.id, input.id))
    .limit(1);

  if (!project) {
    return {
      found: false,
      resourceTitle: null,
      data: [],
    };
  }

  const output: AgentMentionImageRef[] = [];
  if (project.selectedScene) {
    const [scene] = await db
      .select({
        id: sceneAssets.id,
        primaryImage: sceneAssets.primaryImage,
      })
      .from(sceneAssets)
      .where(eq(sceneAssets.id, project.selectedScene))
      .limit(1);
    const scenePrimary = toUploadPath(scene?.primaryImage);
    if (scenePrimary) {
      output.push({
        id: `project:${project.id}:scene:${scene?.id || 'selected'}`,
        kind: 'project',
        resourceId: project.id,
        filePath: scenePrimary,
        label: '项目所选场景主图',
      });
    }
  }

  const projectArtifacts = await db
    .select({
      id: generationArtifacts.id,
      filePath: generationArtifacts.filePath,
      ownerSlot: generationArtifacts.ownerSlot,
    })
    .from(generationArtifacts)
    .where(
      and(
        eq(generationArtifacts.ownerType, 'planScene'),
        eq(generationArtifacts.ownerId, project.id),
        isNull(generationArtifacts.deletedAt),
        isNotNull(generationArtifacts.filePath),
      ),
    )
    .orderBy(desc(generationArtifacts.createdAt))
    .limit(limit);

  for (const artifact of projectArtifacts) {
    const normalizedPath = toUploadPath(artifact.filePath);
    if (!normalizedPath) continue;
    output.push({
      id: artifact.id,
      kind: 'image',
      resourceId: artifact.id,
      filePath: normalizedPath,
      label: artifact.ownerSlot || '项目预览图',
    });
  }

  return {
    found: true,
    resourceTitle: project.title,
    data: dedupeImages(output).slice(0, limit),
  };
}

interface IncomingMentionImageRef {
  id: string;
  resourceId: string;
  filePath: string | null;
}

interface IncomingMention {
  mentionId: string;
  kind: AgentMentionKind;
  resourceId: string;
  resourceTitle: string;
  images: IncomingMentionImageRef[];
}

function parseIncomingMention(raw: unknown): IncomingMention | null {
  if (!isRecord(raw)) return null;
  if (!isAgentMentionKind(raw.kind)) return null;
  const mentionId =
    typeof raw.mentionId === 'string' && raw.mentionId.trim()
      ? raw.mentionId.trim()
      : null;
  const resourceId =
    typeof raw.resourceId === 'string' && raw.resourceId.trim()
      ? raw.resourceId.trim()
      : null;

  if (!mentionId || !resourceId) return null;

  const resourceTitle =
    typeof raw.resourceTitle === 'string' ? raw.resourceTitle.trim() : '';

  const imagesRaw = Array.isArray(raw.images) ? raw.images : [];
  const images = imagesRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id =
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : null;
      const entryResourceId =
        typeof entry.resourceId === 'string' && entry.resourceId.trim()
          ? entry.resourceId.trim()
          : id;
      if (!id || !entryResourceId) return null;
      return {
        id,
        resourceId: entryResourceId,
        filePath:
          typeof entry.filePath === 'string'
            ? toUploadPath(entry.filePath)
            : null,
      } satisfies IncomingMentionImageRef;
    })
    .filter((entry): entry is IncomingMentionImageRef => Boolean(entry));

  return {
    mentionId,
    kind: raw.kind,
    resourceId,
    resourceTitle,
    images,
  };
}

export async function resolveAgentMentionsForRuntime(
  rawMentions: unknown,
): Promise<ResolvedAgentMentionsResult> {
  const incoming = Array.isArray(rawMentions)
    ? rawMentions
        .map((entry) => parseIncomingMention(entry))
        .filter((entry): entry is IncomingMention => Boolean(entry))
    : [];

  const resolved: ResolvedAgentMention[] = [];
  const dropped: Array<{ mentionId: string | null; reason: string }> = [];

  for (const mention of incoming) {
    const imageList = await listAgentResourceImages({
      kind: mention.kind,
      id: mention.resourceId,
    });

    if (!imageList.found) {
      dropped.push({
        mentionId: mention.mentionId,
        reason: `resource_not_found:${mention.kind}:${mention.resourceId}`,
      });
      continue;
    }

    const candidateById = new Map<string, AgentMentionImageRef>();
    const candidateByPath = new Map<string, AgentMentionImageRef>();
    for (const image of imageList.data) {
      candidateById.set(image.id, image);
      candidateById.set(image.resourceId, image);
      candidateByPath.set(image.filePath, image);
    }

    const selectedImages: AgentMentionImageRef[] = [];
    for (const image of mention.images) {
      const byId = candidateById.get(image.id) || candidateById.get(image.resourceId);
      const byPath = image.filePath ? candidateByPath.get(image.filePath) : null;
      const matched = byId || byPath;
      if (!matched) {
        dropped.push({
          mentionId: mention.mentionId,
          reason: `image_not_found:${image.resourceId}`,
        });
        continue;
      }
      selectedImages.push(matched);
    }

    if (mention.kind === 'image' && selectedImages.length === 0 && imageList.data[0]) {
      selectedImages.push(imageList.data[0]);
    }

    resolved.push({
      mentionId: mention.mentionId,
      kind: mention.kind,
      resourceId: mention.resourceId,
      resourceTitle: imageList.resourceTitle || mention.resourceTitle || mention.resourceId,
      images: dedupeImages(selectedImages),
    });
  }

  return {
    mentions: resolved,
    dropped,
  };
}

export function buildAgentMentionsContextBlock(
  mentions: ResolvedAgentMention[],
): string {
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return '';
  }
  const payload = mentions.map((mention) => ({
    mentionId: mention.mentionId,
    kind: mention.kind,
    resourceId: mention.resourceId,
    resourceTitle: mention.resourceTitle,
    imagePaths: mention.images.map((image) => image.filePath),
  }));

  return [
    '[MENTIONS_CONTEXT]',
    JSON.stringify({ mentions: payload }, null, 2),
    '[/MENTIONS_CONTEXT]',
  ].join('\n');
}
