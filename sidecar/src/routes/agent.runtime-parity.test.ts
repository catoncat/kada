import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AgentRuntimeQueueMessageInput } from '../agent/runtime/agent-runtime';
import { RuntimeRouter } from '../agent/runtime/runtime-router';
import { initDatabase } from '../db';
import {
  createAgentSessionRecord,
  deleteAgentSessionRecord,
  updateAgentSessionRecord,
  type AgentEngine,
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

async function postJson(
  path: string,
  body?: unknown,
): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const res = await agentRoutes.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    json: toRecord(await res.json()),
  };
}

async function createSession(engine: AgentEngine): Promise<{
  id: string;
  engine: AgentEngine;
}> {
  const session = await createAgentSessionRecord({
    title: `runtime-parity-${engine}-${randomUUID().slice(0, 8)}`,
    engine,
  });
  return {
    id: session.id,
    engine,
  };
}

test(
  'action endpoints return same SESSION_NOT_RUNNING error for both engines',
  { concurrency: false },
  async () => {
    await ensureDb();
    const coding = await createSession('coding-agent');
    const core = await createSession('agent-core');

    const scenarios = [
      {
        action: 'steer',
        body: { text: 'hello', clientMessageId: `cm_${randomUUID()}` },
        path: (id: string) => `/sessions/${id}/steer`,
      },
      {
        action: 'follow-up',
        body: { text: 'hello', clientMessageId: `cm_${randomUUID()}` },
        path: (id: string) => `/sessions/${id}/follow-up`,
      },
      {
        action: 'follow-up.promote',
        body: { clientMessageId: `cm_${randomUUID()}` },
        path: (id: string) => `/sessions/${id}/follow-up/promote`,
      },
      {
        action: 'abort',
        body: {},
        path: (id: string) => `/sessions/${id}/abort`,
      },
    ] as const;

    try {
      for (const scenario of scenarios) {
        const codingRes = await postJson(
          scenario.path(coding.id),
          scenario.body,
        );
        const coreRes = await postJson(scenario.path(core.id), scenario.body);

        assert.equal(
          codingRes.status,
          409,
          `${scenario.action} coding-agent status`,
        );
        assert.equal(
          coreRes.status,
          409,
          `${scenario.action} agent-core status`,
        );
        assert.equal(codingRes.json.code, 'SESSION_NOT_RUNNING');
        assert.equal(coreRes.json.code, 'SESSION_NOT_RUNNING');
      }
    } finally {
      await deleteAgentSessionRecord(coding.id);
      await deleteAgentSessionRecord(core.id);
    }
  },
);

test(
  'turn invalid payload returns same INVALID_PAYLOAD error for both engines',
  { concurrency: false },
  async () => {
    await ensureDb();
    const coding = await createSession('coding-agent');
    const core = await createSession('agent-core');

    try {
      const codingRes = await postJson(`/sessions/${coding.id}/turn`, {
        clientMessageId: `cm_${randomUUID()}`,
        text: '   ',
      });
      const coreRes = await postJson(`/sessions/${core.id}/turn`, {
        clientMessageId: `cm_${randomUUID()}`,
        text: '   ',
      });

      assert.equal(codingRes.status, 400);
      assert.equal(coreRes.status, 400);
      assert.equal(codingRes.json.code, 'INVALID_PAYLOAD');
      assert.equal(coreRes.json.code, 'INVALID_PAYLOAD');
    } finally {
      await deleteAgentSessionRecord(coding.id);
      await deleteAgentSessionRecord(core.id);
    }
  },
);

test(
  'archived session rejection is consistent for both engines',
  { concurrency: false },
  async () => {
    await ensureDb();
    const coding = await createSession('coding-agent');
    const core = await createSession('agent-core');

    try {
      await updateAgentSessionRecord(coding.id, { archived: true });
      await updateAgentSessionRecord(core.id, { archived: true });

      const codingRes = await postJson(`/sessions/${coding.id}/follow-up`, {
        text: 'hello',
        clientMessageId: `cm_${randomUUID()}`,
      });
      const coreRes = await postJson(`/sessions/${core.id}/follow-up`, {
        text: 'hello',
        clientMessageId: `cm_${randomUUID()}`,
      });

      assert.equal(codingRes.status, 409);
      assert.equal(coreRes.status, 409);
      assert.equal(codingRes.json.code, 'SESSION_ARCHIVED');
      assert.equal(coreRes.json.code, 'SESSION_ARCHIVED');
    } finally {
      await deleteAgentSessionRecord(coding.id);
      await deleteAgentSessionRecord(core.id);
    }
  },
);

test(
  'missing session rejection is consistent for both engines',
  { concurrency: false },
  async () => {
    await ensureDb();
    const coding = await createSession('coding-agent');
    const core = await createSession('agent-core');

    try {
      await deleteAgentSessionRecord(coding.id);
      await deleteAgentSessionRecord(core.id);

      const codingRes = await postJson(`/sessions/${coding.id}/follow-up`, {
        text: 'hello',
        clientMessageId: `cm_${randomUUID()}`,
      });
      const coreRes = await postJson(`/sessions/${core.id}/follow-up`, {
        text: 'hello',
        clientMessageId: `cm_${randomUUID()}`,
      });

      assert.equal(codingRes.status, 404);
      assert.equal(coreRes.status, 404);
      assert.equal(codingRes.json.code, 'SESSION_NOT_FOUND');
      assert.equal(coreRes.json.code, 'SESSION_NOT_FOUND');
    } finally {
      await deleteAgentSessionRecord(coding.id);
      await deleteAgentSessionRecord(core.id);
    }
  },
);

test(
  'internal failure rejection is consistent for both engines',
  { concurrency: false },
  async () => {
    await ensureDb();
    const coding = await createSession('coding-agent');
    const core = await createSession('agent-core');

    const originalIsRunning = RuntimeRouter.prototype.isRunning;
    const originalSteer = RuntimeRouter.prototype.steer;
    RuntimeRouter.prototype.isRunning = async function isRunningMock(
      _sessionId: string,
    ): Promise<boolean> {
      return true;
    };
    RuntimeRouter.prototype.steer = async function steerMock(
      _sessionId: string,
      _input: AgentRuntimeQueueMessageInput,
    ): Promise<void> {
      throw new Error('forced_internal_failure');
    };

    try {
      const codingRes = await postJson(`/sessions/${coding.id}/steer`, {
        text: 'hello',
        clientMessageId: `cm_${randomUUID()}`,
      });
      const coreRes = await postJson(`/sessions/${core.id}/steer`, {
        text: 'hello',
        clientMessageId: `cm_${randomUUID()}`,
      });

      assert.equal(codingRes.status, 500);
      assert.equal(coreRes.status, 500);
      assert.equal(codingRes.json.code, 'INTERNAL_ERROR');
      assert.equal(coreRes.json.code, 'INTERNAL_ERROR');
    } finally {
      RuntimeRouter.prototype.isRunning = originalIsRunning;
      RuntimeRouter.prototype.steer = originalSteer;
      await deleteAgentSessionRecord(coding.id);
      await deleteAgentSessionRecord(core.id);
    }
  },
);
