import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb, getSqlite } from '../db';
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

export async function appendAgentEvent(input: {
  sessionId: string;
  turnId?: string | null;
  eventType: string;
  payload: unknown;
}): Promise<AgentEventRecord> {
  const db = getDb();
  const sqlite = getSqlite();
  const id = randomUUID();
  const payloadJson = JSON.stringify(input.payload ?? null);
  const createdAtUnix = Math.floor(Date.now() / 1000);

  // 使用单条 SQL 语句原子分配 seq，避免并发写入导致重复序号。
  sqlite
    .prepare(
      `
      INSERT INTO agent_events (id, session_id, turn_id, seq, event_type, payload_json, created_at)
      VALUES (
        ?,
        ?,
        ?,
        (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_events WHERE session_id = ?),
        ?,
        ?,
        ?
      )
      `,
    )
    .run(
      id,
      input.sessionId,
      input.turnId || null,
      input.sessionId,
      input.eventType,
      payloadJson,
      createdAtUnix,
    );

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
