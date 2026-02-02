/**
 * 最近访问记录管理
 */

const STORAGE_KEY = 'command-search-recents';
const MAX_RECENTS = 5;

/** 最近访问项 */
export interface RecentItem {
  type: 'project' | 'scene';
  id: string;
  title: string;
  timestamp: number;
}

/** 获取最近访问记录 */
export function getRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentItem[];
  } catch {
    return [];
  }
}

/** 添加访问记录 */
export function addRecent(item: Omit<RecentItem, 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  const recents = getRecents();

  // 移除已存在的相同项
  const filtered = recents.filter(
    (r) => !(r.type === item.type && r.id === item.id)
  );

  // 添加到开头
  const newItem: RecentItem = {
    ...item,
    timestamp: Date.now(),
  };

  const updated = [newItem, ...filtered].slice(0, MAX_RECENTS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage 满了或不可用，忽略
  }
}

/** 移除访问记录 */
export function removeRecent(type: 'project' | 'scene', id: string): void {
  if (typeof window === 'undefined') return;

  const recents = getRecents();
  const filtered = recents.filter(
    (r) => !(r.type === type && r.id === id)
  );

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // 忽略
  }
}

/** 清空访问记录 */
export function clearRecents(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
