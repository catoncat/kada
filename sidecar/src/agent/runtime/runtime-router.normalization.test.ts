import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRuntimeEvent } from './agent-runtime';
import { normalizeRuntimeEvent } from './runtime-router';

const FIXED_TIME = '2026-02-17T00:00:00.000Z';

function normalize(input: {
  type: AgentRuntimeEvent['type'];
  payload: unknown;
  engine?: 'coding-agent' | 'agent-core';
  sessionId?: string;
  turnId?: string | null;
  timestamp?: string;
}) {
  return normalizeRuntimeEvent({
    event: {
      type: input.type,
      payload: input.payload,
      sessionId: input.sessionId || 'runtime-session',
      turnId: input.turnId,
      timestamp: input.timestamp || FIXED_TIME,
    },
    engine: input.engine || 'coding-agent',
    sessionId: 'session-1',
    fallbackTurnId: 'turn-1',
    fallbackTimestamp: FIXED_TIME,
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

test('normalizeRuntimeEvent fills assistant.completed required fields', () => {
  const normalized = normalize({
    type: 'assistant.completed',
    engine: 'agent-core',
    payload: { text: 'done' },
    timestamp: 'not-a-date',
  });

  const payload = toRecord(normalized.payload);
  assert.equal(normalized.sessionId, 'session-1');
  assert.equal(normalized.turnId, 'turn-1');
  assert.equal(normalized.timestamp, FIXED_TIME);
  assert.equal(payload.text, 'done');
  assert.equal(payload.stopReason, null);
  assert.equal(payload.errorMessage, null);
  assert.equal(payload.usage, null);
});

test('normalizeRuntimeEvent fills turn.started required fields', () => {
  const normalized = normalize({
    type: 'turn.started',
    engine: 'agent-core',
    payload: {
      providerId: 'p1',
    },
  });

  const payload = toRecord(normalized.payload);
  assert.equal(payload.engine, 'agent-core');
  assert.equal(payload.providerId, 'p1');
  assert.equal(payload.model, null);
  assert.deepEqual(payload.activeTools, []);
});

test('normalizeRuntimeEvent standardizes queue.updated fields', () => {
  const normalized = normalize({
    type: 'queue.updated',
    payload: {
      clientMessageId: 'cm_1',
      text: 'next',
    },
  });

  const payload = toRecord(normalized.payload);
  assert.equal(payload.queueAction, 'queued');
  assert.equal(payload.mode, 'follow-up');
  assert.equal(payload.clientMessageId, 'cm_1');
  assert.equal(payload.text, 'next');
  assert.deepEqual(payload.mentions, []);
  assert.deepEqual(payload.mentionDrops, []);
});

test('normalizeRuntimeEvent standardizes session.aborted and tool.result fields', () => {
  const aborted = normalize({
    type: 'session.aborted',
    payload: {},
  });
  const abortedPayload = toRecord(aborted.payload);
  assert.equal(abortedPayload.reason, 'manual');

  const toolResult = normalize({
    type: 'tool.result',
    payload: {
      result: { ok: false },
    },
  });
  const resultPayload = toRecord(toolResult.payload);
  assert.equal(resultPayload.toolCallId, null);
  assert.equal(resultPayload.toolName, null);
  assert.equal(resultPayload.isError, false);
});

