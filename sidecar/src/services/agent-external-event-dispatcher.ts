import { randomUUID } from 'node:crypto';
import { getSqlite } from '../db';
import { getAgentFlags } from '../config/agent-flags';

interface DispatchAgentTaskEventInput {
  sessionId: string;
  taskId: string;
  taskType: string;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string | null;
  turnId?: string | null;
}

interface TaskPayload {
  taskId: string;
  taskType: string;
  status: 'completed' | 'failed';
  output: unknown;
  error: string | null;
  updatedAt: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function extractArtifactId(output: unknown): string | null {
  const row = toRecord(output);
  if (typeof row.artifactId === 'string' && row.artifactId.trim()) {
    return row.artifactId.trim();
  }
  return null;
}

function resolveTaskEventType(input: {
  taskType: string;
  status: 'completed' | 'failed';
  output: unknown;
}): 'photo.ready' | 'photo.task.updated' {
  if (
    input.taskType === 'image-generation' &&
    input.status === 'completed' &&
    extractArtifactId(input.output)
  ) {
    return 'photo.ready';
  }
  return 'photo.task.updated';
}

function buildEntryText(payload: TaskPayload): string {
  if (payload.status === 'completed') {
    const artifactId = extractArtifactId(payload.output);
    if (artifactId) {
      return `图片任务完成：${payload.taskId}（artifact: ${artifactId}）`;
    }
    return `任务完成：${payload.taskId}`;
  }
  return `任务失败：${payload.taskId}${payload.error ? `（${payload.error}）` : ''}`;
}

export async function dispatchAgentTaskEvent(
  input: DispatchAgentTaskEventInput,
): Promise<boolean> {
  const flags = getAgentFlags();
  if (!flags.externalEventBridge) {
    return false;
  }

  if (!input.sessionId.trim()) {
    return false;
  }

  const sqlite = getSqlite();
  const now = new Date();
  const createdAtUnix = Math.floor(now.getTime() / 1000);
  const payload: TaskPayload = {
    taskId: input.taskId,
    taskType: input.taskType,
    status: input.status,
    output: input.output ?? null,
    error: input.error ?? null,
    updatedAt: now.toISOString(),
  };
  const eventType = resolveTaskEventType({
    taskType: input.taskType,
    status: input.status,
    output: payload.output,
  });
  const artifactId = extractArtifactId(payload.output);

  const tx = sqlite.transaction(() => {
    const exists = sqlite
      .prepare('SELECT 1 FROM agent_sessions WHERE id = ? LIMIT 1')
      .get(input.sessionId);
    if (!exists) {
      return false;
    }

    const eventId = randomUUID();
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
        eventId,
        input.sessionId,
        input.turnId || null,
        input.sessionId,
        eventType,
        JSON.stringify(payload),
        createdAtUnix,
      );

    const entryPayload = {
      type: eventType,
      text: buildEntryText(payload),
      taskId: input.taskId,
      status: input.status,
      output: payload.output,
      error: payload.error,
      updatedAt: payload.updatedAt,
    };

    sqlite
      .prepare(
        `
        INSERT INTO agent_entries (id, session_id, turn_id, entry_type, parent_entry_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
        `,
      )
      .run(
        randomUUID(),
        input.sessionId,
        input.turnId || null,
        'custom',
        JSON.stringify(entryPayload),
        createdAtUnix,
      );

    if (eventType === 'photo.ready') {
      sqlite
        .prepare(
          `
          INSERT INTO agent_outputs (id, session_id, turn_id, kind, ref_id, content_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          randomUUID(),
          input.sessionId,
          input.turnId || null,
          'photo',
          artifactId,
          JSON.stringify(payload),
          createdAtUnix,
        );
    }

    sqlite
      .prepare(
        `
        UPDATE agent_sessions
        SET updated_at = ?, last_turn_at = ?
        WHERE id = ?
        `,
      )
      .run(createdAtUnix, createdAtUnix, input.sessionId);

    return true;
  });

  return tx();
}
