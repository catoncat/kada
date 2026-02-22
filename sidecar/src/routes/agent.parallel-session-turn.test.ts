import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AgentRuntimeEvent } from '../agent/runtime/agent-runtime';
import { RuntimeRouter } from '../agent/runtime/runtime-router';
import { initDatabase } from '../db';
import {
  createAgentSessionRecord,
  deleteAgentSessionRecord,
} from '../services/agent-session-store';
import { agentRoutes } from './agent';

let dbReady = false;

async function ensureDb() {
  if (dbReady) return;
  await initDatabase();
  dbReady = true;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function parseSseEventTypes(raw: string): string[] {
  const blocks = raw.split('\n\n');
  const eventTypes: string[] = [];

  for (const block of blocks) {
    const line = block
      .split('\n')
      .find((entry) => entry.startsWith('data:'));
    if (!line) continue;

    const payload = line.replace(/^data:\s*/, '').trim();
    if (!payload) continue;

    try {
      const chunk = JSON.parse(payload) as {
        event?: { type?: string };
      };
      if (typeof chunk?.event?.type === 'string') {
        eventTypes.push(chunk.event.type);
      }
    } catch {
      // ignore malformed chunk
    }
  }

  return eventTypes;
}

async function postTurn(sessionId: string, text: string): Promise<Response> {
  return agentRoutes.request(`/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      clientMessageId: `cm_${randomUUID()}`,
    }),
  });
}

test(
  'turn endpoint allows parallel turns across different sessions',
  { concurrency: false },
  async () => {
    await ensureDb();
    const sessionA = await createAgentSessionRecord({
      title: `parallel-a-${randomUUID().slice(0, 8)}`,
    });
    const sessionB = await createAgentSessionRecord({
      title: `parallel-b-${randomUUID().slice(0, 8)}`,
    });

    const originalRunTurn = RuntimeRouter.prototype.runTurn;
    RuntimeRouter.prototype.runTurn = async function runTurnMock(input) {
      const emit = async (event: AgentRuntimeEvent) => {
        await input.onEvent(event);
      };

      try {
        if (input.beforeRun) {
          await input.beforeRun();
        }
        await emit({
          type: 'turn.started',
          sessionId: input.sessionId,
          turnId: input.turnId,
          timestamp: new Date().toISOString(),
          payload: {
            engine: 'coding-agent',
            providerId: null,
            model: null,
            activeTools: [],
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        await emit({
          type: 'assistant.completed',
          sessionId: input.sessionId,
          turnId: input.turnId,
          timestamp: new Date().toISOString(),
          payload: {
            text: `mock:${input.text}`,
            stopReason: 'stop',
            errorMessage: null,
            usage: null,
          },
        });
        await emit({
          type: 'turn.completed',
          sessionId: input.sessionId,
          turnId: input.turnId,
          timestamp: new Date().toISOString(),
          payload: {
            engine: 'coding-agent',
          },
        });
      } finally {
        this.releaseTurnGate(input.sessionId);
      }
    };

    try {
      const [resA, resB] = await Promise.all([
        postTurn(sessionA.id, 'parallel-turn-a'),
        postTurn(sessionB.id, 'parallel-turn-b'),
      ]);

      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);

      const [rawA, rawB] = await Promise.all([resA.text(), resB.text()]);
      const eventTypesA = parseSseEventTypes(rawA);
      const eventTypesB = parseSseEventTypes(rawB);

      assert.ok(eventTypesA.includes('turn.started'));
      assert.ok(eventTypesA.includes('turn.completed'));
      assert.ok(eventTypesB.includes('turn.started'));
      assert.ok(eventTypesB.includes('turn.completed'));
    } finally {
      RuntimeRouter.prototype.runTurn = originalRunTurn;
      await deleteAgentSessionRecord(sessionA.id);
      await deleteAgentSessionRecord(sessionB.id);
    }
  },
);

test(
  'turn endpoint still rejects concurrent turns in the same session',
  { concurrency: false },
  async () => {
    await ensureDb();
    const session = await createAgentSessionRecord({
      title: `single-session-lock-${randomUUID().slice(0, 8)}`,
    });

    const originalRunTurn = RuntimeRouter.prototype.runTurn;
    RuntimeRouter.prototype.runTurn = async function runTurnMock(input) {
      try {
        if (input.beforeRun) {
          await input.beforeRun();
        }
        await input.onEvent({
          type: 'turn.started',
          sessionId: input.sessionId,
          turnId: input.turnId,
          timestamp: new Date().toISOString(),
          payload: {
            engine: 'coding-agent',
            providerId: null,
            model: null,
            activeTools: [],
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 160));
      } finally {
        this.releaseTurnGate(input.sessionId);
      }
    };

    try {
      const first = await postTurn(session.id, 'same-session-first');
      assert.equal(first.status, 200);

      const second = await postTurn(session.id, 'same-session-second');
      assert.equal(second.status, 409);

      const errorPayload = toRecord(await second.json());
      assert.equal(errorPayload.code, 'SESSION_RUNNING');

      await first.text();
    } finally {
      RuntimeRouter.prototype.runTurn = originalRunTurn;
      await deleteAgentSessionRecord(session.id);
    }
  },
);
