import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  sql,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { agentToolResultReadability } from '../db/schema';

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

export interface ToolResultReadabilityRecord {
  id: string;
  entryId: string;
  sessionId: string;
  turnId: string | null;
  toolCallId: string | null;
  sourceHash: string;
  sourceSize: number;
  ruleSummary: string;
  ruleDetail: string;
  enhancedSummary: string | null;
  enhancedDetail: string | null;
  enhancedConfidence: number | null;
  enhancedModel: string | null;
  enhancedReason: string | null;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  latencyMs: number | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function normalizeRow(
  row: typeof agentToolResultReadability.$inferSelect,
): ToolResultReadabilityRecord {
  return {
    id: row.id,
    entryId: row.entryId,
    sessionId: row.sessionId,
    turnId: row.turnId || null,
    toolCallId: row.toolCallId || null,
    sourceHash: row.sourceHash,
    sourceSize: row.sourceSize || 0,
    ruleSummary: row.ruleSummary,
    ruleDetail: row.ruleDetail,
    enhancedSummary: row.enhancedSummary || null,
    enhancedDetail: row.enhancedDetail || null,
    enhancedConfidence:
      typeof row.enhancedConfidence === 'number' ? row.enhancedConfidence : null,
    enhancedModel: row.enhancedModel || null,
    enhancedReason: row.enhancedReason || null,
    status:
      row.status === 'completed' || row.status === 'failed' || row.status === 'skipped'
        ? row.status
        : 'pending',
    latencyMs: typeof row.latencyMs === 'number' ? row.latencyMs : null,
    error: row.error || null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function appendToolResultReadability(input: {
  entryId: string;
  sessionId: string;
  turnId?: string | null;
  toolCallId?: string | null;
  sourceHash: string;
  sourceSize: number;
  ruleSummary: string;
  ruleDetail: string;
  status?: 'pending' | 'completed' | 'failed' | 'skipped';
}): Promise<ToolResultReadabilityRecord> {
  const db = getDb();
  const now = new Date();
  const id = randomUUID();

  await db.insert(agentToolResultReadability).values({
    id,
    entryId: input.entryId,
    sessionId: input.sessionId,
    turnId: input.turnId || null,
    toolCallId: input.toolCallId || null,
    sourceHash: input.sourceHash,
    sourceSize: Math.max(0, Math.floor(input.sourceSize || 0)),
    ruleSummary: input.ruleSummary,
    ruleDetail: input.ruleDetail,
    status: input.status || 'pending',
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db
    .select()
    .from(agentToolResultReadability)
    .where(eq(agentToolResultReadability.id, id))
    .limit(1);

  if (!row) {
    throw new Error('写入 toolresult readability 失败');
  }

  return normalizeRow(row);
}

export async function getToolResultReadabilityByEntryIds(
  entryIds: string[],
): Promise<Map<string, ToolResultReadabilityRecord>> {
  const db = getDb();
  const ids = Array.from(new Set(entryIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const rows = await db
    .select()
    .from(agentToolResultReadability)
    .where(inArray(agentToolResultReadability.entryId, ids));

  return new Map(rows.map((row) => [row.entryId, normalizeRow(row)]));
}

export async function getToolResultReadabilityByEntryId(
  entryId: string,
): Promise<ToolResultReadabilityRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentToolResultReadability)
    .where(eq(agentToolResultReadability.entryId, entryId))
    .limit(1);

  return row ? normalizeRow(row) : null;
}

export async function findLatestCompletedReadabilityBySourceHash(input: {
  sessionId: string;
  sourceHash: string;
  excludeEntryId?: string;
}): Promise<ToolResultReadabilityRecord | null> {
  const db = getDb();
  const conditions = [
    eq(agentToolResultReadability.sessionId, input.sessionId),
    eq(agentToolResultReadability.sourceHash, input.sourceHash),
    eq(agentToolResultReadability.status, 'completed'),
    isNotNull(agentToolResultReadability.enhancedSummary),
  ];
  if (input.excludeEntryId) {
    conditions.push(
      sql`${agentToolResultReadability.entryId} <> ${input.excludeEntryId}`,
    );
  }

  const [row] = await db
    .select()
    .from(agentToolResultReadability)
    .where(and(...conditions))
    .orderBy(desc(agentToolResultReadability.updatedAt), desc(agentToolResultReadability.createdAt))
    .limit(1);

  return row ? normalizeRow(row) : null;
}

export async function countRecentReadabilityBySession(input: {
  sessionId: string;
  since: Date;
}): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentToolResultReadability)
    .where(
      and(
        eq(agentToolResultReadability.sessionId, input.sessionId),
        gte(agentToolResultReadability.createdAt, input.since),
      ),
    );

  return Number(row?.count || 0);
}

export async function updateToolResultReadabilityStatus(input: {
  entryId: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  latencyMs?: number | null;
  error?: string | null;
  enhancedSummary?: string | null;
  enhancedDetail?: string | null;
  enhancedConfidence?: number | null;
  enhancedModel?: string | null;
  enhancedReason?: string | null;
}): Promise<ToolResultReadabilityRecord | null> {
  const db = getDb();

  const updates: Partial<typeof agentToolResultReadability.$inferInsert> = {
    status: input.status,
    updatedAt: new Date(),
  };

  if (typeof input.latencyMs === 'number') {
    updates.latencyMs = Math.max(0, Math.floor(input.latencyMs));
  }
  if (input.error !== undefined) {
    updates.error = input.error || null;
  }
  if (input.enhancedSummary !== undefined) {
    updates.enhancedSummary = input.enhancedSummary || null;
  }
  if (input.enhancedDetail !== undefined) {
    updates.enhancedDetail = input.enhancedDetail || null;
  }
  if (input.enhancedConfidence !== undefined) {
    updates.enhancedConfidence =
      typeof input.enhancedConfidence === 'number' ? input.enhancedConfidence : null;
  }
  if (input.enhancedModel !== undefined) {
    updates.enhancedModel = input.enhancedModel || null;
  }
  if (input.enhancedReason !== undefined) {
    updates.enhancedReason = input.enhancedReason || null;
  }

  await db
    .update(agentToolResultReadability)
    .set(updates)
    .where(eq(agentToolResultReadability.entryId, input.entryId));

  return getToolResultReadabilityByEntryId(input.entryId);
}
