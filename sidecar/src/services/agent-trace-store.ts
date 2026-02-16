import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { and, asc, eq, gt, sql, type SQL } from 'drizzle-orm';
import { getDb, getSqlite } from '../db';
import { agentTraceLogs } from '../db/schema';
import { getAgentTraceFlags, shouldSampleTrace, type AgentTraceLevel } from '../config/agent-trace-flags';
import { getAgentTraceContext } from './agent-trace-context';

export type AgentTraceChannel =
  | 'ui'
  | 'network'
  | 'sse'
  | 'render'
  | 'api'
  | 'runtime'
  | 'provider'
  | 'db';

export type AgentTraceLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AgentTraceLogInput {
  traceId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  turnId?: string | null;
  clientMessageId?: string | null;
  channel: AgentTraceChannel | string;
  event: string;
  level?: AgentTraceLogLevel;
  ok?: boolean;
  at?: number | Date | string;
  data?: unknown;
}

export interface AgentTraceLogRow {
  seq: number;
  id: string;
  traceId: string;
  requestId: string | null;
  sessionId: string | null;
  turnId: string | null;
  clientMessageId: string | null;
  channel: string;
  event: string;
  level: AgentTraceLogLevel;
  ok: boolean;
  data: unknown;
  createdAt: number;
  createdAtIso: string;
}

export interface AgentTraceQueryInput {
  traceId?: string;
  sessionId?: string;
  turnId?: string;
  requestId?: string;
  channel?: string;
  event?: string;
  cursor?: number;
  limit?: number;
}

export interface AgentTraceTimelineStage {
  stage: string;
  startAt: string;
  endAt: string;
  durationMs: number;
  events: number;
  firstSeq: number;
  lastSeq: number;
}

export interface AgentTraceTimeline {
  traceId: string;
  startAt: string;
  endAt: string;
  durationMs: number;
  totalEvents: number;
  stages: AgentTraceTimelineStage[];
  markers: Array<{
    seq: number;
    channel: string;
    event: string;
    level: string;
    message: string;
  }>;
  breakpoints: string[];
}

export interface AgentTraceWireResult {
  traceId: string;
  exists: boolean;
  path: string | null;
  sizeBytes: number;
  lineCount: number;
  redacted: boolean;
  tail: Array<Record<string, unknown>>;
}

const SENSITIVE_KEY_REGEXP = /(?:api[_-]?key|token|password|secret|authorization|cookie|set-cookie)/i;
const TEXT_KEY_REGEXP = /(?:text|prompt|content|message|delta|body)/i;
const STAGE_ORDER = ['ui', 'network', 'api', 'runtime', 'provider', 'sse', 'render', 'db'];

let lastCleanupAt = 0;

function isSqlCondition(value: SQL<unknown> | null): value is SQL<unknown> {
  return value !== null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toUnixSeconds(value: number | Date | string | undefined): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Math.floor(Date.now() / 1000);
    if (value > 10_000_000_000) {
      return Math.floor(value / 1000);
    }
    return Math.floor(value);
  }

  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }

  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return toUnixSeconds(asNumber);
    }

    const ts = Date.parse(value);
    if (Number.isFinite(ts)) {
      return Math.floor(ts / 1000);
    }
  }

  return Math.floor(Date.now() / 1000);
}

function toIsoFromSeconds(value: number): string {
  const d = new Date(value * 1000);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
}

function toSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isSensitiveKey(key: string | null, redactKeys: string[]): boolean {
  if (!key) return false;
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  if (redactKeys.includes(normalized)) return true;
  return SENSITIVE_KEY_REGEXP.test(normalized);
}

function redactText(value: string, level: AgentTraceLevel): unknown {
  const textLen = value.length;
  const digest = toSha256(value);

  if (level === 'basic') {
    return {
      textLen,
      sha256: digest,
    };
  }

  const preview = value.slice(0, 512);
  return {
    textLen,
    sha256: digest,
    preview,
  };
}

function sanitizeForStorage(
  value: unknown,
  options: {
    level: AgentTraceLevel;
    redactKeys: string[];
    parentKey: string | null;
    depth: number;
  },
): unknown {
  if (value === null || value === undefined) return null;

  if (options.depth > 8) {
    return '[MaxDepth]';
  }

  if (typeof value === 'string') {
    const shouldRedactByText =
      isSensitiveKey(options.parentKey, options.redactKeys) ||
      (options.level === 'basic' && (TEXT_KEY_REGEXP.test(options.parentKey || '') || value.length > 128));

    if (shouldRedactByText) {
      return redactText(value, options.level);
    }

    if (options.level !== 'basic' && value.length > 1024) {
      return `${value.slice(0, 1024)}…`;
    }

    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((item) =>
      sanitizeForStorage(item, {
        ...options,
        depth: options.depth + 1,
      }),
    );

    if (value.length > items.length) {
      items.push(`[+${value.length - items.length} items]`);
    }

    return items;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const entries = Object.entries(source);
    const next: Record<string, unknown> = {};

    for (const [index, [key, item]] of entries.entries()) {
      if (index >= 80) {
        next.__truncated_keys__ = entries.length - index;
        break;
      }

      if (isSensitiveKey(key, options.redactKeys)) {
        next[key] = '[REDACTED]';
        continue;
      }

      next[key] = sanitizeForStorage(item, {
        ...options,
        parentKey: key,
        depth: options.depth + 1,
      });
    }

    return next;
  }

  return String(value);
}

function compactJson(jsonValue: unknown, maxBytes: number): string {
  const serialized = JSON.stringify(jsonValue ?? null);
  const byteLen = Buffer.byteLength(serialized, 'utf8');

  if (byteLen <= maxBytes) {
    return serialized;
  }

  const safePreviewLen = Math.max(32, maxBytes - 220);
  const compact = {
    truncated: true,
    originalBytes: byteLen,
    preview: serialized.slice(0, safePreviewLen),
  };

  return JSON.stringify(compact);
}

function parseDataJson(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function resolveTraceDataDir(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'trace-wire');
}

function resolveWireFile(traceId: string, date = new Date()): string {
  const yyyyMmDd = date.toISOString().slice(0, 10);
  const dir = path.join(resolveTraceDataDir(), yyyyMmDd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${traceId}.ndjson`);
}

function findExistingWireFile(traceId: string): string | null {
  const baseDir = resolveTraceDataDir();
  if (!existsSync(baseDir)) return null;

  const dayDirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const day of dayDirs) {
    const candidate = path.join(baseDir, day, `${traceId}.ndjson`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function pickMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const row = data as Record<string, unknown>;
  const message = row.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  const reason = row.reason;
  if (typeof reason === 'string' && reason.trim()) {
    return reason.trim();
  }

  return '';
}

function maybeCleanupRetention(): void {
  const flags = getAgentTraceFlags();
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) {
    return;
  }
  lastCleanupAt = now;

  const cutoffSec = Math.floor(now / 1000) - flags.retentionHours * 3600;
  const sqlite = getSqlite();
  sqlite
    .prepare('DELETE FROM agent_trace_logs WHERE created_at < ?')
    .run(cutoffSec);

  const wireRoot = resolveTraceDataDir();
  if (!existsSync(wireRoot)) return;

  const cutoffDate = new Date(cutoffSec * 1000).toISOString().slice(0, 10);
  const dayDirs = readdirSync(wireRoot, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  for (const dayDir of dayDirs) {
    if (dayDir.name >= cutoffDate) continue;
    const dirPath = path.join(wireRoot, dayDir.name);
    try {
      rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

function normalizeRow(row: Record<string, unknown>): AgentTraceLogRow {
  const createdAt = Number(row.created_at || 0);
  return {
    seq: Number(row.seq || 0),
    id: String(row.id || ''),
    traceId: String(row.trace_id || ''),
    requestId: row.request_id ? String(row.request_id) : null,
    sessionId: row.session_id ? String(row.session_id) : null,
    turnId: row.turn_id ? String(row.turn_id) : null,
    clientMessageId: row.client_message_id ? String(row.client_message_id) : null,
    channel: String(row.channel || ''),
    event: String(row.event || ''),
    level: (row.level as AgentTraceLogLevel) || 'info',
    ok: Number(row.ok || 0) === 1,
    data: parseDataJson(row.data_json),
    createdAt,
    createdAtIso: toIsoFromSeconds(createdAt),
  };
}

function parseUsageTotalTokens(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const value = row.totalTokens ?? row.total_tokens;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export async function appendTraceLog(
  input: AgentTraceLogInput,
): Promise<AgentTraceLogRow | null> {
  const flags = getAgentTraceFlags();
  if (!flags.enabled) {
    return null;
  }

  const context = getAgentTraceContext();
  const traceId =
    normalizeId(input.traceId) ||
    normalizeId(context?.traceId) ||
    randomUUID();

  if (!shouldSampleTrace(traceId)) {
    return null;
  }

  maybeCleanupRetention();

  const requestId = normalizeId(input.requestId) || normalizeId(context?.requestId);
  const sessionId = normalizeId(input.sessionId) || normalizeId(context?.sessionId);
  const turnId = normalizeId(input.turnId) || normalizeId(context?.turnId);
  const clientMessageId =
    normalizeId(input.clientMessageId) || normalizeId(context?.clientMessageId);

  const level: AgentTraceLogLevel =
    input.level === 'debug' ||
    input.level === 'warn' ||
    input.level === 'error'
      ? input.level
      : 'info';

  const id = randomUUID();
  const createdAt = toUnixSeconds(input.at);
  const ok = input.ok === false ? 0 : 1;

  const sanitized = sanitizeForStorage(input.data ?? null, {
    level: flags.level,
    redactKeys: flags.redactKeys.map((key) => key.toLowerCase()),
    parentKey: null,
    depth: 0,
  });
  const dataJson = compactJson(sanitized, flags.maxEventBytes);

  const sqlite = getSqlite();
  const result = sqlite
    .prepare(
      `
      INSERT INTO agent_trace_logs (
        id, trace_id, request_id, session_id, turn_id, client_message_id,
        channel, event, level, ok, data_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      id,
      traceId,
      requestId ?? null,
      sessionId ?? null,
      turnId ?? null,
      clientMessageId ?? null,
      String(input.channel || 'api'),
      String(input.event || 'trace.unknown'),
      level,
      ok,
      dataJson,
      createdAt,
    );

  return {
    seq: Number(result.lastInsertRowid || 0),
    id,
    traceId,
    requestId: requestId ?? null,
    sessionId: sessionId ?? null,
    turnId: turnId ?? null,
    clientMessageId: clientMessageId ?? null,
    channel: String(input.channel || 'api'),
    event: String(input.event || 'trace.unknown'),
    level,
    ok: ok === 1,
    data: parseDataJson(dataJson),
    createdAt,
    createdAtIso: toIsoFromSeconds(createdAt),
  };
}

export async function appendClientTraceBatch(input: {
  events: Array<{
    traceId?: string | null;
    sessionId?: string | null;
    turnId?: string | null;
    clientMessageId?: string | null;
    channel?: string;
    event?: string;
    level?: string;
    at?: number;
    data?: unknown;
  }>;
}): Promise<{ accepted: number; dropped: number }> {
  const events = Array.isArray(input.events) ? input.events : [];
  if (events.length === 0) {
    return { accepted: 0, dropped: 0 };
  }

  let accepted = 0;
  let dropped = 0;

  for (const event of events) {
    if (!event || typeof event !== 'object') {
      dropped += 1;
      continue;
    }

    const channel = typeof event.channel === 'string' ? event.channel : 'ui';
    const eventName = typeof event.event === 'string' ? event.event : 'client.unknown';
    if (!eventName.trim()) {
      dropped += 1;
      continue;
    }

    const level: AgentTraceLogLevel =
      event.level === 'debug' ||
      event.level === 'warn' ||
      event.level === 'error'
        ? event.level
        : 'info';

    const written = await appendTraceLog({
      traceId: event.traceId,
      sessionId: event.sessionId,
      turnId: event.turnId,
      clientMessageId: event.clientMessageId,
      channel,
      event: eventName,
      level,
      at: event.at,
      data: event.data,
    });

    if (written) {
      accepted += 1;
    } else {
      dropped += 1;
    }
  }

  return {
    accepted,
    dropped,
  };
}

export async function listTraceLogs(input: AgentTraceQueryInput): Promise<{
  data: AgentTraceLogRow[];
  cursor: number;
  total: number;
}> {
  const db = getDb();

  const limit = clamp(
    Math.floor(input.limit ?? 100),
    1,
    500,
  );

  const filterConditions = [
    input.traceId ? eq(agentTraceLogs.traceId, input.traceId) : null,
    input.sessionId ? eq(agentTraceLogs.sessionId, input.sessionId) : null,
    input.turnId ? eq(agentTraceLogs.turnId, input.turnId) : null,
    input.requestId ? eq(agentTraceLogs.requestId, input.requestId) : null,
    input.channel ? eq(agentTraceLogs.channel, input.channel) : null,
    input.event ? eq(agentTraceLogs.event, input.event) : null,
  ].filter(isSqlCondition);

  const cursorCondition =
    typeof input.cursor === 'number' && Number.isFinite(input.cursor)
      ? gt(agentTraceLogs.seq, Math.floor(input.cursor))
      : null;

  const where =
    filterConditions.length > 0 || cursorCondition
      ? and(
          ...(cursorCondition
            ? [...filterConditions, cursorCondition]
            : filterConditions),
        )
      : undefined;

  const totalWhere =
    filterConditions.length > 0
      ? and(...filterConditions)
      : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(agentTraceLogs)
      .where(where)
      .orderBy(asc(agentTraceLogs.seq))
      .limit(limit),
    db
      .select({ value: sql<number>`count(*)` })
      .from(agentTraceLogs)
      .where(totalWhere),
  ]);

  const normalized = rows.map((row) =>
    normalizeRow({
      seq: row.seq,
      id: row.id,
      trace_id: row.traceId,
      request_id: row.requestId,
      session_id: row.sessionId,
      turn_id: row.turnId,
      client_message_id: row.clientMessageId,
      channel: row.channel,
      event: row.event,
      level: row.level,
      ok: row.ok,
      data_json: row.dataJson,
      created_at: row.createdAt,
    }),
  );

  return {
    data: normalized,
    cursor:
      normalized.length > 0
        ? normalized[normalized.length - 1].seq
        : Math.floor(input.cursor ?? 0),
    total: Number(totalRows[0]?.value || 0),
  };
}

export async function getTraceTimeline(traceId: string): Promise<AgentTraceTimeline> {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      `
      SELECT seq, channel, event, level, ok, data_json, created_at
      FROM agent_trace_logs
      WHERE trace_id = ?
      ORDER BY seq ASC
      `,
    )
    .all(traceId) as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    const nowIso = new Date().toISOString();
    return {
      traceId,
      startAt: nowIso,
      endAt: nowIso,
      durationMs: 0,
      totalEvents: 0,
      stages: [],
      markers: [],
      breakpoints: ['未找到该 traceId 的日志记录。'],
    };
  }

  const firstSec = Number(rows[0].created_at || 0);
  const lastSec = Number(rows[rows.length - 1].created_at || firstSec);

  const stageMap = new Map<
    string,
    {
      firstSeq: number;
      lastSeq: number;
      startSec: number;
      endSec: number;
      events: number;
    }
  >();

  const markers: AgentTraceTimeline['markers'] = [];
  let hasUiSubmit = false;
  let hasApiRequestStart = false;
  let hasApiTurnAccepted = false;
  let hasRuntimeTurnStart = false;
  let hasProviderRequest = false;
  let hasRuntimeAssistantCompleted = false;
  let hasSseOpen = false;
  let hasRenderCommit = false;
  let hasEmptyStop = false;

  for (const row of rows) {
    const seq = Number(row.seq || 0);
    const channel = String(row.channel || 'unknown');
    const event = String(row.event || 'trace.unknown');
    const level = String(row.level || 'info');
    const ok = Number(row.ok || 0) === 1;
    const createdAt = Number(row.created_at || 0);
    const data = parseDataJson(row.data_json);

    const stage = STAGE_ORDER.includes(channel) ? channel : 'other';
    const prev = stageMap.get(stage);
    if (!prev) {
      stageMap.set(stage, {
        firstSeq: seq,
        lastSeq: seq,
        startSec: createdAt,
        endSec: createdAt,
        events: 1,
      });
    } else {
      prev.lastSeq = seq;
      prev.endSec = createdAt;
      prev.events += 1;
    }

    if (event === 'ui.submit_click') hasUiSubmit = true;
    if (event === 'api.request.start') hasApiRequestStart = true;
    if (event === 'api.turn.accepted') hasApiTurnAccepted = true;
    if (event === 'runtime.turn.start') hasRuntimeTurnStart = true;
    if (event === 'provider.request') hasProviderRequest = true;
    if (event === 'runtime.assistant.completed') {
      hasRuntimeAssistantCompleted = true;
      const payload = data as Record<string, unknown> | null;
      const textLen = Number(payload?.textLen ?? -1);
      const totalTokens = parseUsageTotalTokens(payload?.usage) ?? Number(payload?.totalTokens ?? -1);
      const stopReason = typeof payload?.stopReason === 'string' ? payload.stopReason : null;
      if (stopReason === 'stop' && textLen === 0 && totalTokens === 0) {
        hasEmptyStop = true;
      }
    }
    if (event === 'sse.open') hasSseOpen = true;
    if (event === 'render.assistant_message_commit') hasRenderCommit = true;
    if (event === 'runtime.assistant.empty_stop_detected') hasEmptyStop = true;

    if (level === 'error' || level === 'warn' || !ok || event.endsWith('.failed')) {
      markers.push({
        seq,
        channel,
        event,
        level,
        message: pickMessage(data) || event,
      });
    }
  }

  const stages: AgentTraceTimelineStage[] = [...stageMap.entries()]
    .map(([stage, value]) => ({
      stage,
      startAt: toIsoFromSeconds(value.startSec),
      endAt: toIsoFromSeconds(value.endSec),
      durationMs: Math.max(0, (value.endSec - value.startSec) * 1000),
      events: value.events,
      firstSeq: value.firstSeq,
      lastSeq: value.lastSeq,
    }))
    .sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a.stage);
      const bi = STAGE_ORDER.indexOf(b.stage);
      if (ai < 0 && bi < 0) return a.firstSeq - b.firstSeq;
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    });

  const breakpoints: string[] = [];
  if (hasUiSubmit && !hasApiRequestStart) {
    breakpoints.push('检测到 ui.submit_click，但未检测到 api.request.start：请求可能未到 Sidecar。');
  }
  if (hasApiRequestStart && !hasApiTurnAccepted) {
    breakpoints.push('Sidecar 收到请求但没有 api.turn.accepted：可能被校验拒绝或提前失败。');
  }
  if (hasApiTurnAccepted && !hasRuntimeTurnStart) {
    breakpoints.push('api.turn.accepted 后未进入 runtime.turn.start：可能在路由到 Runtime 前中断。');
  }
  if (hasRuntimeTurnStart && !hasProviderRequest) {
    breakpoints.push('runtime.turn.start 后未发起 provider.request：模型调用链路未触发。');
  }
  if (hasProviderRequest && !hasRuntimeAssistantCompleted) {
    breakpoints.push('已发起 provider.request 但无 runtime.assistant.completed：可能流中断或 provider 异常。');
  }
  if (hasRuntimeAssistantCompleted && !hasSseOpen) {
    breakpoints.push('Runtime 已完成但无 sse.open：前端可能未建立流连接。');
  }
  if (hasSseOpen && !hasRenderCommit && !hasEmptyStop) {
    breakpoints.push('SSE 已打开但未见 render.assistant_message_commit：前端渲染链路可能异常。');
  }
  if (hasEmptyStop) {
    breakpoints.push('检测到空回复结束：assistant.completed(stop, textLen=0, totalTokens=0)。');
  }

  return {
    traceId,
    startAt: toIsoFromSeconds(firstSec),
    endAt: toIsoFromSeconds(lastSec),
    durationMs: Math.max(0, (lastSec - firstSec) * 1000),
    totalEvents: rows.length,
    stages,
    markers,
    breakpoints,
  };
}

export async function appendTraceWire(input: {
  traceId: string;
  event: string;
  data: unknown;
  at?: number | Date | string;
}): Promise<boolean> {
  const flags = getAgentTraceFlags();
  if (!flags.enabled) return false;
  if (!(flags.wireEnabled || flags.level === 'wire')) return false;

  const traceId = normalizeId(input.traceId);
  if (!traceId) return false;

  const sanitized = sanitizeForStorage(input.data, {
    level: flags.level === 'basic' ? 'payload' : flags.level,
    redactKeys: flags.redactKeys.map((key) => key.toLowerCase()),
    parentKey: null,
    depth: 0,
  });

  const file = resolveWireFile(traceId);
  const currentSize = existsSync(file) ? statSync(file).size : 0;
  if (currentSize >= flags.wireMaxFileBytes) {
    return false;
  }

  const line = JSON.stringify({
    at: toUnixSeconds(input.at),
    event: input.event,
    data: sanitized,
  });

  const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
  if (currentSize + lineBytes > flags.wireMaxFileBytes) {
    return false;
  }

  appendFileSync(file, `${line}\n`, 'utf8');
  return true;
}

export async function getTraceWire(
  traceId: string,
  input?: { tailLines?: number },
): Promise<AgentTraceWireResult> {
  const file = findExistingWireFile(traceId);
  if (!file) {
    return {
      traceId,
      exists: false,
      path: null,
      sizeBytes: 0,
      lineCount: 0,
      redacted: true,
      tail: [],
    };
  }

  const stat = statSync(file);
  const content = readFileSync(file, 'utf8');
  const rows = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const tailLines = clamp(Math.floor(input?.tailLines ?? 80), 1, 500);
  const tailRaw = rows.slice(-tailLines);
  const tail = tailRaw
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return { raw: line };
      }
    })
    .map((entry) =>
      sanitizeForStorage(entry, {
        level: 'payload',
        redactKeys: getAgentTraceFlags().redactKeys.map((key) => key.toLowerCase()),
        parentKey: null,
        depth: 0,
      }) as Record<string, unknown>,
    );

  return {
    traceId,
    exists: true,
    path: file,
    sizeBytes: stat.size,
    lineCount: rows.length,
    redacted: true,
    tail,
  };
}
