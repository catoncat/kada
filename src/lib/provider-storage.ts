/**
 * Provider 配置存储
 * 支持多 Provider 管理
 */

import type { ProviderConfig, ProvidersStorage } from '@/types/provider';
import { BUILTIN_PROVIDERS } from '@/types/provider';

const STORAGE_KEY = 'ai_providers';

// 旧配置 key（用于迁移）
const LEGACY_KEYS = {
  mode: 'gemini_mode',
  apiKey: 'gemini_api_key',
  baseUrl: 'gemini_base_url',
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取默认存储结构
 */
function getDefaultStorage(): ProvidersStorage {
  return {
    providers: [...BUILTIN_PROVIDERS],
    defaultProviderId: 'local',
  };
}

/**
 * 从旧配置迁移
 */
function migrateFromLegacy(): ProvidersStorage | null {
  if (typeof window === 'undefined') return null;

  const mode = localStorage.getItem(LEGACY_KEYS.mode);
  const apiKey = localStorage.getItem(LEGACY_KEYS.apiKey);
  const baseUrl = localStorage.getItem(LEGACY_KEYS.baseUrl);

  // 如果没有旧的 API 配置，返回 null
  if (!apiKey) return null;

  const storage = getDefaultStorage();

  // 创建迁移的 Provider
  const migratedProvider: ProviderConfig = {
    id: generateId(),
    name: '迁移的配置',
    format: 'gemini',
    baseUrl: baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    apiKey,
    textModel: 'gemini-2.5-flash',
    imageModel: 'gemini-2.0-flash-exp-image-generation',
    isDefault: mode === 'api',
  };

  storage.providers.push(migratedProvider);

  if (mode === 'api') {
    storage.defaultProviderId = migratedProvider.id;
  }

  // 保存新配置
  saveProvidersStorage(storage);

  // 清理旧配置
  Object.values(LEGACY_KEYS).forEach(key => localStorage.removeItem(key));

  return storage;
}

/**
 * 获取所有 Provider 存储
 */
export function getProvidersStorage(): ProvidersStorage {
  if (typeof window === 'undefined') return getDefaultStorage();

  // 尝试读取新配置
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as ProvidersStorage;
      // 确保内置 Provider 存在
      const hasBuiltin = parsed.providers.some(p => p.id === 'local');
      if (!hasBuiltin) {
        parsed.providers.unshift(...BUILTIN_PROVIDERS);
      }
      return parsed;
    } catch {
      // 解析失败
    }
  }

  // 尝试从旧配置迁移
  const migrated = migrateFromLegacy();
  if (migrated) return migrated;

  // 返回默认配置
  return getDefaultStorage();
}

/**
 * 保存 Provider 存储
 */
export function saveProvidersStorage(storage: ProvidersStorage): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
}

/**
 * 获取所有 Provider
 */
export function getAllProviders(): ProviderConfig[] {
  return getProvidersStorage().providers;
}

/**
 * 获取默认 Provider
 */
export function getDefaultProvider(): ProviderConfig | null {
  const storage = getProvidersStorage();
  return storage.providers.find(p => p.id === storage.defaultProviderId) || null;
}

/**
 * 获取指定 Provider
 */
export function getProvider(id: string): ProviderConfig | null {
  const storage = getProvidersStorage();
  return storage.providers.find(p => p.id === id) || null;
}

/**
 * 添加新 Provider
 */
export function addProvider(provider: Omit<ProviderConfig, 'id'>): ProviderConfig {
  const storage = getProvidersStorage();
  const newProvider: ProviderConfig = {
    ...provider,
    id: generateId(),
  };
  storage.providers.push(newProvider);

  // 如果设为默认
  if (newProvider.isDefault) {
    storage.providers.forEach(p => {
      if (p.id !== newProvider.id) p.isDefault = false;
    });
    storage.defaultProviderId = newProvider.id;
  }

  saveProvidersStorage(storage);
  return newProvider;
}

/**
 * 更新 Provider
 */
export function updateProvider(id: string, updates: Partial<ProviderConfig>): void {
  const storage = getProvidersStorage();
  const index = storage.providers.findIndex(p => p.id === id);
  if (index === -1) return;

  storage.providers[index] = { ...storage.providers[index], ...updates };

  // 如果设为默认
  if (updates.isDefault) {
    storage.providers.forEach(p => {
      if (p.id !== id) p.isDefault = false;
    });
    storage.defaultProviderId = id;
  }

  saveProvidersStorage(storage);
}

/**
 * 删除 Provider
 */
export function deleteProvider(id: string): void {
  const storage = getProvidersStorage();

  // 不能删除内置 Provider
  const provider = storage.providers.find(p => p.id === id);
  if (provider?.isBuiltin) return;

  storage.providers = storage.providers.filter(p => p.id !== id);

  // 如果删除的是默认 Provider，选择第一个可用的 API Provider
  if (storage.defaultProviderId === id) {
    // 优先选择第一个非 local 的 API Provider
    const firstApiProvider = storage.providers.find(p => p.format !== 'local');
    if (firstApiProvider) {
      storage.defaultProviderId = firstApiProvider.id;
      storage.providers.forEach(p => {
        p.isDefault = p.id === firstApiProvider.id;
      });
    } else {
      // 如果没有 API Provider，回退到 local
      storage.defaultProviderId = 'local';
      const localProvider = storage.providers.find(p => p.id === 'local');
      if (localProvider) localProvider.isDefault = true;
    }
  }

  saveProvidersStorage(storage);
}

/**
 * 设置默认 Provider
 */
export function setDefaultProvider(id: string): void {
  const storage = getProvidersStorage();
  storage.providers.forEach(p => {
    p.isDefault = p.id === id;
  });
  storage.defaultProviderId = id;
  saveProvidersStorage(storage);
}

/**
 * 检查是否有配置在线 API
 */
export function hasApiConfig(): boolean {
  const defaultProvider = getDefaultProvider();
  return !!defaultProvider && defaultProvider.format !== 'local' && !!defaultProvider.apiKey;
}

/**
 * 兼容旧接口
 */
export function getProviderConfig(): ProviderConfig | null {
  return getDefaultProvider();
}

export function saveProviderConfig(config: ProviderConfig): void {
  if (getProvider(config.id)) {
    updateProvider(config.id, config);
  } else {
    addProvider(config);
  }
}
