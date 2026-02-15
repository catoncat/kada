import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import {
  agentEntries,
  agentOutputs,
  agentSessions,
  type AgentEntry,
  type AgentOutput,
  type AgentSession,
} from '../db/schema';

export type AgentEngine = 'coding-agent' | 'agent-core';
export type AgentSessionStatus = 'idle' | 'running' | 'failed' | 'aborted';
export type AgentOutputKind = 'photo' | 'copy';

export interface AgentSessionSummary {
  id: string;
  title: string;
  engine: AgentEngine;
  status: AgentSessionStatus;
  providerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastTurnAt: string | null;
}

export interface AgentEntryRecord {
  id: string;
  sessionId: string;
  entryType: string;
  parentEntryId: string | null;
  payload: unknown;
  createdAt: string | null;
}

export interface AgentOutputRecord {
  id: string;
  sessionId: string;
  turnId: string | null;
  kind: AgentOutputKind;
  refId: string | null;
  content: unknown;
  createdAt: string | null;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function safeParseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeSession(row: AgentSession): AgentSessionSummary {
  const engine = row.engine === 'agent-core' ? 'agent-core' : 'coding-agent';
  const status: AgentSessionStatus =
    row.status === 'running' || row.status === 'failed' || row.status === 'aborted'
      ? row.status
      : 'idle';

  return {
    id: row.id,
    title: row.title,
    engine,
    status,
    providerId: row.providerId || null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lastTurnAt: toIso(row.lastTurnAt),
  };
}

function normalizeEntry(row: AgentEntry): AgentEntryRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    entryType: row.entryType,
    parentEntryId: row.parentEntryId,
    payload: safeParseJson(row.payloadJson),
    createdAt: toIso(row.createdAt),
  };
}

function normalizeOutput(row: AgentOutput): AgentOutputRecord {
  const kind: AgentOutputKind = row.kind === 'photo' ? 'photo' : 'copy';
  return {
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId || null,
    kind,
    refId: row.refId || null,
    content: safeParseJson(row.contentJson),
    createdAt: toIso(row.createdAt),
  };
}

export async function createAgentSessionRecord(input?: {
  title?: string;
  engine?: AgentEngine;
  providerId?: string;
}): Promise<AgentSessionSummary> {
  const db = getDb();
  const now = new Date();

  const id = randomUUID();
  const title =
    typeof input?.title === 'string' && input.title.trim()
      ? input.title.trim()
      : '新 Agent 会话';
  const engine: AgentEngine = input?.engine === 'agent-core' ? 'agent-core' : 'coding-agent';

  await db.insert(agentSessions).values({
    id,
    title,
    engine,
    status: 'idle',
    providerId: input?.providerId?.trim() || null,
    createdAt: now,
    updatedAt: now,
    lastTurnAt: null,
  });

  const session = await getAgentSessionRecord(id);
  if (!session) {
    throw new Error('创建 Agent 会话失败');
  }

  return session;
}

export async function listAgentSessionRecords(): Promise<AgentSessionSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentSessions)
    .orderBy(desc(agentSessions.updatedAt), desc(agentSessions.createdAt));

  return rows.map(normalizeSession);
}

export async function getAgentSessionRecord(
  sessionId: string,
): Promise<AgentSessionSummary | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionId))
    .limit(1);

  return row ? normalizeSession(row) : null;
}

export async function setAgentSessionStatus(
  sessionId: string,
  status: AgentSessionStatus,
): Promise<void> {
  const db = getDb();
  await db
    .update(agentSessions)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(agentSessions.id, sessionId));
}

export async function touchAgentSessionTurn(sessionId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(agentSessions)
    .set({
      lastTurnAt: now,
      updatedAt: now,
    })
    .where(eq(agentSessions.id, sessionId));
}

export async function appendAgentEntry(input: {
  sessionId: string;
  entryType: string;
  payload: unknown;
  parentEntryId?: string | null;
}): Promise<AgentEntryRecord> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date();

  await db.insert(agentEntries).values({
    id,
    sessionId: input.sessionId,
    entryType: input.entryType,
    parentEntryId: input.parentEntryId || null,
    payloadJson: JSON.stringify(input.payload ?? null),
    createdAt: now,
  });

  const [row] = await db
    .select()
    .from(agentEntries)
    .where(eq(agentEntries.id, id))
    .limit(1);

  if (!row) {
    throw new Error('写入 agent entry 失败');
  }

  return normalizeEntry(row);
}

export async function listAgentEntries(
  sessionId: string,
  limit = 200,
): Promise<AgentEntryRecord[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(agentEntries)
    .where(eq(agentEntries.sessionId, sessionId))
    .orderBy(desc(agentEntries.createdAt), desc(agentEntries.id))
    .limit(limit);

  return rows.reverse().map(normalizeEntry);
}

export async function appendAgentOutput(input: {
  sessionId: string;
  turnId?: string | null;
  kind: AgentOutputKind;
  refId?: string | null;
  content: unknown;
}): Promise<AgentOutputRecord> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date();

  await db.insert(agentOutputs).values({
    id,
    sessionId: input.sessionId,
    turnId: input.turnId || null,
    kind: input.kind,
    refId: input.refId || null,
    contentJson: JSON.stringify(input.content ?? null),
    createdAt: now,
  });

  const [row] = await db
    .select()
    .from(agentOutputs)
    .where(eq(agentOutputs.id, id))
    .limit(1);

  if (!row) {
    throw new Error('写入 agent output 失败');
  }

  return normalizeOutput(row);
}

export async function listAgentOutputs(input: {
  sessionId: string;
  kind?: AgentOutputKind;
}): Promise<AgentOutputRecord[]> {
  const db = getDb();

  const where = input.kind
    ? and(eq(agentOutputs.sessionId, input.sessionId), eq(agentOutputs.kind, input.kind))
    : eq(agentOutputs.sessionId, input.sessionId);

  const rows = await db
    .select()
    .from(agentOutputs)
    .where(where)
    .orderBy(desc(agentOutputs.createdAt), desc(agentOutputs.id));

  return rows.map(normalizeOutput);
}
