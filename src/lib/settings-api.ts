/**
 * Settings API 客户端
 */

const API_BASE = 'http://localhost:3001/api';

/**
 * 获取设置项
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/settings/${key}`);
  if (!res.ok) {
    throw new Error('获取设置失败');
  }
  const data = await res.json();
  return data.value;
}

/**
 * 更新设置项
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    throw new Error('保存设置失败');
  }
}

/**
 * 删除设置项
 */
export async function deleteSetting(key: string): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/${key}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('删除设置失败');
  }
}

/**
 * 批量获取设置项
 */
export async function getSettings(keys: string[]): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/settings/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  });
  if (!res.ok) {
    throw new Error('批量获取设置失败');
  }
  const data = await res.json();
  return data.data;
}
