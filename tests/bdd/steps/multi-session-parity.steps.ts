import type { APIRequestContext } from '@playwright/test';
import { readSseDataPayloads } from './helpers/sse';
import { expect, Given, Then, When } from './fixtures';

const DETERMINISTIC_PROVIDER_ID = '__bdd_deterministic__';

type SessionKey = 'A' | 'B';

interface StreamEvent {
  type: string;
  sessionId: string | null;
}

interface TurnStreamHandle {
  responsePromise: Promise<Response>;
  eventsPromise: Promise<StreamEvent[]>;
  responseStatus?: number;
  errorBody?: string;
}

type BddState = Record<string, unknown> & {
  sessionsByKey?: Partial<Record<SessionKey, string>>;
  streamsByKey?: Partial<Record<SessionKey, TurnStreamHandle>>;
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function toSessionKey(value: string): SessionKey {
  if (value === 'A' || value === 'B') return value;
  throw new Error(`不支持的会话标识: ${value}`);
}

function buildApiBaseUrl(): string {
  return (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:1420').replace(
    /\/$/,
    '',
  );
}

function parseExpectedTypes(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildClientMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendParsedEvent(events: StreamEvent[], rawPayload: string): void {
  try {
    const parsed = JSON.parse(rawPayload) as {
      event?: {
        type?: unknown;
        sessionId?: unknown;
      };
    };

    if (!parsed.event || typeof parsed.event.type !== 'string') {
      return;
    }

    events.push({
      type: parsed.event.type,
      sessionId:
        typeof parsed.event.sessionId === 'string' ? parsed.event.sessionId : null,
    });
  } catch {
    // ignore malformed chunk
  }
}

async function readSseEvents(response: Response): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const payloads = await readSseDataPayloads(response);
  for (const rawPayload of payloads) {
    appendParsedEvent(events, rawPayload);
  }
  return events;
}

async function startTurnStream(
  sessionId: string,
  text: string,
): Promise<TurnStreamHandle> {
  const apiBaseUrl = buildApiBaseUrl();
  const responsePromise = fetch(
    `${apiBaseUrl}/api/agent/sessions/${sessionId}/turn`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        clientMessageId: buildClientMessageId('cm-multi'),
      }),
    },
  );

  const handle: TurnStreamHandle = {
    responsePromise,
    eventsPromise: (async () => {
      const response = await responsePromise;
      handle.responseStatus = response.status;
      if (!response.ok) {
        handle.errorBody = await response.text();
        return [];
      }
      return readSseEvents(response);
    })(),
  };

  return handle;
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

async function waitForConcurrentRunning(
  request: APIRequestContext,
  sessionAId: string,
  sessionBId: string,
  timeoutMs = 8_000,
): Promise<void> {
  const startedAt = Date.now();
  let sawRunningA = false;
  let sawRunningB = false;
  let latestA = 'unknown';
  let latestB = 'unknown';

  while (Date.now() - startedAt < timeoutMs) {
    const [statusA, statusB] = await Promise.all([
      readSessionStatus(request, sessionAId),
      readSessionStatus(request, sessionBId),
    ]);

    latestA = statusA;
    latestB = statusB;
    sawRunningA = sawRunningA || statusA === 'running';
    sawRunningB = sawRunningB || statusB === 'running';

    if (statusA === 'running' && statusB === 'running') return;
    await sleep(20);
  }

  throw new Error(
    `未观察到并发运行窗口: sawRunningA=${sawRunningA} sawRunningB=${sawRunningB} latestA=${latestA} latestB=${latestB}`,
  );
}

async function abortSessionWithRetry(
  request: APIRequestContext,
  sessionId: string,
  timeoutMs = 8_000,
): Promise<void> {
  const startedAt = Date.now();
  let latestAbortStatus = -1;
  let latestAbortBody = '';
  let latestSessionStatus = 'unknown';

  while (Date.now() - startedAt < timeoutMs) {
    const response = await request.post(`/api/agent/sessions/${sessionId}/abort`, {
      data: {},
    });
    latestAbortStatus = response.status();
    latestAbortBody = await response.text();

    if (response.ok()) return;
    if (response.status() !== 409) {
      throw new Error(
        `执行 abort 失败: status=${response.status()} body=${latestAbortBody}`,
      );
    }

    latestSessionStatus = await readSessionStatus(request, sessionId);
    if (latestSessionStatus === 'aborted') return;

    await sleep(80);
  }

  throw new Error(
    `执行 abort 超时: latestAbortStatus=${latestAbortStatus} latestSessionStatus=${latestSessionStatus} body=${latestAbortBody}`,
  );
}

function getSessionId(state: BddState, key: SessionKey): string {
  const value = state.sessionsByKey?.[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`会话 ${key} 未初始化`);
  }
  return value;
}

function getStreamHandle(state: BddState, key: SessionKey): TurnStreamHandle {
  const handle = state.streamsByKey?.[key];
  if (!handle) {
    throw new Error(`会话 ${key} 的 turn 流尚未启动`);
  }
  return handle;
}

async function resolveEvents(state: BddState, key: SessionKey): Promise<StreamEvent[]> {
  const handle = getStreamHandle(state, key);
  const events = await handle.eventsPromise;
  if (handle.responseStatus !== 200) {
    throw new Error(
      `会话 ${key} turn 响应异常: status=${handle.responseStatus} body=${handle.errorBody || ''}`,
    );
  }
  return events;
}

Given('我准备了两个用于并发验证的 Deterministic 会话', async ({
  request,
  bddState,
}) => {
  const state = getState(bddState);
  state.sessionsByKey = {};
  state.streamsByKey = {};

  for (const key of ['A', 'B'] as SessionKey[]) {
    const createRes = await request.post('/api/agent/sessions', {
      data: {
        title: `bdd-multi-${key}-${Date.now()}`,
        providerId: DETERMINISTIC_PROVIDER_ID,
        engine: 'coding-agent',
      },
    });

    if (!createRes.ok()) {
      throw new Error(
        `创建会话 ${key} 失败: status=${createRes.status()} body=${await createRes.text()}`,
      );
    }

    const payload = (await createRes.json()) as { id?: string };
    expect(typeof payload.id).toBe('string');
    state.sessionsByKey[key] = payload.id;
  }
});

When('我在会话 {word} 启动流式 turn {string}', async ({ bddState }, keyRaw, text) => {
  const state = getState(bddState);
  const key = toSessionKey(keyRaw);
  const sessionId = getSessionId(state, key);

  const handle = await startTurnStream(sessionId, text);
  state.streamsByKey = {
    ...(state.streamsByKey || {}),
    [key]: handle,
  };
});

When('我在会话 {word} 运行中执行 abort', async ({ request, bddState }, keyRaw) => {
  const state = getState(bddState);
  const key = toSessionKey(keyRaw);
  const sessionId = getSessionId(state, key);

  await abortSessionWithRetry(request, sessionId);
});

Then('两个会话应出现并发运行窗口', async ({ request, bddState }) => {
  const state = getState(bddState);
  const sessionAId = getSessionId(state, 'A');
  const sessionBId = getSessionId(state, 'B');

  await waitForConcurrentRunning(request, sessionAId, sessionBId);
});

Then(
  '会话 {word} 的 turn 流中不应出现会话 {word} 的 sessionId',
  async ({ bddState }, currentKeyRaw, otherKeyRaw) => {
    const state = getState(bddState);
    const currentKey = toSessionKey(currentKeyRaw);
    const otherKey = toSessionKey(otherKeyRaw);

    const events = await resolveEvents(state, currentKey);
    const currentSessionId = getSessionId(state, currentKey);
    const otherSessionId = getSessionId(state, otherKey);

    expect(events.length).toBeGreaterThan(0);
    const hasCurrent = events.some(
      (event) => event.sessionId === currentSessionId,
    );
    expect(hasCurrent).toBeTruthy();

    const mixed = events.some((event) => event.sessionId === otherSessionId);
    expect(mixed).toBeFalsy();
  },
);

Then('会话 {word} 状态最终应为 {string}', async ({ request, bddState }, keyRaw, expected) => {
  const state = getState(bddState);
  const key = toSessionKey(keyRaw);

  await resolveEvents(state, key);

  const sessionId = getSessionId(state, key);
  await expect.poll(async () => readSessionStatus(request, sessionId)).toBe(
    expected,
  );
});

Then('会话 {word} 的 turn 流应包含事件 {string}', async ({ bddState }, keyRaw, expected) => {
  const state = getState(bddState);
  const key = toSessionKey(keyRaw);
  const events = await resolveEvents(state, key);
  const types = events.map((event) => event.type);

  for (const target of parseExpectedTypes(expected)) {
    expect(types.includes(target)).toBeTruthy();
  }
});

Then('会话 {word} 的 turn 流不应包含事件 {string}', async ({ bddState }, keyRaw, expected) => {
  const state = getState(bddState);
  const key = toSessionKey(keyRaw);
  const events = await resolveEvents(state, key);
  const types = events.map((event) => event.type);

  for (const target of parseExpectedTypes(expected)) {
    expect(types.includes(target)).toBeFalsy();
  }
});
