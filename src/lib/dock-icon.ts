import { getSetting, setSetting } from '@/lib/settings-api';
import { getThemePreference, resolveTheme } from '@/lib/theme';

export type ThemeMode = 'light' | 'dark';
export type PresetId = 'kada-core' | 'kada-knot' | 'kada-mark';

export interface CustomDockIcon {
  id: string;
  name: string;
  lightIconPath: string;
  darkIconPath: string;
}

export interface DockIconConfig {
  selectedIconId: string;
  customIcons: CustomDockIcon[];
}

interface LegacyDockProfile {
  source?: 'preset' | 'custom-path';
  selectedPresetId?: PresetId;
  lightIconPath?: string;
  darkIconPath?: string;
}

const SETTINGS_KEY = 'theme_dock_icon_v1';
const LEGACY_SETTINGS_KEY = 'dock_icon_profiles_v2';
const LEGACY_SETTINGS_KEY_V1 = 'dock_icon_profiles_v1';
const LOCAL_CACHE_KEY = 'kada_theme_dock_icon_cache_v1';

const DEFAULT_PRESET_ID: PresetId = 'kada-mark';
const DEFAULT_SELECTED_ICON_ID = `preset:${DEFAULT_PRESET_ID}`;

const PRESET_IDS: PresetId[] = ['kada-core', 'kada-knot', 'kada-mark'];

const DEFAULT_CONFIG: DockIconConfig = {
  selectedIconId: DEFAULT_SELECTED_ICON_ID,
  customIcons: [],
};

function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && PRESET_IDS.includes(value as PresetId);
}

function normalizeCustomIcon(value: unknown): CustomDockIcon | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const icon = value as Partial<CustomDockIcon>;
  const id = typeof icon.id === 'string' ? icon.id.trim() : '';
  const name = typeof icon.name === 'string' ? icon.name.trim() : '';
  const lightIconPath = typeof icon.lightIconPath === 'string' ? icon.lightIconPath.trim() : '';
  const darkIconPath = typeof icon.darkIconPath === 'string' ? icon.darkIconPath.trim() : '';

  if (!id || !name || !lightIconPath || !darkIconPath) {
    return null;
  }

  return { id, name, lightIconPath, darkIconPath };
}

function normalizeSelectedIconId(selectedIconId: unknown, customIcons: CustomDockIcon[]): string {
  if (typeof selectedIconId !== 'string') {
    return DEFAULT_SELECTED_ICON_ID;
  }

  const value = selectedIconId.trim();
  if (value.startsWith('preset:')) {
    const presetId = value.slice('preset:'.length);
    return isPresetId(presetId) ? value : DEFAULT_SELECTED_ICON_ID;
  }

  if (value.startsWith('custom:')) {
    const customId = value.slice('custom:'.length);
    return customIcons.some((item) => item.id === customId) ? value : DEFAULT_SELECTED_ICON_ID;
  }

  return DEFAULT_SELECTED_ICON_ID;
}

function normalizeConfig(raw: unknown): DockIconConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_CONFIG;
  }

  const value = raw as Partial<DockIconConfig>;
  const customIcons = Array.isArray(value.customIcons)
    ? value.customIcons
      .map(normalizeCustomIcon)
      .filter((item): item is CustomDockIcon => Boolean(item))
    : [];

  return {
    selectedIconId: normalizeSelectedIconId(value.selectedIconId, customIcons),
    customIcons,
  };
}

function migrateLegacyConfig(raw: unknown): DockIconConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const legacy = raw as LegacyDockProfile;
  const selectedPresetId = isPresetId(legacy.selectedPresetId)
    ? legacy.selectedPresetId
    : DEFAULT_PRESET_ID;
  const base: DockIconConfig = {
    selectedIconId: `preset:${selectedPresetId}`,
    customIcons: [],
  };

  const lightIconPath = typeof legacy.lightIconPath === 'string' ? legacy.lightIconPath.trim() : '';
  const darkIconPath = typeof legacy.darkIconPath === 'string' ? legacy.darkIconPath.trim() : '';
  const hasCustomPaths = Boolean(lightIconPath && darkIconPath);

  if (legacy.source === 'custom-path' && hasCustomPaths) {
    const customId = 'migrated';
    base.customIcons = [{
      id: customId,
      name: '已迁移图标',
      lightIconPath,
      darkIconPath,
    }];
    base.selectedIconId = `custom:${customId}`;
  }

  return base;
}

async function safeGetSetting<T>(key: string): Promise<T | null> {
  try {
    return await getSetting<T>(key);
  } catch {
    return null;
  }
}

function readLocalCache(): DockIconConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalCache(config: DockIconConfig) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

function parseSelectedIcon(config: DockIconConfig):
  | { type: 'preset'; presetId: PresetId }
  | { type: 'custom'; icon: CustomDockIcon } {
  const selected = config.selectedIconId;

  if (selected.startsWith('preset:')) {
    const presetId = selected.slice('preset:'.length);
    if (isPresetId(presetId)) {
      return { type: 'preset', presetId };
    }
  }

  if (selected.startsWith('custom:')) {
    const customId = selected.slice('custom:'.length);
    const icon = config.customIcons.find((item) => item.id === customId);
    if (icon) {
      return { type: 'custom', icon };
    }
  }

  return { type: 'preset', presetId: DEFAULT_PRESET_ID };
}

export function getDefaultDockIconConfig(): DockIconConfig {
  return DEFAULT_CONFIG;
}

export function canApplyRuntimeDockIcon(): boolean {
  const isTauri =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac/i.test(navigator.platform || navigator.userAgent);
  return isTauri && isMac;
}

export async function loadDockIconConfig(): Promise<DockIconConfig> {
  const raw = await safeGetSetting<unknown>(SETTINGS_KEY);
  if (raw) {
    const normalized = normalizeConfig(raw);
    writeLocalCache(normalized);
    return normalized;
  }

  const localCached = readLocalCache();
  if (localCached) {
    return localCached;
  }

  const legacyV2 = await safeGetSetting<unknown>(LEGACY_SETTINGS_KEY);
  if (legacyV2) {
    const migrated = migrateLegacyConfig(legacyV2);
    if (migrated) {
      await saveDockIconConfig(migrated);
      return migrated;
    }
  }

  const legacyV1 = await safeGetSetting<unknown>(LEGACY_SETTINGS_KEY_V1);
  if (legacyV1) {
    const migrated = migrateLegacyConfig(legacyV1);
    if (migrated) {
      await saveDockIconConfig(migrated);
      return migrated;
    }
  }

  return DEFAULT_CONFIG;
}

export async function saveDockIconConfig(config: DockIconConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  writeLocalCache(normalized);
  await setSetting(SETTINGS_KEY, normalized);
}

export async function applyDockIconForMode(config: DockIconConfig, mode: ThemeMode): Promise<void> {
  if (!canApplyRuntimeDockIcon()) {
    throw new Error('仅支持在 macOS 的 Tauri 环境中替换 Dock 图标');
  }

  const selected = parseSelectedIcon(config);
  const { invoke } = await import('@tauri-apps/api/core');

  if (selected.type === 'preset') {
    await invoke('set_runtime_dock_icon_preset', {
      presetId: selected.presetId,
      theme: mode,
    });
    return;
  }

  const iconPath = (mode === 'dark' ? selected.icon.darkIconPath : selected.icon.lightIconPath).trim();
  if (!iconPath) {
    throw new Error(`${mode === 'dark' ? '暗色' : '亮色'}图标路径为空`);
  }

  await invoke('set_runtime_dock_icon', { iconPath });
}

export async function applyDockIconForCurrentTheme(config?: DockIconConfig): Promise<void> {
  const nextConfig = config ?? await loadDockIconConfig();
  const mode = resolveTheme(getThemePreference());
  await applyDockIconForMode(nextConfig, mode);
}

export function createCustomIconId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startDockIconSync() {
  if (!canApplyRuntimeDockIcon()) {
    return () => {};
  }

  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  const applyOnce = () => {
    void applyDockIconForCurrentTheme().catch(() => {});
  };

  applyOnce();

  const onSystemThemeChange = () => {
    if (getThemePreference() !== 'system') {
      return;
    }
    applyOnce();
  };

  try {
    media?.addEventListener('change', onSystemThemeChange);
  } catch {
    media?.addListener?.(onSystemThemeChange);
  }

  return () => {
    try {
      media?.removeEventListener('change', onSystemThemeChange);
    } catch {
      media?.removeListener?.(onSystemThemeChange);
    }
  };
}
