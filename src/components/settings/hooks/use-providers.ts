/**
 * Provider 管理 Hook
 * 使用 TanStack Query 封装 Provider CRUD 操作
 */

import { useMemo } from 'react';
import {
  useProviders as useProvidersQuery,
  useDefaultProvider as useDefaultProviderQuery,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  useSetDefaultProvider,
  type Provider,
  type CreateProviderInput,
  type UpdateProviderInput,
} from '@/hooks/useProviders';

export function useProviders() {
  const providersQuery = useProvidersQuery();
  const defaultProviderQuery = useDefaultProviderQuery();
  const createMutation = useCreateProvider();
  const updateMutation = useUpdateProvider();
  const deleteMutation = useDeleteProvider();
  const setDefaultMutation = useSetDefaultProvider();

  // 过滤掉 local 模式的 Provider
  const providers = useMemo(() => {
    return (providersQuery.data || []).filter(p => p.format !== 'local');
  }, [providersQuery.data]);

  // 如果默认是 local，选择第一个 API Provider
  const defaultProvider = useMemo(() => {
    const def = defaultProviderQuery.data;
    if (def?.format === 'local') {
      return providers[0] || null;
    }
    return def || null;
  }, [defaultProviderQuery.data, providers]);

  const isLoading = providersQuery.isLoading || defaultProviderQuery.isLoading;

  // 添加 Provider
  const addProvider = async (input: Omit<CreateProviderInput, 'isBuiltin'>) => {
    return createMutation.mutateAsync({ ...input, isBuiltin: false });
  };

  // 更新 Provider
  const updateProvider = async (id: string, updates: UpdateProviderInput) => {
    return updateMutation.mutateAsync({ id, input: updates });
  };

  // 删除 Provider
  const deleteProvider = async (id: string) => {
    return deleteMutation.mutateAsync(id);
  };

  // 设置默认 Provider
  const setAsDefault = async (id: string) => {
    return setDefaultMutation.mutateAsync(id);
  };

  // 刷新列表
  const refresh = () => {
    providersQuery.refetch();
    defaultProviderQuery.refetch();
  };

  return {
    providers,
    defaultProvider,
    isLoading,
    addProvider,
    updateProvider,
    deleteProvider,
    setAsDefault,
    refresh,
  };
}

// 重新导出类型
export type { Provider, CreateProviderInput, UpdateProviderInput };
