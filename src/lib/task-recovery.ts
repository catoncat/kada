import type { Task } from './tasks-api';
import type {
  TaskDetailView,
  TaskRecoverySourceType,
} from '@/types/task-detail';

export interface TaskDeepLinkSearch {
  sourceType?: TaskRecoverySourceType;
  projectId?: string;
  relatedId?: string;
  sceneIndex?: number;
}

export type TaskSourceLink =
  | {
      to: '/project/$id/result';
      params: { id: string };
      search?: { scene?: number; openEdit?: '1' };
      label?: string;
    }
  | {
      to: '/assets/scenes';
      label?: string;
    }
  | {
      to: '/';
      search?: { project?: string };
      label?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseSceneIndex(slot: string | null): number | null {
  if (!slot || !slot.startsWith('scene:')) return null;
  const raw = slot.split(':')[1] || '';
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

export function parseTaskDeepLinkSearch(
  search: Record<string, unknown>,
): TaskDeepLinkSearch {
  const sceneRaw =
    typeof search.sceneIndex === 'string'
      ? Number.parseInt(search.sceneIndex, 10)
      : typeof search.sceneIndex === 'number'
        ? search.sceneIndex
        : undefined;

  const sourceType =
    search.sourceType === 'projectResult' ||
    search.sourceType === 'project' ||
    search.sourceType === 'assets'
      ? search.sourceType
      : undefined;

  return {
    sourceType,
    projectId:
      typeof search.projectId === 'string' ? search.projectId : undefined,
    relatedId:
      typeof search.relatedId === 'string' ? search.relatedId : undefined,
    sceneIndex:
      typeof sceneRaw === 'number' && Number.isFinite(sceneRaw)
        ? sceneRaw
        : undefined,
  };
}

export function parseSceneIndexFromTask(task: Task): number | null {
  if (!isRecord(task.input)) return null;
  if (!isRecord(task.input.owner)) return null;
  return parseSceneIndex(safeString(task.input.owner.slot));
}

export function getTaskSourceLink(
  task: Task,
  detail?: TaskDetailView | null,
): TaskSourceLink | null {
  const rc = detail?.recoveryContext;

  if (rc?.sourceType === 'projectResult' && rc.projectId) {
    const sceneIndex =
      typeof rc.sceneIndex === 'number' && Number.isFinite(rc.sceneIndex)
        ? rc.sceneIndex
        : undefined;

    return {
      to: '/project/$id/result',
      params: { id: rc.projectId },
      search:
        typeof sceneIndex === 'number'
          ? { scene: sceneIndex, openEdit: '1' }
          : {},
      label:
        typeof sceneIndex === 'number'
          ? `场景 ${sceneIndex + 1}`
          : '项目结果页',
    };
  }

  if (rc?.sourceType === 'assets') {
    return { to: '/assets/scenes', label: '场景资产' };
  }

  if (rc?.sourceType === 'project' && rc.projectId) {
    return {
      to: '/',
      search: { project: rc.projectId },
      label: '项目列表',
    };
  }

  if (isRecord(task.input) && isRecord(task.input.owner)) {
    const ownerType = safeString(task.input.owner.type);
    const ownerId = safeString(task.input.owner.id);
    const ownerSlot = safeString(task.input.owner.slot);

    if (ownerType === 'planScene' && ownerId) {
      const sceneIndex = parseSceneIndex(ownerSlot);
      if (typeof sceneIndex === 'number') {
        return {
          to: '/project/$id/result',
          params: { id: ownerId },
          search: { scene: sceneIndex, openEdit: '1' },
          label: `场景 ${sceneIndex + 1}`,
        };
      }

      return {
        to: '/project/$id/result',
        params: { id: ownerId },
        label: '项目结果页',
      };
    }

    if (ownerType === 'asset') {
      return { to: '/assets/scenes', label: '场景资产' };
    }
  }

  if (task.relatedId) {
    return {
      to: '/',
      search: { project: task.relatedId },
      label: '项目列表',
    };
  }

  return null;
}

export function getSourceLinkFromDeepLinkSearch(
  search: TaskDeepLinkSearch,
): TaskSourceLink | null {
  const projectId = search.projectId || search.relatedId;

  if (search.sourceType === 'projectResult' && projectId) {
    return {
      to: '/project/$id/result',
      params: { id: projectId },
      search:
        typeof search.sceneIndex === 'number'
          ? { scene: search.sceneIndex, openEdit: '1' }
          : {},
      label: '跳转来源页面',
    };
  }

  if (search.sourceType === 'assets') {
    return {
      to: '/assets/scenes',
      label: '跳转来源页面',
    };
  }

  if (projectId) {
    return {
      to: '/',
      search: { project: projectId },
      label: '跳转来源页面',
    };
  }

  return null;
}

export function buildTaskDeepLinkSearch(
  task: Task,
  detail?: TaskDetailView | null,
): TaskDeepLinkSearch {
  const source = detail?.recoveryContext;
  if (source) {
    return {
      sourceType: source.sourceType,
      projectId: source.projectId || undefined,
      relatedId: task.relatedId || undefined,
      sceneIndex:
        typeof source.sceneIndex === 'number' && Number.isFinite(source.sceneIndex)
          ? source.sceneIndex
          : undefined,
    };
  }

  return {
    relatedId: task.relatedId || undefined,
  };
}
