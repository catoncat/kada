import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  type AgentEntry,
  type AgentOutput,
  type AgentSession,
  agentEntries,
  agentEvents,
  agentOutputs,
  agentSessions,
} from '../db/schema';
import {
  type ToolResultReadabilityRecord,
  getToolResultReadabilityByEntryIds,
} from './agent-toolresult-readability-store';

export type AgentEngine = 'coding-agent' | 'agent-core';
export type AgentSessionStatus = 'idle' | 'running' | 'failed' | 'aborted';
export type AgentOutputKind = 'photo' | 'copy';

export interface AgentSessionSummary {
  id: string;
  title: string;
  engine: AgentEngine;
  status: AgentSessionStatus;
  archivedAt: string | null;
  providerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastTurnAt: string | null;
}

export interface AgentEntryRecord {
  id: string;
  sessionId: string;
  turnId: string | null;
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
    row.status === 'running' ||
    row.status === 'failed' ||
    row.status === 'aborted'
      ? row.status
      : 'idle';

  return {
    id: row.id,
    title: row.title,
    engine,
    status,
    archivedAt: toIso(row.archivedAt),
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
    turnId: row.turnId || null,
    entryType: row.entryType,
    parentEntryId: row.parentEntryId,
    payload: safeParseJson(row.payloadJson),
    createdAt: toIso(row.createdAt),
  };
}

function mergeToolResultReadabilityPayload(
  payload: unknown,
  readability: ToolResultReadabilityRecord,
): unknown {
  const base =
    payload && typeof payload === 'object'
      ? { ...(payload as Record<string, unknown>) }
      : {};

  base.summary =
    (base.summary as string | undefined) || readability.ruleSummary;
  base.readableDetail =
    (base.readableDetail as string | undefined) || readability.ruleDetail;
  base.readableVersion =
    (base.readableVersion as number | undefined) || 2;

  if (readability.enhancedSummary) {
    base.enhancedSummary = readability.enhancedSummary;
  }
  if (readability.enhancedDetail) {
    base.enhancedDetail = readability.enhancedDetail;
  }
  if (typeof readability.enhancedConfidence === 'number') {
    base.enhancedConfidence = readability.enhancedConfidence;
  }
  if (readability.updatedAt) {
    base.enhancedAt = readability.updatedAt;
  }
  if (readability.enhancedModel) {
    base.enhancedModel = readability.enhancedModel;
  }
  if (readability.enhancedReason) {
    base.enhancedReason = readability.enhancedReason;
  }

  if (readability.status && readability.status !== 'pending') {
    base.enhancementStatus = readability.status;
  }
  if (typeof readability.latencyMs === 'number') {
    base.enhancementLatencyMs = readability.latencyMs;
  }
  if (readability.error) {
    base.enhancementError = readability.error;
  }
  base.enhancedVersion = 1;

  return base;
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
  const engine: AgentEngine =
    input?.engine === 'agent-core' ? 'agent-core' : 'coding-agent';

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

export async function listAgentSessionRecords(): Promise<
  AgentSessionSummary[]
> {
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

export async function updateAgentSessionRecord(
  sessionId: string,
  input: {
    title?: string;
    archived?: boolean;
  },
): Promise<AgentSessionSummary | null> {
  const db = getDb();
  const updates: {
    title?: string;
    archivedAt?: Date | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (typeof input.title === 'string') {
    updates.title = input.title.trim();
  }

  if (typeof input.archived === 'boolean') {
    updates.archivedAt = input.archived ? new Date() : null;
  }

  await db
    .update(agentSessions)
    .set(updates)
    .where(eq(agentSessions.id, sessionId));

  return getAgentSessionRecord(sessionId);
}

export async function deleteAgentSessionRecord(
  sessionId: string,
): Promise<void> {
  const db = getDb();

  db.transaction((tx) => {
    tx.delete(agentEvents).where(eq(agentEvents.sessionId, sessionId)).run();
    tx.delete(agentEntries).where(eq(agentEntries.sessionId, sessionId)).run();
    tx.delete(agentOutputs).where(eq(agentOutputs.sessionId, sessionId)).run();
    tx.delete(agentSessions).where(eq(agentSessions.id, sessionId)).run();
  });
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
  turnId?: string | null;
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
    turnId: input.turnId || null,
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

export async function listAgentEntries(input: {
  sessionId: string;
  turnId?: string | null;
  limit?: number;
}): Promise<AgentEntryRecord[]> {
  const db = getDb();
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(500, Math.floor(input.limit)))
      : 200;

  const where = input.turnId
    ? and(
        eq(agentEntries.sessionId, input.sessionId),
        eq(agentEntries.turnId, input.turnId),
      )
    : eq(agentEntries.sessionId, input.sessionId);

  const rows = await db
    .select()
    .from(agentEntries)
    .where(where)
    .orderBy(desc(agentEntries.createdAt), desc(agentEntries.id))
    .limit(limit);

  const entries = rows.reverse().map(normalizeEntry);
  const targetEntryIds = entries
    .filter((entry) => entry.entryType === 'toolResult')
    .map((entry) => entry.id);

  if (targetEntryIds.length === 0) {
    return entries;
  }

  const readabilityMap = await getToolResultReadabilityByEntryIds(targetEntryIds);
  if (readabilityMap.size === 0) {
    return entries;
  }

  return entries.map((entry) => {
    if (entry.entryType !== 'toolResult') {
      return entry;
    }
    const readability = readabilityMap.get(entry.id);
    if (!readability) {
      return entry;
    }
    return {
      ...entry,
      payload: mergeToolResultReadabilityPayload(entry.payload, readability),
    };
  });
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
  turnId?: string | null;
}): Promise<AgentOutputRecord[]> {
  const db = getDb();

  const where = and(
    eq(agentOutputs.sessionId, input.sessionId),
    input.kind ? eq(agentOutputs.kind, input.kind) : undefined,
    input.turnId ? eq(agentOutputs.turnId, input.turnId) : undefined,
  );

  const rows = await db
    .select()
    .from(agentOutputs)
    .where(where)
    .orderBy(desc(agentOutputs.createdAt), desc(agentOutputs.id));

  return rows.map(normalizeOutput);
}
