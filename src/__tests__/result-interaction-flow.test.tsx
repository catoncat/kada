import { describe, expect, it } from 'vitest';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  resolveResultPanel,
} from '@/lib/result-search-params';
import { resolveExecuteActionGuard } from '@/lib/scene-execution-state';
import { getSourceLinkFromDeepLinkSearch } from '@/lib/task-recovery';

describe('result interaction flow', () => {
  it('maps legacy openEdit to execute copy panel', () => {
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

  it('requires checklist confirmation before execute action', () => {
    const guard = resolveExecuteActionGuard({
      executionState: 'not_confirmed',
      hasVisualPrompt: true,
    });
    expect(guard.disabled).toBe(true);
    expect(guard.reason).toContain('确认执行清单');
  });
});

