import { describe, expect, it } from 'vitest';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  resolveResultMode,
} from '@/lib/result-search-params';

describe('result-search-params', () => {
  it('parses mode/scene/openEdit correctly', () => {
    expect(
      parseResultSearchParams({
        mode: 'execute',
        scene: '2',
        openEdit: '1',
      }),
    ).toEqual({
      mode: 'execute',
      scene: 2,
      openEdit: '1',
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
    });
    expect(resolveResultMode(parsed)).toBe('plan');
  });

  it('uses explicit mode over legacy openEdit', () => {
    const parsed = parseResultSearchParams({
      mode: 'review',
      openEdit: '1',
    });
    expect(resolveResultMode(parsed)).toBe('review');
  });

  it('clears legacy openEdit but keeps scene/mode', () => {
    const parsed = parseResultSearchParams({
      openEdit: '1',
      scene: '3',
    });
    expect(clearLegacyOpenEdit(parsed)).toEqual({
      scene: 3,
      mode: 'execute',
    });
  });
});
