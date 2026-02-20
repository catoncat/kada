import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { RuntimeRouter } from '../../agent/runtime/runtime-router';
import type { AgentRuntimeEvent } from '../../agent/runtime/agent-runtime';
import { getDb, initDatabase } from '../../db';
import {
  agentToolResultReadability,
  providers,
  tasks,
} from '../../db/schema';
import { listAgentEvents } from '../../services/agent-event-store';
import {
  createAgentSessionRecord,
  deleteAgentSessionRecord,
} from '../../services/agent-session-store';
import {
  appendToolResultReadability,
  getToolResultReadabilityByEntryId,
  updateToolResultReadabilityStatus,
} from '../../services/agent-toolresult-readability-store';
import { agentRoutes } from '../../routes/agent';
import { agentToolResultEnhanceHandler } from './agent-toolresult-enhance';

let dbReady = false;

async function ensureDb() {
  if (dbReady) return;
  await initDatabase();
  dbReady = true;
}

async function withEnv(
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
  }
}

async function createLocalTextProvider(): Promise<string> {
  const db = getDb();
  const id = `provider_${randomUUID()}`;
  const now = new Date();
  await db.insert(providers).values({
    id,
    name: `provider-${id.slice(-6)}`,
    format: 'local',
    routingProfile: 'native',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    textModel: 'qwen3',
    imageModel: 'qwen-image',
    capabilities: null,
    isDefault: false,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function cleanupSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(agentToolResultReadability)
    .where(eq(agentToolResultReadability.sessionId, sessionId));
  await db.delete(tasks).where(eq(tasks.relatedId, sessionId));
  await deleteAgentSessionRecord(sessionId);
}

async function cleanupProvider(providerId: string): Promise<void> {
  const db = getDb();
  await db.delete(providers).where(eq(providers.id, providerId));
}

test(
  'agentToolResultEnhanceHandler uses cache result and emits tool.result.enhanced',
  { concurrency: false },
  async () => {
    await ensureDb();
    const session = await createAgentSessionRecord({
      title: `enhance-cache-${randomUUID().slice(0, 8)}`,
    });
    const turnId = `turn_${randomUUID()}`;
    const sourceHash = `hash_${randomUUID()}`;
    const targetEntryId = `entry_${randomUUID()}`;
    const cacheEntryId = `entry_${randomUUID()}`;

    try {
      await appendToolResultReadability({
        entryId: targetEntryId,
        sessionId: session.id,
        turnId,
        sourceHash,
        sourceSize: 500,
        ruleSummary: '规则摘要',
        ruleDetail: '规则详情',
        status: 'pending',
      });

      await appendToolResultReadability({
        entryId: cacheEntryId,
        sessionId: session.id,
        turnId,
        sourceHash,
        sourceSize: 520,
        ruleSummary: '旧规则摘要',
        ruleDetail: '旧规则详情',
        status: 'completed',
      });
      await updateToolResultReadabilityStatus({
        entryId: cacheEntryId,
        status: 'completed',
        enhancedSummary: '缓存摘要',
        enhancedDetail: '缓存详情',
        enhancedConfidence: 0.91,
        enhancedModel: 'cached-model',
        enhancedReason: 'CACHE_READY',
      });

      const result = await agentToolResultEnhanceHandler({
        sessionId: session.id,
        turnId,
        entryId: targetEntryId,
        sourceHash,
        sourceSize: 500,
        sourcePayload: {
          toolName: 'unknown_tool',
          summary: '规则摘要',
          readableDetail: '规则详情',
          result: { content: [{ type: 'text', text: 'source text' }] },
        },
      });

      assert.equal(result.status, 'completed');
      assert.equal(result.cacheHit, true);

      const updated = await getToolResultReadabilityByEntryId(targetEntryId);
      assert.equal(updated?.status, 'completed');
      assert.equal(updated?.enhancedSummary, '缓存摘要');
      assert.equal(updated?.enhancedDetail, '缓存详情');
      assert.equal(updated?.enhancedReason, 'CACHE_HIT');

      const events = await listAgentEvents({
        sessionId: session.id,
        turnId,
        limit: 100,
      });
      const enhancedEvent = events.find(
        (event) =>
          event.eventType === 'tool.result.enhanced' &&
          (event.payload as Record<string, unknown>)?.entryId === targetEntryId,
      );
      assert.ok(enhancedEvent);
      assert.equal(
        (enhancedEvent?.payload as Record<string, unknown>)?.cacheHit,
        true,
      );
    } finally {
      await cleanupSession(session.id);
    }
  },
);

test(
  'agentToolResultEnhanceHandler marks timeout as ENHANCE_TIMEOUT',
  { concurrency: false },
  async () => {
    await ensureDb();
    const session = await createAgentSessionRecord({
      title: `enhance-timeout-${randomUUID().slice(0, 8)}`,
    });
    const providerId = await createLocalTextProvider();
    const turnId = `turn_${randomUUID()}`;
    const entryId = `entry_${randomUUID()}`;
    const sourceHash = `hash_${randomUUID()}`;
    const originalFetch = globalThis.fetch;

    try {
      await appendToolResultReadability({
        entryId,
        sessionId: session.id,
        turnId,
        sourceHash,
        sourceSize: 560,
        ruleSummary: '规则摘要',
        ruleDetail: '规则详情',
        status: 'pending',
      });

      globalThis.fetch = (async () => {
        throw new Error('request timeout');
      }) as typeof fetch;

      const result = await agentToolResultEnhanceHandler({
        sessionId: session.id,
        turnId,
        entryId,
        providerId,
        sourceHash,
        sourceSize: 560,
        sourcePayload: {
          toolName: 'unknown_tool',
          summary: '规则摘要',
          readableDetail: '规则详情',
          result: {
            content: [{ type: 'text', text: 'timeout source text' }],
          },
        },
      });

      assert.equal(result.status, 'failed');
      const row = await getToolResultReadabilityByEntryId(entryId);
      assert.equal(row?.status, 'failed');
      assert.equal(row?.error, 'ENHANCE_TIMEOUT');
    } finally {
      globalThis.fetch = originalFetch;
      await cleanupProvider(providerId);
      await cleanupSession(session.id);
    }
  },
);

test(
  'agentToolResultEnhanceHandler fails when evidence cannot be verified',
  { concurrency: false },
  async () => {
    await ensureDb();
    const session = await createAgentSessionRecord({
      title: `enhance-evidence-${randomUUID().slice(0, 8)}`,
    });
    const providerId = await createLocalTextProvider();
    const turnId = `turn_${randomUUID()}`;
    const entryId = `entry_${randomUUID()}`;
    const sourceHash = `hash_${randomUUID()}`;
    const originalFetch = globalThis.fetch;

    try {
      await appendToolResultReadability({
        entryId,
        sessionId: session.id,
        turnId,
        sourceHash,
        sourceSize: 620,
        ruleSummary: '规则摘要',
        ruleDetail: '规则详情',
        status: 'pending',
      });

      globalThis.fetch = (async () =>
        ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: '已提炼摘要',
                    detail: '已提炼详情',
                    confidence: 0.88,
                    reason: 'MODEL_OK',
                    evidence: ['missing-evidence'],
                  }),
                },
              },
            ],
          }),
        }) as Response) as typeof fetch;

      const result = await agentToolResultEnhanceHandler({
        sessionId: session.id,
        turnId,
        entryId,
        providerId,
        sourceHash,
        sourceSize: 620,
        sourcePayload: {
          toolName: 'unknown_tool',
          summary: '规则摘要',
          readableDetail: '规则详情',
          result: { content: [{ type: 'text', text: 'only source text' }] },
        },
      });

      assert.equal(result.status, 'failed');
      const row = await getToolResultReadabilityByEntryId(entryId);
      assert.equal(row?.status, 'failed');
      assert.match(row?.error || '', /^EVIDENCE_NOT_FOUND:/);
    } finally {
      globalThis.fetch = originalFetch;
      await cleanupProvider(providerId);
      await cleanupSession(session.id);
    }
  },
);

test(
  'turn route marks readability as RATE_LIMITED_PER_SESSION when burst exceeds threshold',
  { concurrency: false },
  async () => {
    await ensureDb();
    const session = await createAgentSessionRecord({
      title: `enhance-rate-limit-${randomUUID().slice(0, 8)}`,
    });

    const originalRunTurn = RuntimeRouter.prototype.runTurn;

    RuntimeRouter.prototype.runTurn = async function runTurnMock(
      input: Parameters<RuntimeRouter['runTurn']>[0],
    ): Promise<void> {
      try {
        if (input.beforeRun) {
          await input.beforeRun();
        }

        const timestamp = new Date().toISOString();
        for (let i = 0; i < 8; i += 1) {
          const toolEvent: AgentRuntimeEvent = {
            type: 'tool.result',
            sessionId: input.sessionId,
            turnId: input.turnId,
            timestamp,
            payload: {
              toolCallId: `call_${i}`,
              toolName: 'unknown_tool_for_rate_limit',
              isError: false,
              ruleScore: 0.9,
              summary: '规则摘要',
              readableDetail: '规则详情',
              rawStats: { chars: 420, jsonDepth: 2 },
              result: {
                content: [{ type: 'text', text: 'x'.repeat(420) }],
              },
            },
          } as AgentRuntimeEvent;
          await input.onEvent(toolEvent);
        }

        const completedEvent: AgentRuntimeEvent = {
          type: 'turn.completed',
          sessionId: input.sessionId,
          turnId: input.turnId,
          timestamp,
          payload: {},
        } as AgentRuntimeEvent;
        await input.onEvent(completedEvent);
      } finally {
        this.releaseTurnGate(input.sessionId);
      }
    };

    try {
      await withEnv(
        {
          AGENT_TOOLRESULT_ENHANCEMENT: '1',
        },
        async () => {
          const res = await agentRoutes.request(`/sessions/${session.id}/turn`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: 'rate limit verify',
              clientMessageId: `cm_${randomUUID()}`,
            }),
          });

          assert.equal(res.status, 200);
          await res.text();
        },
      );

      const db = getDb();
      const rows = await db
        .select()
        .from(agentToolResultReadability)
        .where(eq(agentToolResultReadability.sessionId, session.id));
      assert.equal(rows.length, 8);

      const skippedRateLimited = rows.filter(
        (row) =>
          row.status === 'skipped' && row.error === 'RATE_LIMITED_PER_SESSION',
      );
      assert.ok(skippedRateLimited.length >= 1);
    } finally {
      RuntimeRouter.prototype.runTurn = originalRunTurn;
      await cleanupSession(session.id);
    }
  },
);
