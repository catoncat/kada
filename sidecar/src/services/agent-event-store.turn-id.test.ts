import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { initDatabase } from '../db';
import {
  appendAgentEvent,
  listAgentEvents,
} from './agent-event-store';
import {
  createAgentSessionRecord,
  deleteAgentSessionRecord,
} from './agent-session-store';

let dbReady = false;

async function ensureDb() {
  if (dbReady) return;
  await initDatabase();
  dbReady = true;
}

test('listAgentEvents filters by turnId and keeps session-level cursor semantics', async () => {
  await ensureDb();
  const session = await createAgentSessionRecord({
    title: `turn-id-event-${randomUUID().slice(0, 8)}`,
  });

  const turnA = `turn_${randomUUID()}`;
  const turnB = `turn_${randomUUID()}`;

  try {
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
      eventType: 'assistant.completed',
      payload: { text: 'done' },
    });

    const allEvents = await listAgentEvents({
      sessionId: session.id,
      limit: 50,
    });
    assert.equal(allEvents.length, 3);
    assert.deepEqual(
      allEvents.map((item) => item.seq),
      [1, 2, 3],
    );

    const turnAEvents = await listAgentEvents({
      sessionId: session.id,
      turnId: turnA,
      limit: 50,
    });
    assert.equal(turnAEvents.length, 2);
    assert.equal(turnAEvents[0]?.turnId, turnA);
    assert.equal(turnAEvents[1]?.turnId, turnA);
    assert.deepEqual(
      turnAEvents.map((item) => item.seq),
      [1, 3],
    );

    const afterCursor = await listAgentEvents({
      sessionId: session.id,
      turnId: turnA,
      cursor: 1,
      limit: 50,
    });
    assert.equal(afterCursor.length, 1);
    assert.equal(afterCursor[0]?.seq, 3);
  } finally {
    await deleteAgentSessionRecord(session.id);
  }
});
