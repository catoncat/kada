import type { APIRequestContext } from '@playwright/test';
import { expect, Given, Then, When } from './fixtures';

const DETERMINISTIC_PROVIDER_ID = '__bdd_deterministic__';

interface AgentStreamEvent {
  type: string;
  sessionId: string | null;
  turnId: string | null;
  timestamp: string | null;
  payload: Record<string, unknown>;
}

interface TurnStreamHandle {
  responsePromise: Promise<Response>;
  eventsPromise: Promise<AgentStreamEvent[]>;
  clientMessageId: string;
}

type BddState = Record<string, unknown> & {
  agentSessionId?: string;
  turnStream?: TurnStreamHandle;
  turnEvents?: AgentStreamEvent[];
  turnResponseStatus?: number;
  turnErrorBody?: string;
  followUpClientMessageId?: string;
  steerClientMessageId?: string;
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function buildApiBaseUrl(): string {
  return (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:1420').replace(
    /\/$/,
    '',
  );
}

function buildClientMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function parseExpectedTypes(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function findLastEventIndex(events: AgentStreamEvent[], type: string): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === type) {
      return index;
    }
  }
  return -1;
}

async function readSseEvents(response: Response): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  const body = response.body;
  if (!body) return events;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const blockEnd = buffer.indexOf('\n\n');
      if (blockEnd < 0) break;

      const rawBlock = buffer.slice(0, blockEnd);
      buffer = buffer.slice(blockEnd + 2);

      const dataLine = rawBlock
        .split('\n')
        .find((line) => line.startsWith('data:'));

      if (!dataLine) continue;

      const rawPayload = dataLine.replace(/^data:\s*/, '').trim();
      if (!rawPayload) continue;

      try {
        const parsed = JSON.parse(rawPayload) as {
          event?: {
            type?: unknown;
            sessionId?: unknown;
            turnId?: unknown;
            timestamp?: unknown;
            payload?: unknown;
          };
        };

        const event = parsed.event;
        if (!event || typeof event.type !== 'string') {
          continue;
        }

        events.push({
          type: event.type,
          sessionId:
            typeof event.sessionId === 'string' ? event.sessionId : null,
          turnId: typeof event.turnId === 'string' ? event.turnId : null,
          timestamp:
            typeof event.timestamp === 'string' ? event.timestamp : null,
          payload: toPayloadRecord(event.payload),
        });
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return events;
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
  const status = typeof payload.status === 'string' ? payload.status : '';
  if (!status) {
    throw new Error('会话状态字段缺失');
  }
  return status;
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
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  const latest = await readSessionStatus(request, sessionId);
  throw new Error(
    `等待会话状态超时: expected=${expected} actual=${latest} timeoutMs=${timeoutMs}`,
  );
}

async function resolveTurnEvents(state: BddState): Promise<AgentStreamEvent[]> {
  if (Array.isArray(state.turnEvents)) {
    return state.turnEvents;
  }

  if (!state.turnStream) {
    throw new Error('当前场景未启动 turn 流');
  }

  const events = await state.turnStream.eventsPromise;
  state.turnEvents = events;
  return events;
}

Given('我准备了用于 Chat Core 验证的 Deterministic 会话', async ({
  request,
  bddState,
}) => {
  const state = getState(bddState);

  const createRes = await request.post('/api/agent/sessions', {
    data: {
      title: `bdd-chat-core-${Date.now()}`,
      providerId: DETERMINISTIC_PROVIDER_ID,
      engine: 'coding-agent',
    },
  });

  if (!createRes.ok()) {
    throw new Error(
      `创建 deterministic 会话失败: status=${createRes.status()} body=${await createRes.text()}`,
    );
  }

  const payload = (await createRes.json()) as { id?: string };
  expect(typeof payload.id).toBe('string');

  state.agentSessionId = payload.id;
  state.turnStream = undefined;
  state.turnEvents = undefined;
  state.turnResponseStatus = undefined;
  state.turnErrorBody = undefined;
  state.followUpClientMessageId = undefined;
  state.steerClientMessageId = undefined;
});

When('我启动一个流式 turn {string}', async ({ bddState }, text) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  const sessionId = state.agentSessionId as string;
  const clientMessageId = buildClientMessageId('cm-turn');
  const apiBaseUrl = buildApiBaseUrl();

  const responsePromise = fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      clientMessageId,
    }),
  });

  const eventsPromise = (async () => {
    const response = await responsePromise;
    state.turnResponseStatus = response.status;

    if (!response.ok) {
      state.turnErrorBody = await response.text();
      return [];
    }

    return readSseEvents(response);
  })();

  state.turnStream = {
    responsePromise,
    eventsPromise,
    clientMessageId,
  };
});

When('我在 turn 运行中发送 follow-up {string}', async ({ request, bddState }, text) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  const sessionId = state.agentSessionId as string;
  await waitForSessionStatus(request, sessionId, 'running');

  const clientMessageId = buildClientMessageId('cm-follow-up');
  const response = await request.post(`/api/agent/sessions/${sessionId}/follow-up`, {
    data: {
      text,
      clientMessageId,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `发送 follow-up 失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  state.followUpClientMessageId = clientMessageId;
});

When('我在 turn 运行中发送 steer {string}', async ({ request, bddState }, text) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  const sessionId = state.agentSessionId as string;
  await waitForSessionStatus(request, sessionId, 'running');

  const clientMessageId = buildClientMessageId('cm-steer');
  const response = await request.post(`/api/agent/sessions/${sessionId}/steer`, {
    data: {
      text,
      clientMessageId,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `发送 steer 失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  state.steerClientMessageId = clientMessageId;
});

When('我在 turn 运行中执行 abort', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  const sessionId = state.agentSessionId as string;
  await waitForSessionStatus(request, sessionId, 'running');

  const response = await request.post(`/api/agent/sessions/${sessionId}/abort`, {
    data: {},
  });

  if (!response.ok()) {
    throw new Error(
      `执行 abort 失败: status=${response.status()} body=${await response.text()}`,
    );
  }
});

Then('turn 流应按顺序包含事件 {string}', async ({ bddState }, expectedEvents) => {
  const state = getState(bddState);
  const events = await resolveTurnEvents(state);

  if (state.turnResponseStatus !== 200) {
    throw new Error(
      `turn 响应状态异常: status=${state.turnResponseStatus} body=${state.turnErrorBody || ''}`,
    );
  }

  const types = events.map((event) => event.type);
  const expectedTypes = parseExpectedTypes(expectedEvents);

  let cursor = -1;
  for (const expectedType of expectedTypes) {
    const nextIndex = types.indexOf(expectedType, cursor + 1);
    expect(nextIndex).toBeGreaterThan(-1);
    cursor = nextIndex;
  }
});

Then('turn 流应包含事件 {string}', async ({ bddState }, expectedEvents) => {
  const state = getState(bddState);
  const events = await resolveTurnEvents(state);

  if (state.turnResponseStatus !== 200) {
    throw new Error(
      `turn 响应状态异常: status=${state.turnResponseStatus} body=${state.turnErrorBody || ''}`,
    );
  }

  const types = events.map((event) => event.type);
  for (const expectedType of parseExpectedTypes(expectedEvents)) {
    expect(types.includes(expectedType)).toBeTruthy();
  }
});

Then('turn 流应包含 follow-up 入队并应用事件', async ({ bddState }) => {
  const state = getState(bddState);
  const events = await resolveTurnEvents(state);

  expect(typeof state.followUpClientMessageId).toBe('string');
  const clientMessageId = state.followUpClientMessageId as string;

  const queueIndex = events.findIndex((event) => {
    if (event.type !== 'queue.updated') return false;
    const payload = toPayloadRecord(event.payload);
    return (
      payload.mode === 'follow-up' &&
      payload.clientMessageId === clientMessageId &&
      payload.queueAction === 'queued'
    );
  });

  const appliedIndex = events.findIndex((event) => {
    if (event.type !== 'followup.applied') return false;
    const payload = toPayloadRecord(event.payload);
    return payload.clientMessageId === clientMessageId;
  });

  expect(queueIndex).toBeGreaterThan(-1);
  expect(appliedIndex).toBeGreaterThan(-1);
  expect(queueIndex).toBeLessThan(appliedIndex);
});

Then('turn 流应包含 steer 入队并应用事件', async ({ bddState }) => {
  const state = getState(bddState);
  const events = await resolveTurnEvents(state);

  expect(typeof state.steerClientMessageId).toBe('string');
  const clientMessageId = state.steerClientMessageId as string;

  const queueIndex = events.findIndex((event) => {
    if (event.type !== 'queue.updated') return false;
    const payload = toPayloadRecord(event.payload);
    return (
      payload.mode === 'steer' &&
      payload.clientMessageId === clientMessageId &&
      payload.queueAction === 'queued'
    );
  });

  const appliedIndex = events.findIndex((event) => {
    if (event.type !== 'steer.applied') return false;
    const payload = toPayloadRecord(event.payload);
    return payload.clientMessageId === clientMessageId;
  });

  expect(queueIndex).toBeGreaterThan(-1);
  expect(appliedIndex).toBeGreaterThan(-1);
  expect(queueIndex).toBeLessThan(appliedIndex);
});

Then('turn 应以 aborted 语义结束', async ({ bddState }) => {
  const state = getState(bddState);
  const events = await resolveTurnEvents(state);

  if (state.turnResponseStatus !== 200) {
    throw new Error(
      `turn 响应状态异常: status=${state.turnResponseStatus} body=${state.turnErrorBody || ''}`,
    );
  }

  const sessionAbortedIndex = events.findIndex(
    (event) => event.type === 'session.aborted',
  );
  expect(sessionAbortedIndex).toBeGreaterThan(-1);

  const assistantCompletedIndex = findLastEventIndex(events, 'assistant.completed');
  expect(assistantCompletedIndex).toBeGreaterThan(-1);
  const assistantCompletedPayload = toPayloadRecord(
    events[assistantCompletedIndex]?.payload,
  );
  expect(assistantCompletedPayload.stopReason).toBe('aborted');

  const turnCompletedIndex = events.findIndex((event) => {
    if (event.type !== 'turn.completed') return false;
    const payload = toPayloadRecord(event.payload);
    return payload.aborted === true;
  });
  expect(turnCompletedIndex).toBeGreaterThan(-1);
  expect(sessionAbortedIndex).toBeLessThan(turnCompletedIndex);
});

Then('该会话状态最终应为 {string}', async ({ request, bddState }, expectedStatus) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  await resolveTurnEvents(state);

  const sessionId = state.agentSessionId as string;
  await expect.poll(async () => readSessionStatus(request, sessionId)).toBe(
    expectedStatus,
  );
});
