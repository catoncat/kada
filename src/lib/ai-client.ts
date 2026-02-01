/**
 * AI API 客户端
 * 前端调用统一 AI API 的辅助函数
 */

import type { ModelInfo } from '@/types/provider';
import type { Provider } from '@/lib/provider-api';
import { fetchDefaultProvider } from '@/lib/provider-api';
import { inferModelCapabilities } from './providers/model-classifier';
import { apiUrl } from './api-config';

// 缓存默认 Provider（避免每次调用都请求 API）
let cachedProvider: Provider | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 秒缓存

/**
 * 获取默认 Provider（带缓存）
 */
async function getDefaultProviderCached(): Promise<Provider | null> {
  const now = Date.now();
  if (cachedProvider && now - cacheTimestamp < CACHE_TTL) {
    return cachedProvider;
  }

  try {
    cachedProvider = await fetchDefaultProvider();
    cacheTimestamp = now;
    return cachedProvider;
  } catch {
    return cachedProvider; // 返回旧缓存
  }
}

/**
 * 清除 Provider 缓存（在设置页面修改后调用）
 */
export function clearProviderCache(): void {
  cachedProvider = null;
  cacheTimestamp = 0;
}

/**
 * 检查是否配置了在线 API
 */
export async function hasApiConfig(): Promise<boolean> {
  const provider = await getDefaultProviderCached();
  return !!provider && provider.format !== 'local' && !!provider.apiKey;
}

/**
 * 同步版本的 hasApiConfig（使用缓存，可能不准确）
 */
export function hasApiConfigSync(): boolean {
  return !!cachedProvider && cachedProvider.format !== 'local' && !!cachedProvider.apiKey;
}

/**
 * 获取模型列表
 */
export async function fetchModelList(provider?: Provider): Promise<ModelInfo[]> {
  const p = provider || (await getDefaultProviderCached());
  if (!p) throw new Error('未配置 API 提供商');

  const response = await fetch(apiUrl('/api/ai/models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: p }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取模型列表失败');
  }

  return (data.models || []).map((m: any) => ({
    ...m,
    capabilities: inferModelCapabilities(m),
  }));
}

/**
 * 文生文 API 调用
 */
export async function generateText(prompt: string, provider?: Provider): Promise<string> {
  const p = provider || (await getDefaultProviderCached());
  if (!p) throw new Error('未配置 API 提供商');

  const response = await fetch(apiUrl('/api/ai/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider: p }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '文本生成失败');
  }

  return data.text;
}

/**
 * 图片生成选项
 */
export interface ImageGenerationOptions {
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 宽高比（如 "16:9", "1:1"） */
  aspectRatio?: string;
  /** 参考图片（base64 或 URL） */
  referenceImages?: string[];
}

/**
 * 文生图 API 调用（支持图+文生图）
 */
export async function generateImage(
  prompt: string,
  options?: ImageGenerationOptions,
  provider?: Provider
): Promise<{
  imageBase64: string;
  mimeType: string;
}> {
  const p = provider || (await getDefaultProviderCached());
  if (!p) throw new Error('未配置 API 提供商');

  const response = await fetch(apiUrl('/api/ai/generate-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      provider: p,
      referenceImages: options?.referenceImages,
      options: {
        width: options?.width,
        height: options?.height,
        aspectRatio: options?.aspectRatio,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '图片生成失败');
  }

  return {
    imageBase64: data.imageBase64,
    mimeType: data.mimeType,
  };
}

/**
 * 预加载 Provider 缓存
 */
export async function preloadProviderCache(): Promise<void> {
  await getDefaultProviderCached();
}
