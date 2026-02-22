import { randomUUID } from 'node:crypto';
import { expect, Given, Then, When } from './fixtures';

interface TraceRow {
  seq: number;
  traceId: string;
  channel: string;
  event: string;
}

type TracePage = {
  data: TraceRow[];
  cursor: number;
  total: number;
};

type BddState = Record<string, unknown> & {
  traceId?: string;
  expectedEvents?: string[];
  firstPage?: TracePage;
  secondPage?: TracePage;
  repeatPage?: TracePage;
  timelineTotalEvents?: number;
  hugeCursorStatus?: number;
  hugeCursorRows?: TraceRow[];
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function toTraceRows(value: unknown): TraceRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      if (
        typeof row.seq !== 'number' ||
        typeof row.traceId !== 'string' ||
        typeof row.channel !== 'string' ||
        typeof row.event !== 'string'
      ) {
        return null;
      }
      return {
        seq: row.seq,
        traceId: row.traceId,
        channel: row.channel,
        event: row.event,
      } satisfies TraceRow;
    })
    .filter((item): item is TraceRow => Boolean(item));
}

Given('我写入一组同 traceId 的客户端追踪事件', async ({ request, bddState }) => {
  const state = getState(bddState);
  const traceId = `trace-bdd-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const expectedEvents = ['ui.bdd.trace.start', 'render.bdd.trace.commit'];

  const response = await request.post('/api/agent/traces/client-batch', {
    data: {
      events: [
        {
          traceId,
          channel: 'ui',
          event: expectedEvents[0],
          level: 'info',
          data: { step: 1 },
        },
        {
          traceId,
          channel: 'render',
          event: expectedEvents[1],
          level: 'info',
          data: { step: 2 },
        },
      ],
    },
  });

  if (!response.ok()) {
    throw new Error(
      `写入 trace 事件失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { accepted?: number };
  expect(payload.accepted).toBe(2);

  state.traceId = traceId;
  state.expectedEvents = expectedEvents;
  state.firstPage = undefined;
  state.secondPage = undefined;
  state.repeatPage = undefined;
  state.timelineTotalEvents = undefined;
  state.hugeCursorStatus = undefined;
  state.hugeCursorRows = undefined;
});

When('我按 cursor 分页拉取该 trace 日志', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.traceId).toBe('string');

  const traceId = state.traceId as string;

  const firstRes = await request.get(
    `/api/agent/traces?traceId=${encodeURIComponent(traceId)}&limit=1`,
  );
  if (!firstRes.ok()) {
    throw new Error(
      `拉取第一页失败: status=${firstRes.status()} body=${await firstRes.text()}`,
    );
  }

  const firstPayload = (await firstRes.json()) as {
    data?: unknown;
    cursor?: unknown;
    total?: number;
  };

  if (typeof firstPayload.cursor !== 'number' || !Number.isFinite(firstPayload.cursor)) {
    throw new Error(`第一页 cursor 非法: payload=${JSON.stringify(firstPayload)}`);
  }

  const firstPage: TracePage = {
    data: toTraceRows(firstPayload.data),
    cursor: firstPayload.cursor,
    total: typeof firstPayload.total === 'number' ? firstPayload.total : 0,
  };

  const secondRes = await request.get(
    `/api/agent/traces?traceId=${encodeURIComponent(traceId)}&limit=1&cursor=${firstPage.cursor}`,
  );
  if (!secondRes.ok()) {
    throw new Error(
      `拉取第二页失败: status=${secondRes.status()} body=${await secondRes.text()}`,
    );
  }

  const secondPayload = (await secondRes.json()) as {
    data?: unknown;
    cursor?: unknown;
    total?: number;
  };

  if (typeof secondPayload.cursor !== 'number' || !Number.isFinite(secondPayload.cursor)) {
    throw new Error(`第二页 cursor 非法: payload=${JSON.stringify(secondPayload)}`);
  }

  const secondPage: TracePage = {
    data: toTraceRows(secondPayload.data),
    cursor: secondPayload.cursor,
    total: typeof secondPayload.total === 'number' ? secondPayload.total : 0,
  };

  const timelineRes = await request.get(
    `/api/agent/traces/${encodeURIComponent(traceId)}/timeline`,
  );
  if (!timelineRes.ok()) {
    throw new Error(
      `读取 timeline 失败: status=${timelineRes.status()} body=${await timelineRes.text()}`,
    );
  }

  const timelinePayload = (await timelineRes.json()) as {
    totalEvents?: number;
  };

  state.firstPage = firstPage;
  state.secondPage = secondPage;
  state.timelineTotalEvents =
    typeof timelinePayload.totalEvents === 'number'
      ? timelinePayload.totalEvents
      : 0;
});

When('我重复使用第一页 cursor 拉取该 trace 日志', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.traceId).toBe('string');
  expect(Boolean(state.firstPage)).toBeTruthy();

  const traceId = state.traceId as string;
  const firstCursor = state.firstPage?.cursor;
  if (typeof firstCursor !== 'number' || !Number.isFinite(firstCursor)) {
    throw new Error('缺少第一页 cursor，无法重复拉取');
  }

  const response = await request.get(
    `/api/agent/traces?traceId=${encodeURIComponent(traceId)}&limit=1&cursor=${firstCursor}`,
  );

  if (!response.ok()) {
    throw new Error(
      `重复拉取失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    data?: unknown;
    cursor?: unknown;
    total?: number;
  };

  if (typeof payload.cursor !== 'number' || !Number.isFinite(payload.cursor)) {
    throw new Error(`重复拉取 cursor 非法: payload=${JSON.stringify(payload)}`);
  }

  state.repeatPage = {
    data: toTraceRows(payload.data),
    cursor: payload.cursor,
    total: typeof payload.total === 'number' ? payload.total : 0,
  };
});

When('我以超大 cursor 拉取该 trace 日志', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.traceId).toBe('string');

  const traceId = state.traceId as string;
  const hugeCursor = Number.MAX_SAFE_INTEGER;

  const response = await request.get(
    `/api/agent/traces?traceId=${encodeURIComponent(traceId)}&limit=20&cursor=${hugeCursor}`,
  );

  state.hugeCursorStatus = response.status();

  if (!response.ok()) {
    state.hugeCursorRows = [];
    return;
  }

  const payload = (await response.json()) as { data?: unknown };
  state.hugeCursorRows = toTraceRows(payload.data);
});

Then('第一页应返回 {int} 条 trace 日志', async ({ bddState }, expected) => {
  const state = getState(bddState);
  const page = state.firstPage;
  expect(Boolean(page)).toBeTruthy();
  expect(page?.data.length).toBe(expected);
});

Then('第二页应返回后续 {int} 条 trace 日志', async ({ bddState }, expected) => {
  const state = getState(bddState);
  const page = state.secondPage;
  expect(Boolean(page)).toBeTruthy();
  expect(page?.data.length).toBe(expected);
});

Then('第二页首条 seq 应大于第一页 cursor', async ({ bddState }) => {
  const state = getState(bddState);
  const firstPage = state.firstPage;
  const secondPage = state.secondPage;

  expect(Boolean(firstPage)).toBeTruthy();
  expect(Boolean(secondPage)).toBeTruthy();

  const secondFirstSeq = secondPage?.data[0]?.seq ?? 0;
  const firstCursor = firstPage?.cursor ?? 0;
  expect(secondFirstSeq).toBeGreaterThan(firstCursor);
});

Then('分页结果应绑定到同一 traceId 且包含写入事件', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.traceId).toBe('string');
  expect(Array.isArray(state.expectedEvents)).toBeTruthy();

  const traceId = state.traceId as string;
  const expectedEvents = state.expectedEvents as string[];
  const firstPage = state.firstPage;
  const secondPage = state.secondPage;
  const rows = [...(firstPage?.data || []), ...(secondPage?.data || [])];

  expect(rows.length).toBeGreaterThanOrEqual(expectedEvents.length);
  expect(rows.every((row) => row.traceId === traceId)).toBeTruthy();
  expect(new Set(rows.map((row) => row.seq)).size).toBe(rows.length);

  const bindings = new Set(rows.map((row) => `${row.traceId}::${row.event}`));
  for (const event of expectedEvents) {
    expect(bindings.has(`${traceId}::${event}`)).toBeTruthy();
  }
});

Then('重复拉取得到的 seq 集合应与第二页一致', async ({ bddState }) => {
  const state = getState(bddState);
  const secondPage = state.secondPage;
  const repeatPage = state.repeatPage;

  expect(Boolean(secondPage)).toBeTruthy();
  expect(Boolean(repeatPage)).toBeTruthy();

  const secondSeqSet = new Set((secondPage?.data || []).map((row) => row.seq));
  const repeatSeqSet = new Set((repeatPage?.data || []).map((row) => row.seq));

  expect(Array.from(repeatSeqSet).sort((a, b) => a - b)).toEqual(
    Array.from(secondSeqSet).sort((a, b) => a - b),
  );
});

Then('trace 拉取响应状态码应为 {int}', async ({ bddState }, expectedStatus) => {
  const state = getState(bddState);
  expect(state.hugeCursorStatus).toBe(expectedStatus);
});

Then('trace 返回数据应为 {int} 条', async ({ bddState }, expectedCount) => {
  const state = getState(bddState);
  const rows = state.hugeCursorRows || [];
  expect(rows.length).toBe(expectedCount);
});

Then('该 trace timeline 的 totalEvents 应不少于 {int}', async ({ bddState }, minEvents) => {
  const state = getState(bddState);
  expect(typeof state.timelineTotalEvents).toBe('number');
  expect((state.timelineTotalEvents || 0) >= minEvents).toBeTruthy();
});
