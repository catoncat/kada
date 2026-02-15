import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { agentEvents, type AgentEvent } from '../db/schema';

export interface AgentEventRecord {
  id: string;
  sessionId: string;
  turnId: string | null;
  seq: number;
  eventType: string;
  payload: unknown;
  createdAt: string | null;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function parsePayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalize(row: AgentEvent): AgentEventRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId || null,
    seq: row.seq,
    eventType: row.eventType,
    payload: parsePayload(row.payloadJson),
    createdAt: toIso(row.createdAt),
  };
}

async function getNextSeq(sessionId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      maxSeq: sql<number>`COALESCE(MAX(${agentEvents.seq}), 0)`,
    })
    .from(agentEvents)
    .where(eq(agentEvents.sessionId, sessionId));

  const current = rows[0]?.maxSeq ?? 0;
  return Number.isFinite(current) ? current + 1 : 1;
}

export async function appendAgentEvent(input: {
  sessionId: string;
  turnId?: string | null;
  eventType: string;
  payload: unknown;
}): Promise<AgentEventRecord> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date();
  const seq = await getNextSeq(input.sessionId);

  await db.insert(agentEvents).values({
    id,
    sessionId: input.sessionId,
    turnId: input.turnId || null,
    seq,
    eventType: input.eventType,
    payloadJson: JSON.stringify(input.payload ?? null),
    createdAt: now,
  });

  const [row] = await db
    .select()
    .from(agentEvents)
    .where(eq(agentEvents.id, id))
    .limit(1);

  if (!row) {
    throw new Error('写入 agent event 失败');
  }

  return normalize(row);
}

export async function listAgentEvents(input: {
  sessionId: string;
  cursor?: number;
  limit?: number;
}): Promise<AgentEventRecord[]> {
  const db = getDb();
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(500, Math.floor(input.limit)))
      : 200;

  const where =
    typeof input.cursor === 'number' && Number.isFinite(input.cursor)
      ? and(eq(agentEvents.sessionId, input.sessionId), gt(agentEvents.seq, Math.floor(input.cursor)))
      : eq(agentEvents.sessionId, input.sessionId);

  const rows = await db
    .select()
    .from(agentEvents)
    .where(where)
    .orderBy(asc(agentEvents.seq))
    .limit(limit);

  return rows.map(normalize);
}

export async function getLatestAgentEventCursor(sessionId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentEvents)
    .where(eq(agentEvents.sessionId, sessionId))
    .orderBy(desc(agentEvents.seq))
    .limit(1);

  return row?.seq ?? 0;
}
