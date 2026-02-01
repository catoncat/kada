import type { ExtendedShootingPlan } from '@/types/single-plan';
import type { ProjectPlan } from '@/types/project-plan';

export type SinglePlanRecord = {
  kind: 'single';
  data: ExtendedShootingPlan;
};

export type ProjectPlanRecord = {
  kind: 'project';
  data: ProjectPlan;
  /** 统一给 Sidebar 展示用的标题，避免 Sidebar 关心内部结构 */
  title: string;
};

export type PlanRecord = SinglePlanRecord | ProjectPlanRecord;

export function getPlanRecordId(r: PlanRecord): string {
  return r.data.id;
}

export function getPlanRecordTitle(r: PlanRecord): string {
  return r.kind === 'single' ? r.data.title : r.title;
}

export function getPlanRecordCreatedAt(r: PlanRecord): number {
  return r.data.createdAt;
}

export function isLegacySinglePlan(obj: any): obj is ExtendedShootingPlan {
  return !!obj && typeof obj === 'object' && typeof obj.title === 'string' && Array.isArray(obj.scenes);
}

export function isProjectPlan(obj: any): obj is ProjectPlan {
  return (
    !!obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.createdAt === 'number' &&
    obj.client &&
    Array.isArray(obj.outfits) &&
    Array.isArray(obj.plans)
  );
}

/**
 * 兼容旧 localStorage：
 * - 以前存的是 ExtendedShootingPlan[]
 * - 新版存的是 PlanRecord[]
 */
export function parseHistory(raw: string | null): PlanRecord[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    // 已经是 PlanRecord
    if (data.length > 0 && data[0] && typeof data[0] === 'object' && 'kind' in data[0]) {
      return data as PlanRecord[];
    }

    // 旧版：ExtendedShootingPlan[]
    if (data.length === 0) return [];
    if (isLegacySinglePlan(data[0])) {
      return (data as ExtendedShootingPlan[]).map((p) => ({ kind: 'single', data: p }));
    }

    return [];
  } catch {
    return [];
  }
}

export function serializeHistory(records: PlanRecord[]): string {
  return JSON.stringify(records);
}
