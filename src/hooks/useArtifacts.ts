/**
 * Artifacts TanStack Query hooks
 * 版本管理相关的 hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchArtifacts,
  fetchArtifact,
  setCurrentArtifact,
  deleteArtifact,
  fetchStorageStats,
  cleanupArtifacts,
  type FetchArtifactsOptions,
  type GenerationArtifact,
  type ArtifactsListResponse,
  type StorageStats,
  type CleanupResult,
} from '@/lib/artifacts-api';

export const artifactKeys = {
  all: ['artifacts'] as const,
  lists: () => [...artifactKeys.all, 'list'] as const,
  list: (options: FetchArtifactsOptions) => [...artifactKeys.lists(), options] as const,
  details: () => [...artifactKeys.all, 'detail'] as const,
  detail: (id: string) => [...artifactKeys.details(), id] as const,
};

/**
 * 获取 artifacts 列表
 * 按 owner 过滤
 */
export function useArtifacts(
  options: FetchArtifactsOptions | null,
  queryOptions?: { enabled?: boolean }
) {
  return useQuery<ArtifactsListResponse>({
    queryKey: artifactKeys.list(options || { ownerType: 'asset', ownerId: '' }),
    queryFn: () => fetchArtifacts(options!),
    enabled: !!options && (queryOptions?.enabled ?? true),
  });
}

/**
 * 获取单个 artifact
 */
export function useArtifact(id: string | null) {
  return useQuery<GenerationArtifact>({
    queryKey: artifactKeys.detail(id || ''),
    queryFn: () => fetchArtifact(id!),
    enabled: !!id,
  });
}

/**
 * 设置当前版本
 */
export function useSetCurrentArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => setCurrentArtifact(id),
    onSuccess: () => {
      // 刷新 artifacts 列表和资产列表
      queryClient.invalidateQueries({ queryKey: artifactKeys.all });
      // 也刷新 scene assets
      queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
    },
  });
}

/**
 * 删除 artifact
 */
export function useDeleteArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteFile = true }: { id: string; deleteFile?: boolean }) =>
      deleteArtifact(id, { deleteFile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactKeys.all });
      queryClient.invalidateQueries({ queryKey: ['sceneAssets'] });
    },
  });
}

// 导出类型
export type { GenerationArtifact, ArtifactsListResponse, FetchArtifactsOptions, StorageStats, CleanupResult };

// ===== 存储管理 hooks =====

export const storageKeys = {
  stats: ['storage', 'stats'] as const,
};

/**
 * 获取存储统计
 */
export function useStorageStats() {
  return useQuery<StorageStats>({
    queryKey: storageKeys.stats,
    queryFn: fetchStorageStats,
  });
}

/**
 * 清理已删除的 artifacts
 */
export function useCleanupArtifacts() {
  const queryClient = useQueryClient();

  return useMutation<CleanupResult>({
    mutationFn: cleanupArtifacts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.stats });
      queryClient.invalidateQueries({ queryKey: artifactKeys.all });
    },
  });
}
