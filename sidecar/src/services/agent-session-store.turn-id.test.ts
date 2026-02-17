import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { getDb, initDatabase } from '../db';
import { agentEntries } from '../db/schema';
import {
  appendAgentEntry,
  appendAgentOutput,
  createAgentSessionRecord,
  deleteAgentSessionRecord,
  listAgentEntries,
  listAgentOutputs,
} from './agent-session-store';

let dbReady = false;

async function ensureDb() {
  if (dbReady) return;
  await initDatabase();
  dbReady = true;
}

test('append/list entries persist and filter by turnId', async () => {
  await ensureDb();
  const session = await createAgentSessionRecord({
    title: `turn-id-entry-${randomUUID().slice(0, 8)}`,
  });

  const turnA = `turn_${randomUUID()}`;
  const turnB = `turn_${randomUUID()}`;

  try {
    const aEntry = await appendAgentEntry({
      sessionId: session.id,
      turnId: turnA,
      entryType: 'user',
      payload: {
        text: 'hello turn A',
      },
    });
    await appendAgentEntry({
      sessionId: session.id,
      turnId: turnB,
      entryType: 'assistant',
      payload: {
        text: 'hello turn B',
      },
    });
    await appendAgentEntry({
      sessionId: session.id,
      turnId: null,
      entryType: 'custom',
      payload: {
        text: 'session-level entry',
      },
    });

    const allEntries = await listAgentEntries({
      sessionId: session.id,
      limit: 50,
    });
    assert.equal(allEntries.length, 3);

    const turnAEntries = await listAgentEntries({
      sessionId: session.id,
      turnId: turnA,
      limit: 50,
    });
    assert.equal(turnAEntries.length, 1);
    assert.equal(turnAEntries[0]?.id, aEntry.id);
    assert.equal(turnAEntries[0]?.turnId, turnA);

    const db = getDb();
    const [row] = await db
      .select()
      .from(agentEntries)
      .where(eq(agentEntries.id, aEntry.id))
      .limit(1);
    assert.equal(row?.turnId || null, turnA);
  } finally {
    await deleteAgentSessionRecord(session.id);
  }
});

test('listAgentOutputs supports turnId filtering', async () => {
  await ensureDb();
  const session = await createAgentSessionRecord({
    title: `turn-id-output-${randomUUID().slice(0, 8)}`,
  });

  const turnA = `turn_${randomUUID()}`;
  const turnB = `turn_${randomUUID()}`;

  try {
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
      content: { text: 'copy B' },
    });

    const allOutputs = await listAgentOutputs({ sessionId: session.id });
    assert.equal(allOutputs.length, 2);

    const turnAOutputs = await listAgentOutputs({
      sessionId: session.id,
      turnId: turnA,
    });
    assert.equal(turnAOutputs.length, 1);
    assert.equal(turnAOutputs[0]?.turnId, turnA);
    assert.equal(turnAOutputs[0]?.kind, 'photo');

    const filtered = await listAgentOutputs({
      sessionId: session.id,
      kind: 'copy',
      turnId: turnA,
    });
    assert.equal(filtered.length, 0);
  } finally {
    await deleteAgentSessionRecord(session.id);
  }
});
