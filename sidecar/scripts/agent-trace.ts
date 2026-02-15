import Database from 'better-sqlite3';
import path from 'node:path';
import { existsSync } from 'node:fs';

type Row = Record<string, unknown>;

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

function resolveDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const file = path.join(dataDir, 'shooting-planner.db');
  if (!existsSync(file)) {
    throw new Error(`数据库不存在: ${file}`);
  }
  return file;
}

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  const argSessionId = process.argv[2]?.trim();
  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: true });

  const session = argSessionId
    ? (db
        .prepare('SELECT * FROM agent_sessions WHERE id = ? LIMIT 1')
        .get(argSessionId) as Row | undefined)
    : (db
        .prepare('SELECT * FROM agent_sessions ORDER BY created_at DESC LIMIT 1')
        .get() as Row | undefined);

  if (!session) {
    console.error('未找到 agent_sessions 记录。');
    process.exit(1);
  }

  const sessionId = String(session.id);

  const entries = db
    .prepare(
      'SELECT id, entry_type, payload_json, created_at FROM agent_entries WHERE session_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(sessionId) as Row[];

  const events = db
    .prepare(
      'SELECT seq, turn_id, event_type, payload_json, created_at FROM agent_events WHERE session_id = ? ORDER BY seq ASC',
    )
    .all(sessionId) as Row[];

  const outputs = db
    .prepare(
      'SELECT id, kind, ref_id, content_json, created_at FROM agent_outputs WHERE session_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(sessionId) as Row[];

  printSection('Session');
  console.log(`id        : ${sessionId}`);
  console.log(`title     : ${String(session.title || '')}`);
  console.log(`engine    : ${String(session.engine || '')}`);
  console.log(`status    : ${String(session.status || '')}`);
  console.log(`provider  : ${String(session.provider_id || '') || '-'}`);
  console.log(`createdAt : ${toIso(session.created_at)}`);
  console.log(`updatedAt : ${toIso(session.updated_at)}`);
  console.log(`lastTurnAt: ${toIso(session.last_turn_at)}`);

  printSection('Entries (完整对话)');
  for (const row of entries) {
    const payload = parseJson(row.payload_json);
    console.log(
      `[${toIso(row.created_at)}] ${String(row.entry_type)} ${String(row.id)} ${stringify(payload, 320)}`,
    );
  }

  const eventCounts = new Map<string, number>();
  for (const row of events) {
    const type = String(row.event_type);
    eventCounts.set(type, (eventCounts.get(type) || 0) + 1);
  }

  printSection('Events 概览');
  for (const [type, count] of [...eventCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${type}: ${count}`);
  }

  printSection('Events 时序');
  for (const row of events) {
    const type = String(row.event_type);
    const payload = parseJson(row.payload_json) as Record<string, unknown> | null;
    const turnId = String(row.turn_id || '-');

    let detail = '';
    if (type === 'tool.call') {
      detail = `tool=${String(payload?.toolName || 'unknown')} args=${stringify(payload?.args, 200)}`;
    } else if (type === 'tool.result') {
      detail = `tool=${String(payload?.toolName || 'unknown')} isError=${String(payload?.isError || false)} result=${stringify(payload?.result, 200)}`;
    } else if (type === 'assistant.completed') {
      detail = `text=${stringify(payload?.text, 200)}`;
    } else if (type === 'turn.failed') {
      detail = `message=${stringify(payload?.message, 200)}`;
    } else {
      detail = stringify(payload, 180);
    }

    console.log(
      `#${String(row.seq)} [${toIso(row.created_at)}] turn=${turnId} ${type}${detail ? ` | ${detail}` : ''}`,
    );
  }

  printSection('Outputs');
  for (const row of outputs) {
    const content = parseJson(row.content_json);
    console.log(
      `[${toIso(row.created_at)}] ${String(row.kind)} ref=${String(row.ref_id || '-')} ${stringify(content, 260)}`,
    );
  }

  const hasToolCall = (eventCounts.get('tool.call') || 0) > 0;
  printSection('诊断');
  if (!hasToolCall) {
    console.log('未检测到 tool.call：本次回合没有触发任何工具调用。');
  } else {
    console.log('检测到 tool.call：工具链已触发。');
  }

  if ((eventCounts.get('photo.ready') || 0) === 0 && (eventCounts.get('copy.ready') || 0) === 0) {
    console.log('未检测到 photo.ready/copy.ready：没有产出事件。');
  }

  db.close();
}

main();
