import type { APIRequestContext } from '@playwright/test';
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

async function readSseEvents(response: Response): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
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

      const line = rawBlock
        .split('\n')
        .find((item) => item.startsWith('data:'));
      if (!line) continue;

      const rawPayload = line.replace(/^data:\s*/, '').trim();
      if (!rawPayload) continue;

      try {
        const parsed = JSON.parse(rawPayload) as {
          event?: {
            type?: unknown;
            sessionId?: unknown;
          };
        };

        if (!parsed.event || typeof parsed.event.type !== 'string') {
          continue;
        }

        events.push({
          type: parsed.event.type,
          sessionId:
            typeof parsed.event.sessionId === 'string'
              ? parsed.event.sessionId
              : null,
        });
      } catch {
        // ignore malformed chunk
      }
    }
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

async function waitForStatus(
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
  throw new Error(`等待会话状态超时: expected=${expected}, actual=${latest}`);
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

  await waitForStatus(request, sessionId, 'running');

  const response = await request.post(`/api/agent/sessions/${sessionId}/abort`, {
    data: {},
  });

  if (!response.ok()) {
    throw new Error(
      `会话 ${key} abort 失败: status=${response.status()} body=${await response.text()}`,
    );
  }
});

Then(
  '会话 {word} 的 turn 流中不应出现会话 {word} 的 sessionId',
  async ({ bddState }, currentKeyRaw, otherKeyRaw) => {
    const state = getState(bddState);
    const currentKey = toSessionKey(currentKeyRaw);
    const otherKey = toSessionKey(otherKeyRaw);

    const events = await resolveEvents(state, currentKey);
    const otherSessionId = getSessionId(state, otherKey);

    expect(events.length).toBeGreaterThan(0);
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
