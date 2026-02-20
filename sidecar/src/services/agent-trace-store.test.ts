import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { resetAgentTraceFlagsCache } from '../config/agent-trace-flags';
import { getSqlite, initDatabase } from '../db';
import {
  appendTraceLog,
  getTraceTimeline,
  listTraceLogs,
} from './agent-trace-store';

let dbReady = false;

async function ensureDb() {
  if (dbReady) return;
  await initDatabase();
  dbReady = true;
}

async function withTraceEnv(
  next: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const backup = new Map<string, string | undefined>();
  for (const key of Object.keys(next)) {
    backup.set(key, process.env[key]);
    const value = next[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetAgentTraceFlagsCache();
  try {
    await run();
  } finally {
    for (const [key, value] of backup.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetAgentTraceFlagsCache();
  }
}

function deleteTrace(traceId: string): void {
  const sqlite = getSqlite();
  sqlite.prepare('DELETE FROM agent_trace_logs WHERE trace_id = ?').run(traceId);
}

test(
  'appendTraceLog cleanup removes rows older than retention window',
  { concurrency: false },
  async () => {
    await ensureDb();

    const oldTraceId = `trace_old_${randomUUID()}`;
    const newTraceId = `trace_new_${randomUUID()}`;

    await withTraceEnv(
      {
        AGENT_TRACE_ENABLED: '1',
        AGENT_TRACE_SAMPLE_RATE: '1',
        AGENT_TRACE_RETENTION_HOURS: '1',
      },
      async () => {
        const sqlite = getSqlite();
        deleteTrace(oldTraceId);
        deleteTrace(newTraceId);

        const oldSec = Math.floor(Date.now() / 1000) - 7200;
        sqlite
          .prepare(
            `
            INSERT INTO agent_trace_logs (
              id, trace_id, request_id, session_id, turn_id, client_message_id,
              channel, event, level, ok, data_json, created_at
            ) VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            `legacy_${randomUUID()}`,
            oldTraceId,
            'api',
            'api.legacy',
            'info',
            1,
            JSON.stringify({ legacy: true }),
            oldSec,
          );

        const appended = await appendTraceLog({
          traceId: newTraceId,
          channel: 'api',
          event: 'api.request.start',
          data: { from: 'cleanup-test' },
        });
        assert.ok(appended);

        const oldCount = sqlite
          .prepare('SELECT COUNT(*) AS value FROM agent_trace_logs WHERE trace_id = ?')
          .get(oldTraceId) as { value: number };
        assert.equal(Number(oldCount.value || 0), 0);
      },
    );

    deleteTrace(newTraceId);
  },
);

test(
  'appendTraceLog sampling and listTraceLogs pagination',
  { concurrency: false },
  async () => {
    await ensureDb();
    const traceId = `trace_page_${randomUUID()}`;
    deleteTrace(traceId);

    await withTraceEnv(
      {
        AGENT_TRACE_ENABLED: '1',
        AGENT_TRACE_SAMPLE_RATE: '0',
      },
      async () => {
        const dropped = await appendTraceLog({
          traceId,
          channel: 'api',
          event: 'api.request.start',
          data: { stage: 'dropped' },
        });
        assert.equal(dropped, null);
      },
    );

    await withTraceEnv(
      {
        AGENT_TRACE_ENABLED: '1',
        AGENT_TRACE_SAMPLE_RATE: '1',
      },
      async () => {
        for (let i = 0; i < 3; i += 1) {
          const row = await appendTraceLog({
            traceId,
            channel: 'api',
            event: 'api.request.start',
            data: { index: i },
          });
          assert.ok(row);
        }

        const page1 = await listTraceLogs({
          traceId,
          limit: 2,
        });
        assert.equal(page1.data.length, 2);
        assert.equal(page1.total, 3);

        const page2 = await listTraceLogs({
          traceId,
          cursor: page1.cursor,
          limit: 2,
        });
        assert.equal(page2.data.length, 1);
        assert.equal(page2.total, 3);
      },
    );

    deleteTrace(traceId);
  },
);

test(
  'getTraceTimeline reports key breakpoints for missing API/SSE and empty stop',
  { concurrency: false },
  async () => {
    await ensureDb();
    const traceId = `trace_timeline_${randomUUID()}`;
    deleteTrace(traceId);

    await withTraceEnv(
      {
        AGENT_TRACE_ENABLED: '1',
        AGENT_TRACE_SAMPLE_RATE: '1',
      },
      async () => {
        await appendTraceLog({
          traceId,
          channel: 'ui',
          event: 'ui.submit_click',
          data: { action: 'turn' },
        });

        await appendTraceLog({
          traceId,
          channel: 'runtime',
          event: 'runtime.assistant.completed',
          data: {
            textLen: 0,
            stopReason: 'stop',
            usage: { totalTokens: 0 },
          },
        });
        await appendTraceLog({
          traceId,
          channel: 'runtime',
          event: 'runtime.assistant.empty_stop_detected',
          data: {
            reason: 'empty_stop_guard',
          },
        });

        const timeline = await getTraceTimeline(traceId);
        assert.ok(
          timeline.breakpoints.some((item) => item.includes('ui.submit_click')),
        );
        assert.ok(
          timeline.breakpoints.some((item) => item.includes('无 sse.open')),
        );
        assert.ok(
          timeline.breakpoints.some((item) => item.includes('空回复结束')),
        );
      },
    );

    deleteTrace(traceId);
  },
);
