/**
 * 模型获取 Hook
 * 封装模型列表获取和分类逻辑
 */

import { useState, useCallback } from 'react';
import type { ProviderConfig, ModelInfo } from '@/types/provider';
import { inferModelCapabilities } from '@/lib/providers/model-classifier';
import { apiUrl } from '@/lib/api-config';

interface UseModelFetcherReturn {
  models: ModelInfo[];
  textModels: ModelInfo[];
  imageModels: ModelInfo[];
  isLoading: boolean;
  error: string | null;
  fetchModels: (provider: ProviderConfig) => Promise<void>;
  reset: () => void;
}

export function useModelFetcher(): UseModelFetcherReturn {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async (provider: ProviderConfig) => {
    if (!provider.apiKey) {
      setError('请先填写 API Key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/api/ai/models'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '获取模型列表失败');
      }

      // 为每个模型推断能力
      const modelsWithCaps: ModelInfo[] = (data.models || []).map((m: any) => ({
        ...m,
        capabilities: inferModelCapabilities(m),
      }));

      setModels(modelsWithCaps);
    } catch (err: any) {
      setError(err.message);
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setModels([]);
    setError(null);
    setIsLoading(false);
  }, []);

  // 过滤出文生文模型（text 能力，排除纯 image 模型）
  const textModels = models.filter(m =>
    m.capabilities.includes('text') && !m.capabilities.every(c => c === 'image')
  );

  // 过滤出文生图模型
  const imageModels = models.filter(m => m.capabilities.includes('image'));

  return {
    models,
    textModels,
    imageModels,
    isLoading,
    error,
    fetchModels,
    reset,
  };
}
