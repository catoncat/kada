/**
 * 在独立窗口中打开设置面板（Tauri 2 多窗口）
 * 非 Tauri 环境下回退到路由导航
 */

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const LABEL = 'settings';

/**
 * 打开设置窗口，如果已存在则聚焦
 * @param fallbackNavigate 非 Tauri 环境的回退导航函数
 */
export async function openSettingsWindow(
  fallbackNavigate?: () => void,
): Promise<void> {
  if (!isTauri) {
    fallbackNavigate?.();
    return;
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  // 已有窗口则聚焦
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }

  // 创建新窗口
  const w = new WebviewWindow(LABEL, {
    url: '/settings',
    title: '设置',
    width: 860,
    height: 640,
    resizable: true,
    center: true,
    titleBarStyle: 'overlay',
    hiddenTitle: true,
  });

  w.once('tauri://error', (e) => {
    console.error('Failed to create settings window:', e);
  });
}

/**
 * 当前是否运行在独立设置窗口中
 */
export function isSettingsWindow(): boolean {
  if (!isTauri) return false;
  try {
    // getCurrentWebviewWindow 是同步的，直接读取 __TAURI_INTERNALS__
    // 使用动态 import 的同步调用方式 — 但此处需要同步结果，
    // 所以直接访问 Tauri 内部结构判断 label
    const meta = (window as any).__TAURI_INTERNALS__?.metadata;
    return meta?.currentWebview?.label === LABEL;
  } catch {
    return false;
  }
}
