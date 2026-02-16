import Database from 'better-sqlite3';
import path from 'node:path';
import { existsSync } from 'node:fs';

type Row = Record<string, unknown>;

interface CliArgs {
  traceId?: string;
  sessionId?: string;
  limit: number;
}

const CHANNEL_ORDER = ['ui', 'network', 'api', 'runtime', 'provider', 'sse', 'render', 'db'];

function toIso(value: unknown): string {
  if (typeof value !== 'number') return '-';
  const ms = value > 10_000_000_000 ? value : value * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringify(value: unknown, maxLen = 220): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (!raw) return '';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: 1000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--trace') {
      args.traceId = argv[i + 1]?.trim();
      i += 1;
      continue;
    }
    if (arg === '--session') {
      args.sessionId = argv[i + 1]?.trim();
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const parsed = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(parsed)) {
        args.limit = Math.max(50, Math.min(5000, parsed));
      }
      i += 1;
      continue;
    }

    if (!arg.startsWith('-') && !args.traceId && !args.sessionId) {
      args.sessionId = arg.trim();
    }
  }

  return args;
}

function resolveDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const file = path.join(dataDir, 'shooting-planner.db');
  if (!existsSync(file)) {
    throw new Error(`数据库不存在: ${file}`);
  }
  return file;
}

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function summarizeEvent(row: Row): string {
  const event = String(row.event || row.event_type || 'unknown');
  const data = parseJson(row.data_json ?? row.payload_json) as
    | Record<string, unknown>
    | null;

  if (event === 'runtime.assistant.completed') {
    return stringify(
      {
        stopReason: data?.stopReason,
        textLen: data?.textLen,
        totalTokens: data?.totalTokens,
      },
      120,
    );
  }

  if (event === 'provider.response_headers' || event === 'provider.response_done') {
    return stringify(
      {
        status: data?.status,
        durationMs: data?.durationMs,
      },
      120,
    );
  }

  if (event === 'network.turn_http_error') {
    return stringify(
      {
        status: data?.status,
        requestId: data?.requestId,
      },
      120,
    );
  }

  if (event === 'runtime.assistant.empty_stop_detected') {
    return stringify(
      {
        stopReason: data?.stopReason,
        textLen: data?.textLen,
        totalTokens: data?.totalTokens,
      },
      120,
    );
  }

  return stringify(data, 140);
}

function extractTotalTokens(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const totalTokens = row.totalTokens ?? row.total_tokens;
  if (typeof totalTokens === 'number' && Number.isFinite(totalTokens)) {
    return totalTokens;
  }
  return null;
}

function diagnoseTraceRows(rows: Row[]): string[] {
  const has = (event: string): boolean => rows.some((row) => String(row.event) === event);

  const diagnostics: string[] = [];
  const hasUiSubmit = has('ui.submit_click');
  const hasApiStart = has('api.request.start');
  const hasApiAccepted = has('api.turn.accepted');
  const hasRuntimeStart = has('runtime.turn.start');
  const hasProviderRequest = has('provider.request');
  const hasRuntimeAssistantCompleted = has('runtime.assistant.completed');
  const hasSseOpen = has('sse.open');
  const hasRenderCommit = has('render.assistant_message_commit');

  if (hasUiSubmit && !hasApiStart) {
    diagnostics.push('前端已点击发送（ui.submit_click），但没有 api.request.start：请求可能未到 Sidecar。');
  }
  if (hasApiStart && !hasApiAccepted) {
    diagnostics.push('Sidecar 收到请求但没有 api.turn.accepted：多半被路由校验拒绝。');
  }
  if (hasApiAccepted && !hasRuntimeStart) {
    diagnostics.push('api.turn.accepted 后没有 runtime.turn.start：Runtime 启动前发生中断。');
  }
  if (hasRuntimeStart && !hasProviderRequest) {
    diagnostics.push('runtime.turn.start 后没有 provider.request：模型调用未发出。');
  }
  if (hasProviderRequest && !hasRuntimeAssistantCompleted) {
    diagnostics.push('provider.request 已发出，但没有 runtime.assistant.completed：流可能中断或 provider 异常。');
  }
  if (hasRuntimeAssistantCompleted && !hasSseOpen) {
    diagnostics.push('Runtime 已完成，但没有 sse.open：前端可能未建立 SSE。');
  }
  if (hasSseOpen && !hasRenderCommit) {
    diagnostics.push('SSE 已打开，但没有 render.assistant_message_commit：可能是渲染层未提交。');
  }

  for (const row of rows) {
    if (String(row.event) !== 'runtime.assistant.completed') continue;
    const data = parseJson(row.data_json) as Record<string, unknown> | null;
    const stopReason = typeof data?.stopReason === 'string' ? data.stopReason : null;
    const textLen = Number(data?.textLen ?? -1);
    const totalTokens = extractTotalTokens(data?.usage) ?? Number(data?.totalTokens ?? -1);

    if (stopReason === 'stop' && textLen === 0 && totalTokens === 0) {
      diagnostics.push('检测到空响应结束：assistant.completed(stop, textLen=0, totalTokens=0)。');
      break;
    }
  }

  return diagnostics;
}

function printTraceTimeline(rows: Row[]): void {
  const stageStats = new Map<string, { firstAt: number; lastAt: number; count: number }>();

  for (const row of rows) {
    const channel = String(row.channel || 'unknown');
    const createdAt = Number(row.created_at || 0);
    const prev = stageStats.get(channel);
    if (!prev) {
      stageStats.set(channel, {
        firstAt: createdAt,
        lastAt: createdAt,
        count: 1,
      });
      continue;
    }

    prev.lastAt = createdAt;
    prev.count += 1;
  }

  printSection('Timeline 阶段聚合');
  const ordered = [...stageStats.entries()].sort((a, b) => {
    const ai = CHANNEL_ORDER.indexOf(a[0]);
    const bi = CHANNEL_ORDER.indexOf(b[0]);
    if (ai < 0 && bi < 0) return a[1].firstAt - b[1].firstAt;
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });

  for (const [channel, stat] of ordered) {
    const durationMs = Math.max(0, (stat.lastAt - stat.firstAt) * 1000);
    console.log(
      `${channel.padEnd(8)} start=${toIso(stat.firstAt)} end=${toIso(stat.lastAt)} duration=${durationMs}ms events=${stat.count}`,
    );
  }
}

function printTraceRows(rows: Row[]): void {
  printSection('Trace 事件时序');
  for (const row of rows) {
    const seq = String(row.seq || '-').padStart(5, ' ');
    const at = toIso(row.created_at);
    const channel = String(row.channel || 'unknown').padEnd(8, ' ');
    const event = String(row.event || 'unknown').padEnd(36, ' ');
    const level = String(row.level || 'info').padEnd(5, ' ');
    const ok = Number(row.ok || 0) === 1 ? 'ok ' : 'bad';
    const detail = summarizeEvent(row);
    console.log(`#${seq} [${at}] ${channel} ${event} ${level} ${ok} ${detail}`);
  }
}

function printDiagnostics(rows: Row[]): void {
  const diagnostics = diagnoseTraceRows(rows);
  printSection('断点诊断');
  if (diagnostics.length === 0) {
    console.log('未发现明显断点。');
    return;
  }

  for (const message of diagnostics) {
    console.log(`- ${message}`);
  }
}

function printSessionTraceHints(db: Database.Database, sessionId: string): void {
  const traces = db
    .prepare(
      `
      SELECT trace_id AS traceId, COUNT(*) AS events, MIN(created_at) AS firstAt, MAX(created_at) AS lastAt
      FROM agent_trace_logs
      WHERE session_id = ?
      GROUP BY trace_id
      ORDER BY lastAt DESC
      LIMIT 20
      `,
    )
    .all(sessionId) as Row[];

  printSection('Session 关联 Trace');
  if (traces.length === 0) {
    console.log('当前 session 未找到 trace 记录。');
    return;
  }

  for (const row of traces) {
    console.log(
      `${String(row.traceId)} events=${String(row.events)} first=${toIso(row.firstAt)} last=${toIso(row.lastAt)}`,
    );
  }
}

function traceMode(db: Database.Database, traceId: string, limit: number): void {
  const rows = db
    .prepare(
      `
      SELECT seq, trace_id, request_id, session_id, turn_id, client_message_id, channel, event, level, ok, data_json, created_at
      FROM agent_trace_logs
      WHERE trace_id = ?
      ORDER BY seq ASC
      LIMIT ?
      `,
    )
    .all(traceId, limit) as Row[];

  if (rows.length === 0) {
    console.error(`未找到 trace: ${traceId}`);
    process.exit(1);
  }

  const first = rows[0];
  const last = rows[rows.length - 1];

  printSection('Trace');
  console.log(`traceId    : ${traceId}`);
  console.log(`events     : ${rows.length}`);
  console.log(`sessionId  : ${String(first.session_id || '-')}`);
  console.log(`requestId  : ${String(first.request_id || '-')}`);
  console.log(`clientMsgId: ${String(first.client_message_id || '-')}`);
  console.log(`firstAt    : ${toIso(first.created_at)}`);
  console.log(`lastAt     : ${toIso(last.created_at)}`);

  printTraceTimeline(rows);
  printDiagnostics(rows);
  printTraceRows(rows);
}

function sessionMode(db: Database.Database, sessionId: string | undefined): void {
  const session = sessionId
    ? (db
        .prepare('SELECT * FROM agent_sessions WHERE id = ? LIMIT 1')
        .get(sessionId) as Row | undefined)
    : (db
        .prepare('SELECT * FROM agent_sessions ORDER BY updated_at DESC LIMIT 1')
        .get() as Row | undefined);

  if (!session) {
    console.error('未找到 session 记录。');
    process.exit(1);
  }

  const resolvedSessionId = String(session.id);

  printSection('Session');
  console.log(`id        : ${resolvedSessionId}`);
  console.log(`title     : ${String(session.title || '')}`);
  console.log(`engine    : ${String(session.engine || '')}`);
  console.log(`status    : ${String(session.status || '')}`);
  console.log(`provider  : ${String(session.provider_id || '') || '-'}`);
  console.log(`createdAt : ${toIso(session.created_at)}`);
  console.log(`updatedAt : ${toIso(session.updated_at)}`);
  console.log(`lastTurnAt: ${toIso(session.last_turn_at)}`);

  printSessionTraceHints(db, resolvedSessionId);

  const events = db
    .prepare(
      'SELECT seq, turn_id, event_type, payload_json, created_at FROM agent_events WHERE session_id = ? ORDER BY seq ASC LIMIT 2000',
    )
    .all(resolvedSessionId) as Row[];

  printSection('Runtime Events');
  for (const row of events) {
    const type = String(row.event_type || 'unknown');
    console.log(
      `#${String(row.seq)} [${toIso(row.created_at)}] turn=${String(row.turn_id || '-')} ${type} ${stringify(parseJson(row.payload_json), 180)}`,
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: true });

  try {
    if (args.traceId) {
      traceMode(db, args.traceId, args.limit);
      return;
    }

    sessionMode(db, args.sessionId);
  } finally {
    db.close();
  }
}

main();
