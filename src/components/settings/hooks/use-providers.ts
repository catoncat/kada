/**
 * Provider 管理 Hook
 * 封装 Provider CRUD 操作，过滤掉本地模式
 */

import { useState, useEffect, useCallback } from 'react';
import type { ProviderConfig } from '@/types/provider';
import {
  getProvidersStorage,
  getAllProviders as _getAllProviders,
  getDefaultProvider,
  addProvider as _addProvider,
  updateProvider as _updateProvider,
  deleteProvider as _deleteProvider,
  setDefaultProvider as _setDefaultProvider,
} from '@/lib/provider-storage';

export function useProviders() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [defaultProvider, setDefaultProviderState] = useState<ProviderConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 加载 Providers（过滤掉 local 模式）
  const loadProviders = useCallback(() => {
    const storage = getProvidersStorage();
    // 过滤掉 local 模式的 Provider
    const apiProviders = storage.providers.filter(p => p.format !== 'local');
    setProviders(apiProviders);

    // 获取默认 Provider
    const defaultP = getDefaultProvider();
    // 如果默认是 local，选择第一个 API Provider
    if (defaultP?.format === 'local') {
      setDefaultProviderState(apiProviders[0] || null);
    } else {
      setDefaultProviderState(defaultP);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // 添加 Provider
  const addProvider = useCallback((provider: Omit<ProviderConfig, 'id'>) => {
    const newProvider = _addProvider(provider);
    loadProviders();
    return newProvider;
  }, [loadProviders]);

  // 更新 Provider
  const updateProvider = useCallback((id: string, updates: Partial<ProviderConfig>) => {
    _updateProvider(id, updates);
    loadProviders();
  }, [loadProviders]);

  // 删除 Provider
  const deleteProvider = useCallback((id: string) => {
    _deleteProvider(id);
    loadProviders();
  }, [loadProviders]);

  // 设置默认 Provider
  const setAsDefault = useCallback((id: string) => {
    _setDefaultProvider(id);
    loadProviders();
  }, [loadProviders]);

  // 刷新列表
  const refresh = useCallback(() => {
    loadProviders();
  }, [loadProviders]);

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
