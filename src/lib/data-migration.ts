/**
 * 数据迁移工具
 * 将 localStorage 中的数据迁移到 SQLite
 */

import { createProvider, fetchProviders, type CreateProviderInput } from '@/lib/provider-api';
import { createPlan, fetchPlans } from '@/lib/plans-api';
import type { ProviderConfig } from '@/types/provider';

const MIGRATION_FLAG = 'data_migrated_to_sqlite';
const LEGACY_PROVIDER_KEY = 'ai_providers';
const LEGACY_HISTORY_KEY = 'shooting_history';

interface LegacyProviderStorage {
  providers: ProviderConfig[];
  activeId?: string;
}

interface LegacyPlanRecord {
  kind: 'single' | 'project';
  data: any;
  title?: string;
}

/**
 * 检查是否需要迁移
 */
export function needsMigration(): boolean {
  return localStorage.getItem(MIGRATION_FLAG) !== 'true';
}

/**
 * 标记迁移完成
 */
function markMigrationComplete(): void {
  localStorage.setItem(MIGRATION_FLAG, 'true');
}

/**
 * 迁移 Provider 数据
 */
async function migrateProviders(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_PROVIDER_KEY);
  if (!raw) return;

  try {
    const storage: LegacyProviderStorage = JSON.parse(raw);
    if (!storage.providers?.length) return;

    // 检查是否已有数据
    const existingProviders = await fetchProviders();
    if (existingProviders.length > 0) {
      console.log('[migration] Providers already exist in DB, skipping migration');
      return;
    }

    for (const p of storage.providers) {
      const input: CreateProviderInput = {
        name: p.name || 'Migrated Provider',
        format: p.format || 'openai',
        baseUrl: p.baseUrl || '',
        apiKey: p.apiKey || '',
        textModel: p.textModel || '',
        imageModel: p.imageModel || '',
        isDefault: p.id === storage.activeId,
        isBuiltin: false,
      };

      await createProvider(input);
    }

    console.log(`[migration] Migrated ${storage.providers.length} providers`);
  } catch (err) {
    console.error('[migration] Failed to migrate providers:', err);
  }
}

/**
 * 迁移 Plans 数据
 */
async function migratePlans(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_HISTORY_KEY);
  if (!raw) return;

  try {
    const records: LegacyPlanRecord[] = JSON.parse(raw);
    if (!records?.length) return;

    // 检查是否已有数据
    const existingPlans = await fetchPlans(1);
    if (existingPlans.length > 0) {
      console.log('[migration] Plans already exist in DB, skipping migration');
      return;
    }

    // 倒序迁移，保持时间顺序
    for (const record of records.reverse()) {
      const title =
        record.title ||
        (record.kind === 'single'
          ? record.data?.title || '未命名预案'
          : record.data?.title || '未命名项目');

      await createPlan({
        title,
        kind: record.kind,
        data: record.data,
      });
    }

    console.log(`[migration] Migrated ${records.length} plans`);
  } catch (err) {
    console.error('[migration] Failed to migrate plans:', err);
  }
}

/**
 * 执行完整迁移
 */
export async function runMigration(): Promise<void> {
  if (!needsMigration()) {
    console.log('[migration] Already migrated, skipping');
    return;
  }

  console.log('[migration] Starting data migration to SQLite...');

  try {
    await migrateProviders();
    await migratePlans();
    markMigrationComplete();
    console.log('[migration] Migration complete!');
  } catch (err) {
    console.error('[migration] Migration failed:', err);
    // 不标记完成，下次启动会重试
  }
}

/**
 * 清理旧数据（迁移成功后可选调用）
 */
export function cleanupLegacyData(): void {
  localStorage.removeItem(LEGACY_PROVIDER_KEY);
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  console.log('[migration] Legacy data cleaned up');
}
