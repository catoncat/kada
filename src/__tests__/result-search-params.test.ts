import { describe, expect, it } from 'vitest';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  resolveResultPanel,
  resolveResultMode,
} from '@/lib/result-search-params';

describe('result-search-params', () => {
  it('parses mode/scene/openEdit/panel correctly', () => {
    expect(
      parseResultSearchParams({
        mode: 'execute',
        scene: '2',
        openEdit: '1',
        panel: 'task',
      }),
    ).toEqual({
      mode: 'execute',
      scene: 2,
      openEdit: '1',
      panel: 'task',
    });
  });

  it('falls back to plan when mode is invalid', () => {
    const parsed = parseResultSearchParams({
      mode: 'oops',
      scene: 'x',
      openEdit: '0',
    });
    expect(parsed).toEqual({
      mode: undefined,
      scene: undefined,
      openEdit: undefined,
      panel: undefined,
    });
    expect(resolveResultMode(parsed)).toBe('plan');
    expect(resolveResultPanel(parsed)).toBeUndefined();
  });

  it('uses explicit mode over legacy openEdit', () => {
    const parsed = parseResultSearchParams({
      mode: 'review',
      openEdit: '1',
    });
    expect(resolveResultMode(parsed)).toBe('review');
    expect(resolveResultPanel(parsed)).toBe('copy');
  });

  it('clears legacy openEdit and maps to copy panel', () => {
    const parsed = parseResultSearchParams({
      openEdit: '1',
      scene: '3',
      sceneId: 'sc_1',
    });
    expect(clearLegacyOpenEdit(parsed)).toEqual({
      scene: 3,
      sceneId: 'sc_1',
      mode: 'execute',
      panel: 'copy',
    });
  });
});
