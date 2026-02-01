/**
 * AI API 客户端
 * 前端调用统一 AI API 的辅助函数
 */

import type { ProviderConfig, ModelInfo } from '@/types/provider';
import { getProviderConfig } from './provider-storage';
import { inferModelCapabilities } from './providers/model-classifier';
import { apiUrl } from './api-config';

/**
 * 获取当前 Provider 配置（如果有）
 */
export function getCurrentProvider(): ProviderConfig | null {
  return getProviderConfig();
}

/**
 * 检查是否配置了在线 API
 */
export function hasApiConfig(): boolean {
  const config = getProviderConfig();
  return !!config?.apiKey;
}

/**
 * 获取模型列表
 */
export async function fetchModelList(): Promise<ModelInfo[]> {
  const provider = getProviderConfig();
  if (!provider) throw new Error('未配置 API 提供商');

  const response = await fetch(apiUrl('/api/ai/models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
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
export async function generateText(prompt: string): Promise<string> {
  const provider = getProviderConfig();
  if (!provider) throw new Error('未配置 API 提供商');

  const response = await fetch(apiUrl('/api/ai/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '文本生成失败');
  }

  return data.text;
}

/**
 * 文生图 API 调用
 */
export async function generateImage(prompt: string): Promise<{
  imageBase64: string;
  mimeType: string;
}> {
  const provider = getProviderConfig();
  if (!provider) throw new Error('未配置 API 提供商');

  const response = await fetch(apiUrl('/api/ai/generate-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider }),
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