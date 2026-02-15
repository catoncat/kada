import { describe, expect, it } from 'vitest';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  resolveResultPanel,
} from '@/lib/result-search-params';
import { getSourceLinkFromDeepLinkSearch } from '@/lib/task-recovery';

describe('result interaction flow', () => {
  it('maps legacy openEdit to copy panel for backward compatibility', () => {
    const parsed = parseResultSearchParams({
      scene: '1',
      openEdit: '1',
    });
    expect(resolveResultPanel(parsed)).toBe('copy');
    expect(clearLegacyOpenEdit(parsed)).toEqual({
      scene: 1,
      mode: 'execute',
      panel: 'copy',
    });
  });

  it('uses copy panel when returning from task deep link', () => {
    const link = getSourceLinkFromDeepLinkSearch({
      sourceType: 'projectResult',
      projectId: 'p1',
      sceneIndex: 2,
      mode: 'execute',
    });

    expect(link?.to).toBe('/project/$id/result');
    if (link?.to === '/project/$id/result') {
      expect(link.search).toEqual({
        scene: 2,
        mode: 'execute',
        panel: 'copy',
      });
    }
  });

  it('keeps copy panel when deep link has no scene index', () => {
    const link = getSourceLinkFromDeepLinkSearch({
      sourceType: 'projectResult',
      projectId: 'p1',
      mode: 'execute',
    });

    expect(link?.to).toBe('/project/$id/result');
    if (link?.to === '/project/$id/result') {
      expect(link.search).toEqual({
        mode: 'execute',
        panel: undefined,
      });
    }
  });
});
