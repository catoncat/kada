import { and, eq, inArray, isNull } from 'drizzle-orm';
import { generationArtifacts } from '../db/schema';

const MAX_TOTAL_REFERENCE_IMAGES = 8;
const MAX_IDENTITY_REFERENCE_IMAGES = 4;
const MAX_SCENE_REFERENCE_IMAGES = 4;

export interface ReferenceImageOwner {
  type: 'asset' | 'projectPlanVersion' | 'planScene';
  id: string;
  slot?: string;
}

export interface ResolvedReferenceImages {
  modelIdentityImages: string[];
  sceneContextImages: string[];
  allImages: string[];
  droppedGeneratedImages: string[];
}

export interface ReferencePlanSummary {
  totalCount: number;
  order: string[];
  byRole: {
    identity: string[];
    scene: string[];
  };
  droppedGeneratedImages: string[];
  counts: {
    identity: number;
    scene: number;
  };
}

export interface ResolveReferenceImagesInput {
  db: any;
  owner?: ReferenceImageOwner;
  editInstruction?: string;
  modelReferenceImages?: string[];
  modelReferenceSubjects?: ModelReferenceSubject[];
  inputReferenceImages?: string[];
}

export interface ModelReferenceSubject {
  subjectId: string;
  role?: string;
  modelId?: string;
  images: string[];
}

export interface PreviewReferenceInput {
  referenceImages?: string[];
  currentImagePath?: string | null;
  includeCurrentImageAsReference?: boolean;
}

export function normalizeLocalUploadPath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice(1);
  if (raw.startsWith('uploads/')) return raw;
  return null;
}

export function normalizeReferenceValue(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const localUploadPath = normalizeLocalUploadPath(raw);
  if (localUploadPath) return `/${localUploadPath}`;
  return raw;
}

export function normalizeReferenceKey(value: string): string {
  const localUploadPath = normalizeLocalUploadPath(value);
  if (localUploadPath) return `upload:${localUploadPath}`;
  return value.trim();
}

export function dedupeReferenceImages(values?: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const normalized = normalizeReferenceValue(v);
    if (!normalized) continue;
    const key = normalizeReferenceKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function normalizeModelReferenceSubjects(subjects?: ModelReferenceSubject[]): ModelReferenceSubject[] {
  if (!Array.isArray(subjects) || subjects.length === 0) return [];
  const output: ModelReferenceSubject[] = [];
  for (const subject of subjects) {
    if (!subject || typeof subject !== 'object') continue;
    const subjectId = subject.subjectId?.trim();
    if (!subjectId) continue;
    const images = dedupeReferenceImages(subject.images);
    if (images.length === 0) continue;
    output.push({
      subjectId,
      role: subject.role?.trim() || undefined,
      modelId: subject.modelId?.trim() || undefined,
      images,
    });
  }
  return output;
}

function isChildRole(role?: string): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  if (!normalized) return false;
  return /宝宝|宝贝|小孩|儿童|孩子|幼儿|baby|child|kid/.test(normalized);
}

function selectBalancedIdentityImages(
  subjects: ModelReferenceSubject[],
  fallbackModelRefs: string[],
): string[] {
  if (subjects.length === 0) {
    return fallbackModelRefs.slice(0, MAX_IDENTITY_REFERENCE_IMAGES);
  }

  // 儿童摄影默认优先保障孩子主体在参考图中出现，随后按输入顺序轮询补位。
  const prioritizedSubjects = [...subjects].sort((a, b) => {
    const aChild = isChildRole(a.role);
    const bChild = isChildRole(b.role);
    if (aChild === bChild) return 0;
    return aChild ? -1 : 1;
  });

  const selected: string[] = [];
  const seen = new Set<string>();
  const cursors = new Map<string, number>(
    prioritizedSubjects.map((subject) => [subject.subjectId, 0]),
  );

  const pushIfAvailable = (subject: ModelReferenceSubject): boolean => {
    let cursor = cursors.get(subject.subjectId) ?? 0;
    while (cursor < subject.images.length) {
      const candidate = subject.images[cursor];
      cursor += 1;
      const key = normalizeReferenceKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(candidate);
      cursors.set(subject.subjectId, cursor);
      return true;
    }
    cursors.set(subject.subjectId, cursor);
    return false;
  };

  // 第一轮：每个人至少保留一张（在上限内）。
  for (const subject of prioritizedSubjects) {
    if (selected.length >= MAX_IDENTITY_REFERENCE_IMAGES) break;
    pushIfAvailable(subject);
  }

  // 第二轮：按顺序轮询补齐。
  while (selected.length < MAX_IDENTITY_REFERENCE_IMAGES) {
    let progressed = false;
    for (const subject of prioritizedSubjects) {
      if (selected.length >= MAX_IDENTITY_REFERENCE_IMAGES) break;
      if (pushIfAvailable(subject)) {
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  // 最后兜底：补齐历史扁平模型参考（保持去重）。
  for (const ref of fallbackModelRefs) {
    if (selected.length >= MAX_IDENTITY_REFERENCE_IMAGES) break;
    const key = normalizeReferenceKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(ref);
  }

  return selected;
}

export function buildPreviewReferenceInputs(input: PreviewReferenceInput): string[] {
  const includeCurrent = input.includeCurrentImageAsReference ?? true;
  const refs = [
    ...(Array.isArray(input.referenceImages) ? input.referenceImages : []),
    ...(includeCurrent && input.currentImagePath ? [input.currentImagePath] : []),
  ];
  return refs;
}

async function filterOutOwnerGeneratedReferences(
  db: any,
  owner: ReferenceImageOwner | undefined,
  editInstruction: string | undefined,
  refs: string[],
): Promise<{ filtered: string[]; dropped: string[] }> {
  if (!owner || owner.type !== 'planScene' || editInstruction || refs.length === 0) {
    return { filtered: refs, dropped: [] };
  }

  const uploadPaths = Array.from(
    new Set(
      refs
        .map((v) => normalizeLocalUploadPath(v))
        .filter((v): v is string => Boolean(v)),
    ),
  );
  if (uploadPaths.length === 0) return { filtered: refs, dropped: [] };

  const whereParts: any[] = [
    eq(generationArtifacts.ownerType, owner.type),
    eq(generationArtifacts.ownerId, owner.id),
    isNull(generationArtifacts.deletedAt),
    inArray(generationArtifacts.filePath, uploadPaths),
  ];
  if (owner.slot) {
    whereParts.push(eq(generationArtifacts.ownerSlot, owner.slot));
  }

  const ownerArtifacts: Array<{ filePath: string | null }> = await db
    .select({ filePath: generationArtifacts.filePath })
    .from(generationArtifacts)
    .where(and(...whereParts));
  const ownerArtifactPaths = new Set(ownerArtifacts.map((row) => row.filePath).filter(Boolean));

  const filtered: string[] = [];
  const dropped: string[] = [];
  for (const ref of refs) {
    const localUploadPath = normalizeLocalUploadPath(ref);
    if (localUploadPath && ownerArtifactPaths.has(localUploadPath)) {
      dropped.push(ref);
      continue;
    }
    filtered.push(ref);
  }

  return { filtered, dropped };
}

export async function resolveReferenceImages(input: ResolveReferenceImagesInput): Promise<ResolvedReferenceImages> {
  const modelRefs = dedupeReferenceImages(input.modelReferenceImages);
  const modelSubjects = normalizeModelReferenceSubjects(input.modelReferenceSubjects);
  const externalRefs = dedupeReferenceImages(input.inputReferenceImages);
  const modelKeys = new Set(modelRefs.map((v) => normalizeReferenceKey(v)));
  const sceneCandidates = externalRefs.filter((v) => !modelKeys.has(normalizeReferenceKey(v)));

  const { filtered: filteredSceneCandidates, dropped: droppedGeneratedImages } =
    await filterOutOwnerGeneratedReferences(input.db, input.owner, input.editInstruction, sceneCandidates);

  const modelIdentityImages = selectBalancedIdentityImages(modelSubjects, modelRefs);
  const sceneMax = Math.max(
    0,
    Math.min(MAX_SCENE_REFERENCE_IMAGES, MAX_TOTAL_REFERENCE_IMAGES - modelIdentityImages.length),
  );
  const sceneContextImages = filteredSceneCandidates.slice(0, sceneMax);
  const allImages = [...sceneContextImages, ...modelIdentityImages];

  return {
    modelIdentityImages,
    sceneContextImages,
    allImages,
    droppedGeneratedImages,
  };
}

export function buildReferencePlanSummary(resolved: ResolvedReferenceImages): ReferencePlanSummary {
  return {
    totalCount: resolved.allImages.length,
    order: [...resolved.allImages],
    byRole: {
      identity: [...resolved.modelIdentityImages],
      scene: [...resolved.sceneContextImages],
    },
    droppedGeneratedImages: [...resolved.droppedGeneratedImages],
    counts: {
      identity: resolved.modelIdentityImages.length,
      scene: resolved.sceneContextImages.length,
    },
  };
}
