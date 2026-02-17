import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { initDatabase } from '../db';
import { appendAgentEvent } from '../services/agent-event-store';
import {
  appendAgentEntry,
  appendAgentOutput,
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

test('agent replay endpoints support turnId filter', async () => {
  await ensureDb();
  const session = await createAgentSessionRecord({
    title: `route-turn-filter-${randomUUID().slice(0, 8)}`,
  });

  const turnA = `turn_${randomUUID()}`;
  const turnB = `turn_${randomUUID()}`;

  try {
    await appendAgentEntry({
      sessionId: session.id,
      turnId: turnA,
      entryType: 'user',
      payload: { text: 'turn A user' },
    });
    await appendAgentEntry({
      sessionId: session.id,
      turnId: turnB,
      entryType: 'assistant',
      payload: { text: 'turn B assistant' },
    });

    await appendAgentOutput({
      sessionId: session.id,
      turnId: turnA,
      kind: 'photo',
      refId: 'artifact_a',
      content: { artifactId: 'artifact_a' },
    });
    await appendAgentOutput({
      sessionId: session.id,
      turnId: turnB,
      kind: 'copy',
      refId: 'copy_b',
      content: { text: 'copy b' },
    });

    await appendAgentEvent({
      sessionId: session.id,
      turnId: turnA,
      eventType: 'turn.started',
      payload: { turnId: turnA },
    });
    await appendAgentEvent({
      sessionId: session.id,
      turnId: turnB,
      eventType: 'turn.started',
      payload: { turnId: turnB },
    });
    await appendAgentEvent({
      sessionId: session.id,
      turnId: turnA,
      eventType: 'turn.completed',
      payload: { turnId: turnA },
    });

    const entriesRes = await agentRoutes.request(
      `/sessions/${session.id}/entries?turnId=${encodeURIComponent(turnA)}`,
    );
    assert.equal(entriesRes.status, 200);
    const entriesJson = toRecord(await entriesRes.json());
    const entries = Array.isArray(entriesJson.data) ? entriesJson.data : [];
    assert.equal(entries.length, 1);
    assert.equal(toRecord(entries[0]).turnId, turnA);

    const eventsRes = await agentRoutes.request(
      `/sessions/${session.id}/events?turnId=${encodeURIComponent(turnA)}`,
    );
    assert.equal(eventsRes.status, 200);
    const eventsJson = toRecord(await eventsRes.json());
    const events = Array.isArray(eventsJson.data) ? eventsJson.data : [];
    assert.equal(events.length, 2);
    assert.equal(toRecord(events[0]).turnId, turnA);
    assert.equal(toRecord(events[1]).turnId, turnA);

    const outputsRes = await agentRoutes.request(
      `/sessions/${session.id}/outputs?turnId=${encodeURIComponent(turnA)}`,
    );
    assert.equal(outputsRes.status, 200);
    const outputsJson = toRecord(await outputsRes.json());
    const outputs = Array.isArray(outputsJson.data) ? outputsJson.data : [];
    assert.equal(outputs.length, 1);
    assert.equal(toRecord(outputs[0]).turnId, turnA);

    const detailRes = await agentRoutes.request(
      `/sessions/${session.id}?turnId=${encodeURIComponent(turnA)}`,
    );
    assert.equal(detailRes.status, 200);
    const detailJson = toRecord(await detailRes.json());
    const detailEntries = Array.isArray(detailJson.entries)
      ? detailJson.entries
      : [];
    const detailOutputs = Array.isArray(detailJson.outputs)
      ? detailJson.outputs
      : [];
    assert.equal(detailEntries.length, 1);
    assert.equal(detailOutputs.length, 1);
    assert.equal(toRecord(detailEntries[0]).turnId, turnA);
    assert.equal(toRecord(detailOutputs[0]).turnId, turnA);
  } finally {
    await deleteAgentSessionRecord(session.id);
  }
});
