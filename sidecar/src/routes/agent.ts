import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Hono } from 'hono';
import type { AgentRuntimeEvent } from '../agent/runtime/agent-runtime';
import { RuntimeRouter } from '../agent/runtime/runtime-router';
import {
  appendAgentEvent,
  getLatestAgentEventCursor,
  listAgentEvents,
} from '../services/agent-event-store';
import {
  type AgentEngine,
  type AgentOutputKind,
  appendAgentEntry,
  appendAgentOutput,
  createAgentSessionRecord,
  deleteAgentSessionRecord,
  getAgentSessionRecord,
  listAgentEntries,
  listAgentOutputs,
  listAgentSessionRecords,
  updateAgentSessionRecord,
} from '../services/agent-session-store';

export const agentRoutes = new Hono();

const skillsPath = path.resolve(process.cwd(), 'src', 'agent', 'skills');
const runtimeRouter = new RuntimeRouter({ skillsPath });

function toError(message: string, code: string) {
  return { error: message, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function eventToOutputKind(type: string): AgentOutputKind | null {
  if (type === 'photo.ready') return 'photo';
  if (type === 'copy.ready') return 'copy';
  return null;
}

function extractOutputRefId(type: string, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;

  if (type === 'photo.ready') {
    if (typeof row.artifactId === 'string') return row.artifactId;
    if (row.artifact && typeof row.artifact === 'object') {
      const artifact = row.artifact as Record<string, unknown>;
      if (typeof artifact.id === 'string') return artifact.id;
    }
    if (row.output && typeof row.output === 'object') {
      const output = row.output as Record<string, unknown>;
      if (typeof output.artifactId === 'string') return output.artifactId;
    }
  }

  return null;
}

agentRoutes.get('/sessions', async (c) => {
  const data = await listAgentSessionRecords();
  return c.json({ data, total: data.length });
});

agentRoutes.post('/sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title : undefined;
  const providerId =
    typeof body?.providerId === 'string' ? body.providerId : undefined;
  const engine: AgentEngine =
    body?.engine === 'agent-core' ? 'agent-core' : 'coding-agent';

  const session = await createAgentSessionRecord({
    title,
    providerId,
    engine,
  });

  return c.json(session, 201);
});

agentRoutes.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const session = await getAgentSessionRecord(sessionId);

  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }

  const [entries, outputs, cursor] = await Promise.all([
    listAgentEntries(sessionId, 300),
    listAgentOutputs({ sessionId }),
    getLatestAgentEventCursor(sessionId),
  ]);

  return c.json({
    ...session,
    entries,
    outputs,
    cursor,
  });
});

agentRoutes.patch('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!isRecord(body)) {
    return c.json(toError('请求体格式不正确。', 'INVALID_PAYLOAD'), 400);
  }

  const updates: {
    title?: string;
    archived?: boolean;
  } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return c.json(toError('title 不能为空。', 'INVALID_PAYLOAD'), 400);
    }
    updates.title = body.title.trim();
  }

  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') {
      return c.json(
        toError('archived 必须为 boolean。', 'INVALID_PAYLOAD'),
        400,
      );
    }

    if (body.archived) {
      const running = await runtimeRouter.isRunning(sessionId);
      if (running) {
        return c.json(
          toError('会话正在执行中，请先中断后再归档。', 'SESSION_RUNNING'),
          409,
        );
      }
    }

    updates.archived = body.archived;
  }

  if (Object.keys(updates).length === 0) {
    return c.json(toError('缺少可更新字段。', 'INVALID_PAYLOAD'), 400);
  }

  const next = await updateAgentSessionRecord(sessionId, updates);
  if (!next) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }

  return c.json(next);
});

agentRoutes.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (running) {
    return c.json(
      toError('会话正在执行中，请先中断后再删除。', 'SESSION_RUNNING'),
      409,
    );
  }

  await deleteAgentSessionRecord(sessionId);
  return c.json({ success: true });
});

agentRoutes.post('/sessions/:id/turn', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return c.json(toError('消息不能为空。', 'INVALID_PAYLOAD'), 400);
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    return c.json(
      toError('会话已归档，无法继续对话。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const turnId = randomUUID();
  await appendAgentEntry({
    sessionId,
    entryType: 'user',
    payload: {
      text,
      turnId,
    },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let sawTurnFailed = false;

      const writeEvent = (chunk: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      };

      const closeStream = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const onRuntimeEvent = async (event: AgentRuntimeEvent) => {
        if (event.type === 'turn.failed') {
          sawTurnFailed = true;
        }

        const persisted = await appendAgentEvent({
          sessionId,
          turnId,
          eventType: event.type,
          payload: event.payload,
        });

        if (event.type === 'assistant.completed') {
          await appendAgentEntry({
            sessionId,
            entryType: 'assistant',
            payload: {
              turnId,
              ...(event.payload as Record<string, unknown>),
            },
          });
        }

        if (event.type === 'tool.result') {
          await appendAgentEntry({
            sessionId,
            entryType: 'toolResult',
            payload: {
              turnId,
              ...(event.payload as Record<string, unknown>),
            },
          });
        }

        const outputKind = eventToOutputKind(event.type);
        if (outputKind) {
          await appendAgentOutput({
            sessionId,
            turnId,
            kind: outputKind,
            refId: extractOutputRefId(event.type, event.payload),
            content: event.payload,
          });
        }

        writeEvent({
          cursor: persisted.seq,
          event: {
            type: event.type,
            sessionId: event.sessionId,
            turnId: event.turnId,
            timestamp: event.timestamp,
            payload: event.payload,
          },
        });
      };

      runtimeRouter
        .runTurn(sessionId, turnId, text, onRuntimeEvent)
        .then(closeStream)
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : '执行失败';
          if (!sawTurnFailed) {
            const failedEvent = await appendAgentEvent({
              sessionId,
              turnId,
              eventType: 'turn.failed',
              payload: { message },
            });

            writeEvent({
              cursor: failedEvent.seq,
              event: {
                type: 'turn.failed',
                sessionId,
                turnId,
                timestamp: new Date().toISOString(),
                payload: { message },
              },
            });
          }
          closeStream();
        });

      c.req.raw.signal.addEventListener('abort', () => {
        void runtimeRouter.abort(sessionId).catch(() => undefined);
        closeStream();
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

agentRoutes.post('/sessions/:id/steer', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return c.json(toError('steer 文本不能为空。', 'INVALID_PAYLOAD'), 400);
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    return c.json(
      toError('会话已归档，无法发送 steer。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    return c.json(
      toError(
        '当前会话没有执行中的 turn，无法执行 steer。',
        'SESSION_NOT_RUNNING',
      ),
      409,
    );
  }

  await runtimeRouter.steer(sessionId, text);
  return c.json({ success: true });
});

agentRoutes.post('/sessions/:id/follow-up', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return c.json(toError('follow-up 文本不能为空。', 'INVALID_PAYLOAD'), 400);
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    return c.json(
      toError('会话已归档，无法发送 follow-up。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    return c.json(
      toError(
        '当前会话没有执行中的 turn，无法执行 follow-up。',
        'SESSION_NOT_RUNNING',
      ),
      409,
    );
  }

  await runtimeRouter.followUp(sessionId, text);
  return c.json({ success: true });
});

agentRoutes.post('/sessions/:id/abort', async (c) => {
  const sessionId = c.req.param('id');
  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    return c.json(toError('会话已归档。', 'SESSION_ARCHIVED'), 409);
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    return c.json(
      toError('当前会话没有执行中的 turn。', 'SESSION_NOT_RUNNING'),
      409,
    );
  }

  await runtimeRouter.abort(sessionId);

  return c.json({ success: true });
});

agentRoutes.get('/sessions/:id/events', async (c) => {
  const sessionId = c.req.param('id');
  const cursorRaw = c.req.query('cursor');
  const limitRaw = c.req.query('limit');

  const cursor =
    typeof cursorRaw === 'string' && cursorRaw.trim()
      ? Number.parseInt(cursorRaw, 10)
      : undefined;

  const limit =
    typeof limitRaw === 'string' && limitRaw.trim()
      ? Number.parseInt(limitRaw, 10)
      : undefined;

  const data = await listAgentEvents({
    sessionId,
    cursor: Number.isFinite(cursor) ? cursor : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  const nextCursor =
    data.length > 0 ? data[data.length - 1].seq : (cursor ?? 0);

  return c.json({
    data,
    cursor: nextCursor,
    total: data.length,
  });
});

agentRoutes.get('/sessions/:id/outputs', async (c) => {
  const sessionId = c.req.param('id');
  const kindRaw = c.req.query('kind');
  const kind = kindRaw === 'photo' || kindRaw === 'copy' ? kindRaw : undefined;

  const data = await listAgentOutputs({ sessionId, kind });
  return c.json({ data, total: data.length });
});
