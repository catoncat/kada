/**
 * Artifacts API 客户端
 * 与 Sidecar 的 /api/artifacts 交互
 */

import { apiUrl } from './api-config';

export type ArtifactType = 'image' | 'json' | 'text';
export type ArtifactOwnerType = 'asset' | 'projectPlanVersion' | 'planScene';

export interface GenerationArtifact {
  id: string;
  runId: string;
  type: ArtifactType;
  mimeType: string | null;
  filePath: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  ownerType: ArtifactOwnerType | null;
  ownerId: string | null;
  ownerSlot: string | null;
  effectivePrompt: string | null;
  promptContext: string | null;
  referenceImages: string | null;
  editInstruction: string | null;
  parentArtifactId: string | null;
  createdAt: string | null;
  deletedAt: string | null;
}

export interface ArtifactsListResponse {
  artifacts: GenerationArtifact[];
  currentArtifactId: string | null;
}

export interface FetchArtifactsOptions {
  ownerType: ArtifactOwnerType;
  ownerId: string;
  slot?: string;
  includeDeleted?: boolean;
}

/**
 * 获取 artifacts 列表
 */
export async function fetchArtifacts(
  options: FetchArtifactsOptions
): Promise<ArtifactsListResponse> {
  const params = new URLSearchParams();
  params.set('ownerType', options.ownerType);
  params.set('ownerId', options.ownerId);
  if (options.slot) params.set('slot', options.slot);
  if (options.includeDeleted) params.set('includeDeleted', 'true');

  const response = await fetch(apiUrl(`/api/artifacts?${params.toString()}`));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取版本列表失败');
  }
  return data;
}

/**
 * 获取单个 artifact
 */
export async function fetchArtifact(id: string): Promise<GenerationArtifact> {
  const response = await fetch(apiUrl(`/api/artifacts/${id}`));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取版本详情失败');
  }
  return data.artifact;
}

/**
 * 设置当前版本
 */
export async function setCurrentArtifact(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/artifacts/${id}/set-current`), {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '切换版本失败');
  }
}

/**
 * 删除 artifact
 */
export async function deleteArtifact(
  id: string,
  options?: { deleteFile?: boolean }
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.deleteFile === false) {
    params.set('deleteFile', 'false');
  }

  const response = await fetch(
    apiUrl(`/api/artifacts/${id}${params.toString() ? `?${params.toString()}` : ''}`),
    { method: 'DELETE' }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '删除版本失败');
  }
}

/**
 * 获取 artifact 的完整 URL
 */
export function getArtifactUrl(filePath: string | null): string | null {
  if (!filePath) return null;
  // filePath 格式为 "uploads/xxx.png"，需要加上前缀
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return apiUrl(normalizedPath);
}

// ===== 存储管理 =====

export interface StorageStats {
  activeArtifacts: number;
  deletedArtifacts: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
}

export interface CleanupResult {
  deletedCount: number;
  freedBytes: number;
  freedMB: number;
}

/**
 * 获取存储统计
 */
export async function fetchStorageStats(): Promise<StorageStats> {
  const response = await fetch(apiUrl('/api/artifacts/stats'));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取存储统计失败');
  }
  return data;
}

/**
 * 清理已删除的 artifacts
 */
export async function cleanupArtifacts(): Promise<CleanupResult> {
  const response = await fetch(apiUrl('/api/artifacts/cleanup'), {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '清理失败');
  }
  return data;
}
