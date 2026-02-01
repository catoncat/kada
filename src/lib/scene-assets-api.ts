/**
 * 场景资产 API 客户端
 */

import type {
  SceneAsset,
  CreateSceneAssetInput,
  UpdateSceneAssetInput,
  SceneAssetListResponse,
} from '@/types/scene-asset';

const API_BASE = 'http://localhost:3001/api';

/** 获取场景列表 */
export async function getSceneAssets(): Promise<SceneAssetListResponse> {
  const res = await fetch(`${API_BASE}/assets/scenes`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取场景列表失败');
  }
  return res.json();
}

/** 获取单个场景 */
export async function getSceneAsset(id: string): Promise<SceneAsset> {
  const res = await fetch(`${API_BASE}/assets/scenes/${id}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取场景失败');
  }
  return res.json();
}

/** 创建场景 */
export async function createSceneAsset(input: CreateSceneAssetInput): Promise<SceneAsset> {
  const res = await fetch(`${API_BASE}/assets/scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '创建场景失败');
  }
  return res.json();
}

/** 更新场景 */
export async function updateSceneAsset(id: string, input: UpdateSceneAssetInput): Promise<SceneAsset> {
  const res = await fetch(`${API_BASE}/assets/scenes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '更新场景失败');
  }
  return res.json();
}

/** 删除场景 */
export async function deleteSceneAsset(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/assets/scenes/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '删除场景失败');
  }
}

/** 上传图片 */
export async function uploadImage(file: File): Promise<{ filename: string; path: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '上传失败');
  }

  return res.json();
}

/** 删除图片 */
export async function deleteImage(filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}/upload/${filename}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '删除图片失败');
  }
}

/** 获取图片完整 URL */
export function getImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `http://localhost:3001${path}`;
}
