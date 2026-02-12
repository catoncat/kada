/**
 * 模特资产 API 客户端
 */

import type {
  ModelAsset,
  CreateModelAssetInput,
  UpdateModelAssetInput,
  ModelAssetListResponse,
  AutoMatchResult,
} from '@/types/model-asset';
import { apiUrl } from './api-config';

/** 获取模特列表 */
export async function getModelAssets(projectId?: string): Promise<ModelAssetListResponse> {
  const url = projectId
    ? apiUrl(`/api/assets/models?projectId=${encodeURIComponent(projectId)}`)
    : apiUrl('/api/assets/models');
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取模特列表失败');
  }
  return res.json();
}

/** 获取单个模特 */
export async function getModelAsset(id: string): Promise<ModelAsset> {
  const res = await fetch(apiUrl(`/api/assets/models/${id}`));
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取模特失败');
  }
  return res.json();
}

/** 创建模特 */
export async function createModelAsset(input: CreateModelAssetInput): Promise<ModelAsset> {
  const res = await fetch(apiUrl('/api/assets/models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '创建模特失败');
  }
  return res.json();
}

/** 更新模特 */
export async function updateModelAsset(id: string, input: UpdateModelAssetInput): Promise<ModelAsset> {
  const res = await fetch(apiUrl(`/api/assets/models/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '更新模特失败');
  }
  return res.json();
}

/** 删除模特 */
export async function deleteModelAsset(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/assets/models/${id}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '删除模特失败');
  }
}

/** 自动匹配模特 */
export async function autoMatchModels(
  projectId: string,
  people: Array<{ id: string; role: string; gender?: string; age?: number }>,
): Promise<AutoMatchResult> {
  const res = await fetch(apiUrl('/api/assets/models/auto-match'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, people }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '自动匹配失败');
  }
  return res.json();
}
