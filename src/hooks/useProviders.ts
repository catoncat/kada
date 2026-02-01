/**
 * Provider TanStack Query hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProviders,
  fetchDefaultProvider,
  fetchProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider,
  type Provider,
  type CreateProviderInput,
  type UpdateProviderInput,
} from '@/lib/provider-api';

export const providerKeys = {
  all: ['providers'] as const,
  lists: () => [...providerKeys.all, 'list'] as const,
  list: () => [...providerKeys.lists()] as const,
  details: () => [...providerKeys.all, 'detail'] as const,
  detail: (id: string) => [...providerKeys.details(), id] as const,
  default: () => [...providerKeys.all, 'default'] as const,
};

/**
 * 获取所有 Providers
 */
export function useProviders() {
  return useQuery({
    queryKey: providerKeys.list(),
    queryFn: fetchProviders,
  });
}

/**
 * 获取默认 Provider
 */
export function useDefaultProvider() {
  return useQuery({
    queryKey: providerKeys.default(),
    queryFn: fetchDefaultProvider,
  });
}

/**
 * 获取单个 Provider
 */
export function useProvider(id: string) {
  return useQuery({
    queryKey: providerKeys.detail(id),
    queryFn: () => fetchProvider(id),
    enabled: !!id,
  });
}

/**
 * 创建 Provider
 */
export function useCreateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProviderInput) => createProvider(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });
}

/**
 * 更新 Provider
 */
export function useUpdateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProviderInput }) =>
      updateProvider(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
      queryClient.setQueryData(providerKeys.detail(data.id), data);
    },
  });
}

/**
 * 删除 Provider
 */
export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });
}

/**
 * 设为默认 Provider
 */
export function useSetDefaultProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => setDefaultProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });
}

// 重新导出类型
export type { Provider, CreateProviderInput, UpdateProviderInput };
