import type { APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { expect, Given, Then, When } from './fixtures';

type ErrorCategory = 'auth' | 'rate_limit' | 'network' | 'unknown';

interface StreamEvent {
  type: string;
  payload: Record<string, unknown>;
}

interface MockProviderServer {
  baseUrl: string;
  close: () => Promise<void>;
}

type BddState = Record<string, unknown> & {
  providerId?: string;
  providerSessionId?: string;
  providerServer?: MockProviderServer;
  turnResponseStatus?: number;
  providerTraceEvent?: string;
  providerTraceStatus?: number | null;
  providerTraceSummary?: string;
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

function sqliteEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function quote(value: string): string {
  return `'${sqliteEscape(value)}'`;
}

function bddDbPath(): string {
  return path.join(process.cwd(), '.tmp', 'bdd-data', 'shooting-planner.db');
}

function runSql(sql: string): void {
  const payload = `PRAGMA busy_timeout=3000; ${sql}`;
  execFileSync('sqlite3', [bddDbPath(), payload], {
    stdio: 'pipe',
  });
}

function seedOpenAIProvider(baseUrl: string, namePrefix: string): string {
  const providerId = `prov_${randomUUID()}`;
  const now = 'unixepoch()';

  runSql(`
INSERT INTO providers (
  id, name, format, routing_profile, base_url, api_key,
  text_model, image_model, capabilities, is_default, is_builtin, created_at, updated_at
) VALUES (
  ${quote(providerId)},
  ${quote(`${namePrefix}-${Date.now()}`)},
  'openai',
  'openai_compat_chat_only',
  ${quote(baseUrl)},
  ${quote('bdd-provider-key')},
  ${quote('gpt-4o-mini')},
  ${quote('gpt-image-1')},
  NULL,
  0,
  0,
  ${now},
  ${now}
);
`);

  return providerId;
}

function deleteProvider(providerId: string): void {
  runSql(`DELETE FROM providers WHERE id=${quote(providerId)};`);
}

async function reserveUnusedPort(): Promise<number> {
  const server = createNetServer();

  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('无法分配可用端口'));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function startErrorProviderServer(input: {
  status: number;
  message: string;
}): Promise<MockProviderServer> {
  const server: Server = createServer((req, res) => {
    // drain request body
    req.on('data', () => undefined);
    req.on('end', () => {
      res.writeHead(input.status, {
        'content-type': 'application/json',
      });
      res.end(
        JSON.stringify({
          error: {
            message: input.message,
            code: `bdd_${input.status}`,
          },
        }),
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  server.unref();

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('mock provider server 地址异常');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
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
            payload?: unknown;
          };
        };

        if (!parsed.event || typeof parsed.event.type !== 'string') {
          continue;
        }

        events.push({
          type: parsed.event.type,
          payload: toPayloadRecord(parsed.event.payload),
        });
      } catch {
        // ignore malformed payload
      }
    }
  }

  return events;
}

function classifyProviderTrace(input: {
  event?: string;
  status?: number | null;
  summary?: string;
}): ErrorCategory {
  const event = (input.event || '').trim();
  const status =
    typeof input.status === 'number' && Number.isFinite(input.status)
      ? input.status
      : null;
  const text = (input.summary || '').toLowerCase();

  if (status === 401 || status === 403) {
    return 'auth';
  }

  if (status === 429) {
    return 'rate_limit';
  }

  if (event === 'provider.response_error') {
    return 'network';
  }

  if (
    /\b401\b|\b403\b|unauthorized|forbidden|invalid api key|authentication|auth/.test(
      text,
    )
  ) {
    return 'auth';
  }

  if (/\b429\b|rate\s*limit|too many requests|quota/.test(text)) {
    return 'rate_limit';
  }

  if (
    /fetch|network|econnrefused|enotfound|connect|timeout|timed out|socket/.test(
      text,
    )
  ) {
    return 'network';
  }

  return 'unknown';
}

async function createProviderBoundSession(input: {
  request: APIRequestContext;
  providerId: string;
  titlePrefix: string;
}): Promise<string> {
  const response = await input.request.post('/api/agent/sessions', {
    data: {
      title: `${input.titlePrefix}-${Date.now()}`,
      providerId: input.providerId,
      engine: 'agent-core',
    },
  });

  if (!response.ok()) {
    throw new Error(
      `创建 provider 会话失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { id?: string };
  if (typeof payload.id !== 'string') {
    throw new Error('创建 provider 会话返回缺少 id');
  }
  return payload.id;
}

async function cleanupProviderState(state: BddState): Promise<void> {
  const server = state.providerServer;
  const providerId = state.providerId;

  state.providerServer = undefined;
  state.providerId = undefined;

  if (server) {
    await server.close().catch(() => undefined);
  }

  if (providerId) {
    deleteProvider(providerId);
  }
}

Given('我准备一个会返回 401 的 Provider 会话', async ({ request, bddState }) => {
  const state = getState(bddState);

  const server = await startErrorProviderServer({
    status: 401,
    message: 'bdd unauthorized',
  });

  const providerId = seedOpenAIProvider(server.baseUrl, 'bdd-provider-401');
  const sessionId = await createProviderBoundSession({
    request,
    providerId,
    titlePrefix: 'bdd-provider-auth',
  });

  state.providerServer = server;
  state.providerId = providerId;
  state.providerSessionId = sessionId;
  state.turnResponseStatus = undefined;
  state.providerTraceEvent = undefined;
  state.providerTraceStatus = undefined;
  state.providerTraceSummary = undefined;
});

Given('我准备一个会返回 429 的 Provider 会话', async ({ request, bddState }) => {
  const state = getState(bddState);

  const server = await startErrorProviderServer({
    status: 429,
    message: 'bdd too many requests',
  });

  const providerId = seedOpenAIProvider(server.baseUrl, 'bdd-provider-429');
  const sessionId = await createProviderBoundSession({
    request,
    providerId,
    titlePrefix: 'bdd-provider-rate',
  });

  state.providerServer = server;
  state.providerId = providerId;
  state.providerSessionId = sessionId;
  state.turnResponseStatus = undefined;
  state.providerTraceEvent = undefined;
  state.providerTraceStatus = undefined;
  state.providerTraceSummary = undefined;
});

Given('我准备一个不可达的 Provider 会话', async ({ request, bddState }) => {
  const state = getState(bddState);

  const port = await reserveUnusedPort();
  const unreachableBaseUrl = `http://127.0.0.1:${port}/v1`;

  const providerId = seedOpenAIProvider(
    unreachableBaseUrl,
    'bdd-provider-unreachable',
  );
  const sessionId = await createProviderBoundSession({
    request,
    providerId,
    titlePrefix: 'bdd-provider-network',
  });

  state.providerServer = undefined;
  state.providerId = providerId;
  state.providerSessionId = sessionId;
  state.turnResponseStatus = undefined;
  state.providerTraceEvent = undefined;
  state.providerTraceStatus = undefined;
  state.providerTraceSummary = undefined;
});

When('我发送一次会触发 Provider 调用的 turn', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.providerSessionId).toBe('string');

  const sessionId = state.providerSessionId as string;
  const apiBaseUrl = buildApiBaseUrl();

  try {
    const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: '请给我一句用于 BDD 的简短建议',
        clientMessageId: buildClientMessageId('cm-provider-taxonomy'),
      }),
    });

    state.turnResponseStatus = response.status;

    // drain stream/body first
    await response.text();

    const startedAt = Date.now();
    const timeoutMs = 5_000;
    let rows: Array<{ event?: unknown; data?: unknown }> = [];

    while (Date.now() - startedAt < timeoutMs) {
      const tracesRes = await request.get(
        `/api/agent/traces?sessionId=${encodeURIComponent(sessionId)}&channel=provider&limit=200`,
      );
      if (!tracesRes.ok()) {
        throw new Error(
          `读取 provider trace 失败: status=${tracesRes.status()} body=${await tracesRes.text()}`,
        );
      }

      const tracesPayload = (await tracesRes.json()) as {
        data?: Array<{ event?: unknown; data?: unknown }>;
      };

      rows = Array.isArray(tracesPayload.data) ? tracesPayload.data : [];
      const hasTerminal = rows.some((row) => {
        const event = typeof row.event === 'string' ? row.event : '';
        return event === 'provider.response_done' || event === 'provider.response_error';
      });
      if (hasTerminal) break;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const terminal = [...rows]
      .reverse()
      .find((row) => {
        const event = typeof row.event === 'string' ? row.event : '';
        return event === 'provider.response_error' || event === 'provider.response_done';
      });

    const fallback = [...rows]
      .reverse()
      .find((row) => typeof row.event === 'string' && row.event !== 'provider.request');

    const target = terminal || fallback;

    if (!target || typeof target.event !== 'string') {
      state.providerTraceEvent = '';
      state.providerTraceStatus = null;
      state.providerTraceSummary = '';
      return;
    }

    const data =
      target.data && typeof target.data === 'object'
        ? (target.data as Record<string, unknown>)
        : {};

    const status =
      typeof data.status === 'number' && Number.isFinite(data.status)
        ? data.status
        : null;

    const summary = [
      target.event,
      status !== null ? `status=${status}` : '',
      typeof data.url === 'string' ? data.url : '',
      typeof data.error === 'string' ? data.error : '',
      typeof data.reason === 'string' ? data.reason : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    state.providerTraceEvent = target.event;
    state.providerTraceStatus = status;
    state.providerTraceSummary = summary;
  } finally {
    await cleanupProviderState(state);
  }
});

Then('本轮调用应记录 Provider 错误轨迹', async ({ bddState }) => {
  const state = getState(bddState);
  const event = state.providerTraceEvent || '';
  expect(event.length > 0).toBeTruthy();
  expect(event === 'provider.response_done' || event === 'provider.response_error').toBeTruthy();
});

Then('Provider 轨迹状态码应为 {int}', async ({ bddState }, expectedStatus) => {
  const state = getState(bddState);
  expect(state.providerTraceStatus).toBe(expectedStatus);
});

Then('Provider 轨迹事件应为 {string}', async ({ bddState }, expectedEvent) => {
  const state = getState(bddState);
  expect(state.providerTraceEvent).toBe(expectedEvent);
});

Then('错误应被归类为 {string}', async ({ bddState }, expectedCategory) => {
  const state = getState(bddState);
  const actual = classifyProviderTrace({
    event: state.providerTraceEvent,
    status: state.providerTraceStatus,
    summary: state.providerTraceSummary,
  });
  expect(actual).toBe(expectedCategory as ErrorCategory);
});
