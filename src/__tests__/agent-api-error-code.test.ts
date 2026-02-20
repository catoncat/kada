import { afterEach, describe, expect, it, vi } from 'vitest';
import { followUpAgentSession, listAgentResourceImages } from '@/lib/agent-api';
import type { AgentApiError } from '@/lib/agent-api';

describe('agent api error code parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves non-action error codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: '资源不存在。',
              code: 'RESOURCE_NOT_FOUND',
            }),
            {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
      ),
    );

    await expect(
      listAgentResourceImages({
        kind: 'project',
        id: 'missing',
      }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      knownCode: null,
    } satisfies Partial<AgentApiError>);
  });

  it('keeps knownCode for standardized action errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: '会话正在执行中。',
              code: 'SESSION_RUNNING',
            }),
            {
              status: 409,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
      ),
    );

    await expect(
      followUpAgentSession('session-1', 'hello', 'cm_1'),
    ).rejects.toMatchObject({
      code: 'SESSION_RUNNING',
      knownCode: 'SESSION_RUNNING',
    } satisfies Partial<AgentApiError>);
  });
});
