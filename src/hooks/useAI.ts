/**
 * AI 相关的 TanStack Query hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchModelList, generateText, generateImage } from '@/lib/ai-client';
import { useDefaultProvider } from '@/hooks/useProviders';

// Query Keys
export const queryKeys = {
  models: ['models'] as const,
  provider: ['provider'] as const,
};

/**
 * 获取模型列表
 */
export function useModels() {
  const { data: provider } = useDefaultProvider();

  return useQuery({
    queryKey: queryKeys.models,
    queryFn: () => fetchModelList(provider ?? undefined),
    enabled: !!provider?.apiKey,
    staleTime: 1000 * 60 * 10, // 10 分钟
  });
}

/**
 * 文生文 mutation
 */
export function useGenerateText() {
  return useMutation({
    mutationFn: (prompt: string) => generateText(prompt),
  });
}

/**
 * 文生图 mutation
 */
export function useGenerateImage() {
  return useMutation({
    mutationFn: (prompt: string) => generateImage(prompt),
  });
}

/**
 * 刷新模型列表
 */
export function useRefreshModels() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.models });
  };
}
