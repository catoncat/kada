/**
 * Provider API 客户端
 * 与 Sidecar 的 /api/providers 交互
 */

import { apiUrl } from './api-config';

export interface Provider {
  id: string;
  name: string;
  format: 'gemini' | 'openai' | 'local';
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  isDefault: boolean;
  isBuiltin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateProviderInput = Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateProviderInput = Partial<Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * 获取所有 Providers
 */
export async function fetchProviders(): Promise<Provider[]> {
  const response = await fetch(apiUrl('/api/providers'));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取 Providers 失败');
  }
  return data.providers;
}

/**
 * 获取默认 Provider
 */
export async function fetchDefaultProvider(): Promise<Provider | null> {
  const response = await fetch(apiUrl('/api/providers/default'));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取默认 Provider 失败');
  }
  return data.provider;
}

/**
 * 获取单个 Provider
 */
export async function fetchProvider(id: string): Promise<Provider> {
  const response = await fetch(apiUrl(`/api/providers/${id}`));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Provider 不存在');
  }
  return data.provider;
}

/**
 * 创建 Provider
 */
export async function createProvider(input: CreateProviderInput): Promise<Provider> {
  const response = await fetch(apiUrl('/api/providers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '创建 Provider 失败');
  }
  return data.provider;
}

/**
 * 更新 Provider
 */
export async function updateProvider(id: string, input: UpdateProviderInput): Promise<Provider> {
  const response = await fetch(apiUrl(`/api/providers/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '更新 Provider 失败');
  }
  return data.provider;
}

/**
 * 删除 Provider
 */
export async function deleteProvider(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/providers/${id}`), {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '删除 Provider 失败');
  }
}

/**
 * 设为默认 Provider
 */
export async function setDefaultProvider(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/providers/${id}/set-default`), {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '设置默认 Provider 失败');
  }
}
