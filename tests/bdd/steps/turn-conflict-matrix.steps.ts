import type { APIRequestContext } from '@playwright/test';
import { expect, Then, When } from './fixtures';

type BddState = Record<string, unknown> & {
  agentSessionId?: string;
  secondTurnStatus?: number;
  secondTurnCode?: string;
  idleAbortStatus?: number;
  idleAbortCode?: string;
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function buildClientMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function readSessionStatus(
  request: APIRequestContext,
  sessionId: string,
): Promise<string> {
  const response = await request.get(`/api/agent/sessions/${sessionId}`);
  if (!response.ok()) {
    throw new Error(
      `读取会话状态失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { status?: string };
  if (typeof payload.status !== 'string' || !payload.status) {
    throw new Error('会话状态字段缺失');
  }

  return payload.status;
}

async function waitForSessionStatus(
  request: APIRequestContext,
  sessionId: string,
  expected: string,
  timeoutMs = 8_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await readSessionStatus(request, sessionId);
    if (status === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const latest = await readSessionStatus(request, sessionId);
  throw new Error(
    `等待会话状态超时: expected=${expected} actual=${latest} timeoutMs=${timeoutMs}`,
  );
}

When('我在 turn 运行中再次发起 turn {string}', async ({ request, bddState }, text) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  const sessionId = state.agentSessionId as string;
  await waitForSessionStatus(request, sessionId, 'running');

  const response = await request.post(`/api/agent/sessions/${sessionId}/turn`, {
    data: {
      text,
      clientMessageId: buildClientMessageId('cm-turn-conflict'),
    },
  });

  state.secondTurnStatus = response.status();
  state.secondTurnCode = undefined;

  const payload = (await response.json().catch(() => ({}))) as {
    code?: unknown;
  };

  if (typeof payload.code === 'string') {
    state.secondTurnCode = payload.code;
  }
});

Then('二次 turn 请求应返回 {int} 与错误码 {string}', async ({ bddState }, status, code) => {
  const state = getState(bddState);
  expect(state.secondTurnStatus).toBe(status);
  expect(state.secondTurnCode).toBe(code);
});

When('我在会话空闲时执行 abort', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  const sessionId = state.agentSessionId as string;
  await waitForSessionStatus(request, sessionId, 'idle');

  const response = await request.post(`/api/agent/sessions/${sessionId}/abort`, {
    data: {},
  });

  state.idleAbortStatus = response.status();
  state.idleAbortCode = undefined;

  const payload = (await response.json().catch(() => ({}))) as {
    code?: unknown;
  };
  if (typeof payload.code === 'string') {
    state.idleAbortCode = payload.code;
  }
});

Then('abort 请求应返回 {int} 与错误码 {string}', async ({ bddState }, status, code) => {
  const state = getState(bddState);
  expect(state.idleAbortStatus).toBe(status);
  expect(state.idleAbortCode).toBe(code);
});
