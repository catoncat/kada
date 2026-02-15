import type { Task } from './tasks-api';
import type {
  TaskDetailView,
  TaskRecoverySourceType,
} from '@/types/task-detail';
import type { ResultPanel } from './result-search-params';

export interface TaskDeepLinkSearch {
  sourceType?: TaskRecoverySourceType;
  projectId?: string;
  relatedId?: string;
  sceneIndex?: number;
  sceneId?: string;
  mode?: 'plan' | 'execute' | 'review';
  panel?: ResultPanel;
}

export type TaskSourceLink =
  | {
      to: '/project/$id/result';
      params: { id: string };
      search?: {
        scene?: number;
        sceneId?: string;
        openEdit?: '1';
        panel?: ResultPanel;
        mode?: 'plan' | 'execute' | 'review';
      };
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

function parseSceneRef(
  slot: string | null,
): { sceneIndex: number | null; sceneId: string | null } {
  if (!slot || !slot.startsWith('scene:')) {
    return { sceneIndex: null, sceneId: null };
  }
  const raw = slot.slice('scene:'.length).trim();
  if (!raw) return { sceneIndex: null, sceneId: null };
  if (/^\d+$/.test(raw)) {
    return {
      sceneIndex: Number.parseInt(raw, 10),
      sceneId: null,
    };
  }
  return { sceneIndex: null, sceneId: raw };
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
    sceneId:
      typeof search.sceneId === 'string' && search.sceneId.trim()
        ? search.sceneId.trim()
        : undefined,
    mode:
      search.mode === 'plan' ||
      search.mode === 'execute' ||
      search.mode === 'review'
        ? search.mode
        : undefined,
    panel: search.panel === 'copy' || search.panel === 'task' ? search.panel : undefined,
  };
}

export function parseSceneIndexFromTask(task: Task): number | null {
  const sceneRef = parseSceneRefFromTask(task);
  if (typeof sceneRef.sceneIndex === 'number') {
    return sceneRef.sceneIndex;
  }
  if (typeof task.relatedMeta === 'string' && task.relatedMeta.trim()) {
    try {
      const parsed = JSON.parse(task.relatedMeta) as { sceneIndex?: unknown };
      if (
        typeof parsed.sceneIndex === 'number' &&
        Number.isFinite(parsed.sceneIndex)
      ) {
        return parsed.sceneIndex;
      }
    } catch {
      // ignore invalid relatedMeta
    }
  }
  return null;
}

export function parseSceneRefFromTask(task: Task): {
  sceneIndex: number | null;
  sceneId: string | null;
} {
  if (!isRecord(task.input)) return { sceneIndex: null, sceneId: null };
  if (!isRecord(task.input.owner)) return { sceneIndex: null, sceneId: null };
  return parseSceneRef(safeString(task.input.owner.slot));
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
    const sceneId =
      typeof rc.sceneId === 'string' && rc.sceneId.trim()
        ? rc.sceneId.trim()
        : undefined;

    return {
      to: '/project/$id/result',
      params: { id: rc.projectId },
      search:
        typeof sceneIndex === 'number' || sceneId
          ? {
              scene: sceneIndex,
              sceneId,
              mode: 'execute',
              panel: 'copy',
            }
          : { mode: 'execute' },
      label:
        typeof sceneIndex === 'number'
          ? `场景 ${sceneIndex + 1}`
          : sceneId
            ? `分镜 ${sceneId}`
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
      const sceneRef = parseSceneRef(ownerSlot);
      const sceneIndex = sceneRef.sceneIndex;
      const sceneId = sceneRef.sceneId || undefined;
      if (typeof sceneIndex === 'number') {
        return {
          to: '/project/$id/result',
          params: { id: ownerId },
          search: {
            scene: sceneIndex,
            sceneId,
            mode: 'execute',
            panel: 'copy',
          },
          label: `场景 ${sceneIndex + 1}`,
        };
      }

      return {
        to: '/project/$id/result',
        params: { id: ownerId },
        search: sceneId
          ? { sceneId, mode: 'execute', panel: 'copy' }
          : { mode: 'execute' },
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
        typeof search.sceneIndex === 'number' || search.sceneId
          ? {
              scene: search.sceneIndex,
              sceneId: search.sceneId,
              mode: search.mode || 'execute',
              panel: search.panel || 'copy',
            }
          : { mode: search.mode || 'execute', panel: search.panel },
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
      sceneId:
        typeof source.sceneId === 'string' && source.sceneId.trim()
          ? source.sceneId.trim()
          : undefined,
      mode: source.sourceType === 'projectResult' ? 'execute' : undefined,
      panel: source.sourceType === 'projectResult' ? 'copy' : undefined,
    };
  }

  return {
    relatedId: task.relatedId || undefined,
  };
}
