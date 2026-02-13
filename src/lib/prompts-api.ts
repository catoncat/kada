/**
 * Prompts API 客户端
 * 用于预览服务端拼接后的 effectivePrompt
 */

import { apiUrl } from './api-config';
import type { ArtifactOwnerType } from './artifacts-api';

const PREVIEW_PROMPT_CACHE_STORAGE_KEY = 'spv2.preview_prompt_cache.v2';

export interface PromptOwner {
  type: ArtifactOwnerType;
  id: string;
  slot?: string;
}

export interface PromptComposerMeta {
  key: string;
  id: string;
  name: string;
  version: string;
  mode: 'fixed' | string;
}

export interface ReferencePlanSummary {
  identityBindings: Array<{
    index: number;
    image: string;
    role?: string;
    subjectId?: string;
  }>;
  identitySourceImages: string[];
  identityCollageImage: string | null;
  sceneSanitizedCount: number;
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

export interface PromptOptimizationMeta {
  status: 'optimized' | 'fallback' | 'skipped';
  reason?: string | null;
  providerId?: string | null;
  providerFormat?: string | null;
  textModel?: string | null;
  assumptions: string[];
  conflicts: string[];
  negativePrompt?: string | null;
}

export interface PreviewImagePromptResponse {
  effectivePrompt: string;
  renderPrompt?: string;
  promptOptimization?: PromptOptimizationMeta;
  composer?: PromptComposerMeta;
  studioTemplateId?: string | null;
  promptContext?: Record<string, unknown>;
  referencePlan?: ReferencePlanSummary;
}

interface PreviewPromptCacheEntry {
  signature: string;
  value: PreviewImagePromptResponse;
}

const previewPromptCache = new Map<string, PreviewPromptCacheEntry>();
const previewPromptInflight = new Map<
  string,
  Promise<PreviewImagePromptResponse>
>();
let previewPromptCacheHydrated = false;

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next ? next : null;
}

function normalizeStringArray(values?: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const output: string[] = [];
  for (const value of values) {
    const next = toTrimmedString(value);
    if (!next) continue;
    output.push(next);
  }
  return output;
}

function normalizeOwner(owner?: PromptOwner): PromptOwner | undefined {
  if (!owner) return undefined;
  const id = toTrimmedString(owner.id);
  const slot = toTrimmedString(owner.slot || '');
  if (!id) return undefined;
  return {
    type: owner.type,
    id,
    ...(slot ? { slot } : null),
  };
}

function buildPreviewPromptCacheKey(input: {
  prompt: string;
  owner?: PromptOwner;
  editInstruction?: string;
  providerId?: string;
  referenceImages?: string[];
  currentImagePath?: string | null;
  includeCurrentImageAsReference?: boolean;
}): { key: string; signature: string } {
  const normalized = {
    prompt: toTrimmedString(input.prompt) || '',
    owner: normalizeOwner(input.owner) || null,
    editInstruction: toTrimmedString(input.editInstruction || ''),
    providerId: toTrimmedString(input.providerId || ''),
    referenceImages: normalizeStringArray(input.referenceImages),
    currentImagePath: toTrimmedString(input.currentImagePath || ''),
    includeCurrentImageAsReference:
      input.includeCurrentImageAsReference !== false,
  };
  const signature = stableStringify(normalized);
  const key = `sig:${hashString(signature)}`;
  return { key, signature };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(String(value));
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function canUseLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  );
}

function hydratePreviewPromptCache() {
  if (previewPromptCacheHydrated) return;
  previewPromptCacheHydrated = true;
  if (!canUseLocalStorage()) return;

  try {
    const raw = window.localStorage.getItem(PREVIEW_PROMPT_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PreviewPromptCacheEntry>;
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.signature !== 'string') continue;
      if (!entry.value || typeof entry.value !== 'object') continue;
      previewPromptCache.set(key, entry);
    }
  } catch {
    // ignore cache hydration errors
  }
}

function persistPreviewPromptCache() {
  if (!canUseLocalStorage()) return;
  try {
    const serialized: Record<string, PreviewPromptCacheEntry> = {};
    for (const [key, entry] of previewPromptCache.entries()) {
      serialized[key] = entry;
    }
    window.localStorage.setItem(
      PREVIEW_PROMPT_CACHE_STORAGE_KEY,
      JSON.stringify(serialized),
    );
  } catch {
    // ignore storage quota errors
  }
}

function getPreviewPromptCachedValue(
  cacheKey: string,
  signature: string,
): PreviewImagePromptResponse | null {
  hydratePreviewPromptCache();
  const entry = previewPromptCache.get(cacheKey);
  if (!entry) return null;
  if (entry.signature !== signature) return null;
  return entry.value;
}

function setPreviewPromptCachedValue(
  cacheKey: string,
  signature: string,
  value: PreviewImagePromptResponse,
) {
  hydratePreviewPromptCache();
  previewPromptCache.set(cacheKey, { signature, value });
  persistPreviewPromptCache();
}

export function clearPreviewImagePromptCache() {
  previewPromptCache.clear();
  previewPromptInflight.clear();
  if (canUseLocalStorage()) {
    window.localStorage.removeItem(PREVIEW_PROMPT_CACHE_STORAGE_KEY);
  }
}

export async function previewImagePrompt(
  input: {
    prompt: string;
    owner?: PromptOwner;
    editInstruction?: string;
    providerId?: string;
    referenceImages?: string[];
    currentImagePath?: string | null;
    includeCurrentImageAsReference?: boolean;
  },
  options?: { forceRefresh?: boolean },
): Promise<PreviewImagePromptResponse> {
  const { key: cacheKey, signature } = buildPreviewPromptCacheKey(input);
  if (!options?.forceRefresh) {
    const cached = getPreviewPromptCachedValue(cacheKey, signature);
    if (cached) return cached;

    const inflight = previewPromptInflight.get(signature);
    if (inflight) return inflight;
  }

  const request = (async (): Promise<PreviewImagePromptResponse> => {
    const res = await fetch(apiUrl('/api/prompts/preview-image'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || '预览 effectivePrompt 失败');
    }
    const parsed = data as PreviewImagePromptResponse;
    setPreviewPromptCachedValue(cacheKey, signature, parsed);
    return parsed;
  })().finally(() => {
    previewPromptInflight.delete(signature);
  });

  previewPromptInflight.set(signature, request);
  return request;
}
