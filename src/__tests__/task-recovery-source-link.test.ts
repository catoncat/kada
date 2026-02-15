import { describe, expect, it } from 'vitest';
import {
  getSourceLinkFromDeepLinkSearch,
  getTaskSourceLink,
  parseTaskDeepLinkSearch,
} from '@/lib/task-recovery';
import type { Task } from '@/lib/tasks-api';

describe('task-recovery source link', () => {
  it('parses mode from deep link search', () => {
    expect(
      parseTaskDeepLinkSearch({
        sourceType: 'projectResult',
        projectId: 'p1',
        sceneIndex: '2',
        mode: 'execute',
        panel: 'copy',
      }),
    ).toEqual({
      sourceType: 'projectResult',
      projectId: 'p1',
      relatedId: undefined,
      sceneIndex: 2,
      mode: 'execute',
      panel: 'copy',
    });
  });

  it('returns execute mode for planScene source link', () => {
    const task: Task = {
      id: 't1',
      type: 'image-generation',
      status: 'completed',
      input: {
        owner: {
          type: 'planScene',
          id: 'p1',
          slot: 'scene:1',
        },
      },
      output: null,
      error: null,
      relatedId: 'p1',
      relatedMeta: null,
      createdAt: undefined,
      updatedAt: undefined,
    };

    const link = getTaskSourceLink(task);
    expect(link?.to).toBe('/project/$id/result');
    if (link?.to === '/project/$id/result') {
      expect(link.search).toEqual({ scene: 1, mode: 'execute', panel: 'copy' });
    }
  });

  it('defaults to execute mode for projectResult deep link', () => {
    const link = getSourceLinkFromDeepLinkSearch({
      sourceType: 'projectResult',
      projectId: 'p1',
      sceneIndex: 0,
    });
    expect(link?.to).toBe('/project/$id/result');
    if (link?.to === '/project/$id/result') {
      expect(link.search).toEqual({ scene: 0, mode: 'execute', panel: 'copy' });
    }
  });
});
