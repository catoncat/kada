/**
 * 获取 API 基础路径
 *
 * 开发环境：Vite proxy 会转发 /api/* 到 localhost:3001
 * 生产环境（Tauri）：直接访问 localhost:3001
 */
export function getApiBaseUrl(): string {
  // 检测是否在 Tauri 环境中运行
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  // 开发环境使用相对路径（通过 Vite proxy）
  // 生产环境直接访问 Sidecar
  if (isTauri && import.meta.env.PROD) {
    return 'http://localhost:3001';
  }

  return '';
}

/**
 * 构建完整的 API URL
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
