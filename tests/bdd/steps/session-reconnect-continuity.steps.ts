import type { APIRequestContext } from '@playwright/test';
import { expect, Given, Then, When } from './fixtures';

const DETERMINISTIC_PROVIDER_ID = '__bdd_deterministic__';

interface SessionEventRow {
  seq: number;
  eventType: string;
}

interface EventsPage {
  data: SessionEventRow[];
  cursor: number;
}

type BddState = Record<string, unknown> & {
  reconnectSessionId?: string;
  streamDonePromise?: Promise<void>;
  streamResponseStatus?: number;
  streamErrorBody?: string;
  firstPage?: EventsPage;
  resumedPage?: EventsPage;
  repeatedPage?: EventsPage;
  fullPage?: EventsPage;
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

function toRows(value: unknown): SessionEventRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      if (typeof row.seq !== 'number' || typeof row.eventType !== 'string') {
        return null;
      }
      return {
        seq: row.seq,
        eventType: row.eventType,
      } satisfies SessionEventRow;
    })
    .filter((row): row is SessionEventRow => Boolean(row));
}

async function drainSse(response: Response): Promise<void> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
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

async function fetchEventsPage(
  request: APIRequestContext,
  sessionId: string,
  input?: { cursor?: number; limit?: number },
): Promise<EventsPage> {
  const query = new URLSearchParams();
  if (typeof input?.limit === 'number') {
    query.set('limit', String(input.limit));
  }
  if (typeof input?.cursor === 'number') {
    query.set('cursor', String(input.cursor));
  }

  const qs = query.toString();
  const response = await request.get(
    `/api/agent/sessions/${sessionId}/events${qs ? `?${qs}` : ''}`,
  );
  if (!response.ok()) {
    throw new Error(
      `读取会话事件失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    data?: unknown;
    cursor?: unknown;
  };

  if (typeof payload.cursor !== 'number' || !Number.isFinite(payload.cursor)) {
    throw new Error(`事件分页 cursor 非法: payload=${JSON.stringify(payload)}`);
  }

  return {
    data: toRows(payload.data),
    cursor: payload.cursor,
  };
}

Given('我准备了用于断线续播验证的 Deterministic 会话', async ({ request, bddState }) => {
  const state = getState(bddState);

  const createRes = await request.post('/api/agent/sessions', {
    data: {
      title: `bdd-reconnect-${Date.now()}`,
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

  state.reconnectSessionId = payload.id;
  state.streamDonePromise = undefined;
  state.streamResponseStatus = undefined;
  state.streamErrorBody = undefined;
  state.firstPage = undefined;
  state.resumedPage = undefined;
  state.repeatedPage = undefined;
  state.fullPage = undefined;
});

When('我启动流式 turn 并在运行中记录第一页事件游标', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.reconnectSessionId).toBe('string');

  const sessionId = state.reconnectSessionId as string;
  const apiBaseUrl = buildApiBaseUrl();
  const responsePromise = fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: '请持续输出，便于验证断线续播事件分页',
      clientMessageId: buildClientMessageId('cm-reconnect'),
    }),
  });

  state.streamDonePromise = (async () => {
    const response = await responsePromise;
    state.streamResponseStatus = response.status;

    if (!response.ok) {
      state.streamErrorBody = await response.text();
      return;
    }

    await drainSse(response);
  })();

  await waitForSessionStatus(request, sessionId, 'running');

  const startedAt = Date.now();
  const timeoutMs = 5_000;
  let firstPage: EventsPage | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const page = await fetchEventsPage(request, sessionId, { limit: 2 });
    if (page.data.length > 0) {
      firstPage = page;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  if (!firstPage) {
    throw new Error('未在运行阶段拉取到第一页会话事件');
  }

  state.firstPage = firstPage;
});

When('我在 turn 完成后基于该游标续拉事件', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.reconnectSessionId).toBe('string');
  expect(Boolean(state.streamDonePromise)).toBeTruthy();
  expect(Boolean(state.firstPage)).toBeTruthy();

  await state.streamDonePromise;

  if (state.streamResponseStatus !== 200) {
    throw new Error(
      `turn 响应状态异常: status=${state.streamResponseStatus} body=${state.streamErrorBody || ''}`,
    );
  }

  const sessionId = state.reconnectSessionId as string;
  const firstCursor = state.firstPage?.cursor;
  if (typeof firstCursor !== 'number') {
    throw new Error('缺少第一页 cursor，无法续拉');
  }

  state.resumedPage = await fetchEventsPage(request, sessionId, {
    cursor: firstCursor,
    limit: 500,
  });

  state.fullPage = await fetchEventsPage(request, sessionId, {
    limit: 500,
  });
});

When('我再次使用同一游标续拉会话事件', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.reconnectSessionId).toBe('string');
  expect(Boolean(state.firstPage)).toBeTruthy();

  const sessionId = state.reconnectSessionId as string;
  const firstCursor = state.firstPage?.cursor;
  if (typeof firstCursor !== 'number') {
    throw new Error('缺少第一页 cursor，无法重复续拉');
  }

  state.repeatedPage = await fetchEventsPage(request, sessionId, {
    cursor: firstCursor,
    limit: 500,
  });
});

Then('续拉事件的首条 seq 应大于第一页 cursor', async ({ bddState }) => {
  const state = getState(bddState);
  const firstPage = state.firstPage;
  const resumedPage = state.resumedPage;

  expect(Boolean(firstPage)).toBeTruthy();
  expect(Boolean(resumedPage)).toBeTruthy();
  expect((resumedPage?.data.length || 0) > 0).toBeTruthy();

  const resumedFirstSeq = resumedPage?.data[0]?.seq ?? 0;
  const firstCursor = firstPage?.cursor ?? 0;
  expect(resumedFirstSeq).toBeGreaterThan(firstCursor);
});

Then('首次与续拉事件合并后应覆盖完整事件序列', async ({ bddState }) => {
  const state = getState(bddState);
  const firstPage = state.firstPage;
  const resumedPage = state.resumedPage;
  const fullPage = state.fullPage;

  expect(Boolean(firstPage)).toBeTruthy();
  expect(Boolean(resumedPage)).toBeTruthy();
  expect(Boolean(fullPage)).toBeTruthy();

  const combined = new Set([
    ...(firstPage?.data || []).map((row) => row.seq),
    ...(resumedPage?.data || []).map((row) => row.seq),
  ]);
  const full = new Set((fullPage?.data || []).map((row) => row.seq));

  expect(combined.size).toBe(full.size);
  for (const seq of full) {
    expect(combined.has(seq)).toBeTruthy();
  }
});

Then('续拉结果应包含事件类型 {string}', async ({ bddState }, expectedEventType) => {
  const state = getState(bddState);
  const resumedPage = state.resumedPage;

  expect(Boolean(resumedPage)).toBeTruthy();
  const eventTypes = new Set((resumedPage?.data || []).map((row) => row.eventType));
  expect(eventTypes.has(expectedEventType)).toBeTruthy();
});

Then('断线续播场景会话状态最终应为 {string}', async ({ request, bddState }, expectedStatus) => {
  const state = getState(bddState);
  expect(typeof state.reconnectSessionId).toBe('string');

  const sessionId = state.reconnectSessionId as string;
  await expect.poll(async () => readSessionStatus(request, sessionId)).toBe(
    expectedStatus,
  );
});

Then('重复续拉的 seq 集合应与上次一致', async ({ bddState }) => {
  const state = getState(bddState);
  const resumedPage = state.resumedPage;
  const repeatedPage = state.repeatedPage;

  expect(Boolean(resumedPage)).toBeTruthy();
  expect(Boolean(repeatedPage)).toBeTruthy();

  const resumedSeq = [...new Set((resumedPage?.data || []).map((row) => row.seq))].sort(
    (a, b) => a - b,
  );
  const repeatedSeq = [...new Set((repeatedPage?.data || []).map((row) => row.seq))].sort(
    (a, b) => a - b,
  );

  expect(repeatedSeq).toEqual(resumedSeq);
});
