import type { ResultMode } from '@/components/plan/types';

export interface ResultSearchParams {
  scene?: number;
  openEdit?: '1';
  mode?: ResultMode;
}

export function parseResultSearchParams(
  search: Record<string, unknown>,
): ResultSearchParams {
  const sceneRaw =
    typeof search.scene === 'string'
      ? Number.parseInt(search.scene, 10)
      : typeof search.scene === 'number'
        ? search.scene
        : undefined;

  return {
    scene:
      typeof sceneRaw === 'number' && Number.isFinite(sceneRaw)
        ? sceneRaw
        : undefined,
    openEdit: search.openEdit === '1' ? '1' : undefined,
    mode:
      search.mode === 'plan' ||
      search.mode === 'execute' ||
      search.mode === 'review'
        ? search.mode
        : undefined,
  };
}

export function resolveResultMode(search: ResultSearchParams): ResultMode {
  if (search.mode) return search.mode;
  if (search.openEdit === '1') return 'execute';
  return 'plan';
}

export function clearLegacyOpenEdit(search: ResultSearchParams): ResultSearchParams {
  return {
    scene: search.scene,
    mode: resolveResultMode(search),
  };
}
