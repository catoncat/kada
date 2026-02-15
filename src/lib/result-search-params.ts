import type { ResultMode } from '@/components/plan/types';

export type ResultPanel = 'copy' | 'task';

export interface ResultSearchParams {
  scene?: number;
  openEdit?: '1';
  panel?: ResultPanel;
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
    panel: search.panel === 'copy' || search.panel === 'task' ? search.panel : undefined,
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

export function resolveResultPanel(search: ResultSearchParams): ResultPanel | undefined {
  if (search.panel) return search.panel;
  if (search.openEdit === '1') return 'copy';
  return undefined;
}

export function clearLegacyOpenEdit(search: ResultSearchParams): ResultSearchParams {
  return {
    scene: search.scene,
    mode: resolveResultMode(search),
    panel: resolveResultPanel(search),
  };
}
