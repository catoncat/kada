import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Hono } from 'hono';
import type { AgentRuntimeEvent } from '../agent/runtime/agent-runtime';
import { RuntimeRouter } from '../agent/runtime/runtime-router';
import { getAgentFlags } from '../config/agent-flags';
import { getDb } from '../db';
import { tasks } from '../db/schema';
import { getAgentTraceContext, setAgentTraceContext } from '../services/agent-trace-context';
import {
  appendClientTraceBatch,
  appendTraceLog,
  getTraceTimeline,
  getTraceWire,
  listTraceLogs,
} from '../services/agent-trace-store';
import {
  buildAgentMentionsContextBlock,
  isAgentMentionKind,
  listAgentResourceImages,
  parseAgentMentionKinds,
  resolveAgentMentionsForRuntime,
  searchAgentResources,
} from '../services/agent-resource-search';
import {
  appendAgentEvent,
  getLatestAgentEventCursor,
  listAgentEvents,
} from '../services/agent-event-store';
import {
  appendToolResultReadability,
  countRecentReadabilityBySession,
  updateToolResultReadabilityStatus,
} from '../services/agent-toolresult-readability-store';
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
  touchAgentSessionTurn,
  updateAgentSessionRecord,
} from '../services/agent-session-store';

export const agentRoutes = new Hono();

const skillsPath = path.resolve(process.cwd(), 'src', 'agent', 'skills');
const runtimeRouter = new RuntimeRouter({ skillsPath });
const agentFlags = getAgentFlags();

function toError(message: string, code: string) {
  return { error: message, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePositiveInt(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, parsed);
}

function parseClientMessageId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const raw = payload.clientMessageId;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text || null;
}

function toTraceErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function traceApiTurnEvent(input: {
  sessionId: string;
  turnId?: string | null;
  clientMessageId?: string | null;
  event: 'api.turn.accepted' | 'api.turn.rejected';
  level?: 'debug' | 'info' | 'warn' | 'error';
  ok?: boolean;
  data?: unknown;
}): Promise<void> {
  await appendTraceLog({
    sessionId: input.sessionId,
    turnId: input.turnId,
    clientMessageId: input.clientMessageId,
    channel: 'api',
    event: input.event,
    level: input.level,
    ok: input.ok,
    data: input.data,
  });
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

const KNOWN_TOOL_NAMES = new Set([
  'photo_compose_prompt',
  'photo_enqueue_generation',
  'photo_get_generation_status',
  'copy_generate_variants',
  'copy_rewrite_by_tone',
  'resource_search_scenes',
  'resource_search_models',
  'resource_get_project_context',
]);

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function firstTextFromResult(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    const row = isRecord(item) ? item : null;
    const text = row && typeof row.text === 'string' ? row.text.trim() : '';
    if (text) return text;
  }
  return '';
}

function looksLikeStackNoise(text: string): boolean {
  return /(traceback|exception|stack| at\s+\S+\s*\(|error:|npm\s+err|\bwarn\b)/i.test(
    text,
  );
}

function shouldEnhanceToolResult(payload: Record<string, unknown>): boolean {
  const isError = Boolean(payload.isError);
  const toolName =
    typeof payload.toolName === 'string' ? payload.toolName.trim() : '';
  const ruleScore =
    typeof payload.ruleScore === 'number' ? payload.ruleScore : 0.5;

  const rawStats = isRecord(payload.rawStats) ? payload.rawStats : {};
  const chars =
    typeof rawStats.chars === 'number'
      ? rawStats.chars
      : stableSerialize(payload.result).length;
  const jsonDepth =
    typeof rawStats.jsonDepth === 'number' ? rawStats.jsonDepth : 0;

  const result = isRecord(payload.result) ? payload.result : {};
  const textOutput =
    firstTextFromResult(result) ||
    (typeof result.message === 'string' ? result.message : '') ||
    stableSerialize(result);
  const stackNoise = looksLikeStackNoise(textOutput);

  const unknownTool = !toolName || !KNOWN_TOOL_NAMES.has(toolName);
  return (
    chars >= 320 ||
    jsonDepth >= 3 ||
    isError ||
    ruleScore < 0.65 ||
    unknownTool ||
    stackNoise
  );
}

function buildToolResultSourceHash(input: {
  toolName: string;
  result: unknown;
  locale?: string;
}): string {
  const locale = input.locale || 'zh-CN';
  const normalized = `${input.toolName}|${locale}|${stableSerialize(input.result)}`;
  return createHash('sha256').update(normalized).digest('hex');
}

agentRoutes.get('/resources/search', async (c) => {
  const q = c.req.query('q') || '';
  const kinds = parseAgentMentionKinds(c.req.query('kinds'));
  const limit = parsePositiveInt(c.req.query('limit'), 20);
  const data = await searchAgentResources({ q, kinds, limit });
  return c.json({ data, total: data.length });
});

agentRoutes.get('/resources/:kind/:id/images', async (c) => {
  const kindRaw = c.req.param('kind');
  if (!isAgentMentionKind(kindRaw)) {
    return c.json(toError('资源类型不支持。', 'INVALID_KIND'), 400);
  }

  const id = c.req.param('id');
  const limit = parsePositiveInt(c.req.query('limit'), 40);

  const result = await listAgentResourceImages({
    kind: kindRaw,
    id,
    limit,
  });

  if (!result.found) {
    return c.json(toError('资源不存在。', 'RESOURCE_NOT_FOUND'), 404);
  }

  return c.json({
    data: result.data,
    total: result.data.length,
    resourceTitle: result.resourceTitle,
  });
});

agentRoutes.get('/capabilities', async (c) => {
  return c.json({
    autoFollowUpOnSessionRunning: agentFlags.autoFollowUpOnSessionRunning,
    queueAppliedEvent: agentFlags.queueAppliedEvent,
    externalEventBridge: agentFlags.externalEventBridge,
    toolResultEnhancement: agentFlags.toolResultEnhancement,
  });
});

agentRoutes.post('/traces/client-batch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const events = isRecord(body) && Array.isArray(body.events) ? body.events : [];

  const result = await appendClientTraceBatch({
    events: events as Array<{
      traceId?: string | null;
      sessionId?: string | null;
      turnId?: string | null;
      clientMessageId?: string | null;
      channel?: string;
      event?: string;
      level?: string;
      at?: number;
      data?: unknown;
    }>,
  });

  return c.json(result);
});

agentRoutes.get('/traces', async (c) => {
  const traceId = c.req.query('traceId') || undefined;
  const sessionId = c.req.query('sessionId') || undefined;
  const turnId = c.req.query('turnId') || undefined;
  const requestId = c.req.query('requestId') || undefined;
  const channel = c.req.query('channel') || undefined;
  const event = c.req.query('event') || undefined;
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

  const result = await listTraceLogs({
    traceId,
    sessionId,
    turnId,
    requestId,
    channel,
    event,
    cursor: Number.isFinite(cursor) ? cursor : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return c.json(result);
});

agentRoutes.get('/traces/:traceId/timeline', async (c) => {
  const traceId = c.req.param('traceId');
  if (!traceId || !traceId.trim()) {
    return c.json(toError('traceId 不能为空。', 'INVALID_TRACE_ID'), 400);
  }

  const timeline = await getTraceTimeline(traceId.trim());
  return c.json(timeline);
});

agentRoutes.get('/traces/:traceId/wire', async (c) => {
  const traceId = c.req.param('traceId');
  if (!traceId || !traceId.trim()) {
    return c.json(toError('traceId 不能为空。', 'INVALID_TRACE_ID'), 400);
  }

  const tailRaw = c.req.query('tail');
  const tailLines =
    typeof tailRaw === 'string' && tailRaw.trim()
      ? Number.parseInt(tailRaw, 10)
      : undefined;

  const result = await getTraceWire(traceId.trim(), {
    tailLines: Number.isFinite(tailLines) ? tailLines : undefined,
  });

  return c.json(result);
});

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
  const turnIdRaw = c.req.query('turnId');
  const turnId =
    typeof turnIdRaw === 'string' && turnIdRaw.trim() ? turnIdRaw.trim() : undefined;
  const session = await getAgentSessionRecord(sessionId);

  if (!session) {
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }

  const [entries, outputs, cursor] = await Promise.all([
    listAgentEntries({ sessionId, turnId, limit: 300 }),
    listAgentOutputs({ sessionId, turnId }),
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
  const clientMessageId = parseClientMessageId(body);
  const rawMentions =
    isRecord(body) && Array.isArray(body.mentions) ? body.mentions : [];
  setAgentTraceContext({
    sessionId,
    clientMessageId,
  });

  if (!text) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'INVALID_PAYLOAD',
        message: '消息不能为空',
      },
    });
    return c.json(toError('消息不能为空。', 'INVALID_PAYLOAD'), 400);
  }
  if (!clientMessageId) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'INVALID_PAYLOAD',
        message: '缺少 clientMessageId',
      },
    });
    return c.json(toError('缺少 clientMessageId。', 'INVALID_PAYLOAD'), 400);
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'SESSION_NOT_FOUND',
      },
    });
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'SESSION_ARCHIVED',
      },
    });
    return c.json(
      toError('会话已归档，无法继续对话。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const mentionsResolution = await resolveAgentMentionsForRuntime(rawMentions);
  const mentionsContext = buildAgentMentionsContextBlock(
    mentionsResolution.mentions,
  );
  const runtimeText = mentionsContext ? `${text}\n\n${mentionsContext}` : text;

  const turnId = randomUUID();
  setAgentTraceContext({
    sessionId,
    turnId,
    clientMessageId,
  });
  if (!runtimeRouter.tryAcquireTurnGate(sessionId)) {
    await traceApiTurnEvent({
      sessionId,
      turnId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'SESSION_RUNNING',
      },
    });
    return c.json(
      toError('会话正在执行中，请稍后或改为 follow-up。', 'SESSION_RUNNING'),
      409,
    );
  }
  const lockedSession = await getAgentSessionRecord(sessionId);
  if (!lockedSession) {
    runtimeRouter.releaseTurnGate(sessionId);
    await traceApiTurnEvent({
      sessionId,
      turnId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'SESSION_NOT_FOUND',
      },
    });
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (lockedSession.archivedAt) {
    runtimeRouter.releaseTurnGate(sessionId);
    await traceApiTurnEvent({
      sessionId,
      turnId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'turn',
        reason: 'SESSION_ARCHIVED',
      },
    });
    return c.json(
      toError('会话已归档，无法继续对话。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  await traceApiTurnEvent({
    sessionId,
    turnId,
    clientMessageId,
    event: 'api.turn.accepted',
    data: {
      action: 'turn',
      textLen: text.length,
      runtimeTextLen: runtimeText.length,
      mentionsResolved: mentionsResolution.mentions.length,
      mentionsDropped: mentionsResolution.dropped.length,
    },
  });

  const encoder = new TextEncoder();

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let sawTurnFailed = false;

        const writeEvent = (chunk: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        };

        const closeStream = (reason: 'server' | 'client' | 'error') => {
          if (closed) return;
          closed = true;
          controller.close();

          if (reason === 'client') {
            void appendTraceLog({
              sessionId,
              turnId,
              clientMessageId,
              channel: 'api',
              event: 'api.stream.closed_by_client',
              level: 'warn',
              data: { action: 'turn' },
            });
            return;
          }

          void appendTraceLog({
            sessionId,
            turnId,
            clientMessageId,
            channel: 'api',
            event: 'api.stream.closed_by_server',
            level: reason === 'error' ? 'warn' : 'info',
            ok: reason !== 'error',
            data: { action: 'turn', reason },
          });
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

          await appendTraceLog({
            sessionId,
            turnId,
            clientMessageId,
            channel: 'db',
            event: 'db.runtime_event.appended',
            data: {
              seq: persisted.seq,
              eventType: event.type,
            },
          });

          if (
            agentFlags.queueAppliedEvent &&
            (event.type === 'steer.applied' || event.type === 'followup.applied')
          ) {
            const payload = isRecord(event.payload)
              ? (event.payload as Record<string, unknown>)
              : {};
            await appendAgentEntry({
              sessionId,
              turnId,
              entryType: 'user',
              payload: {
                text: typeof payload.text === 'string' ? payload.text : '',
                mode:
                  event.type === 'steer.applied'
                    ? 'steer'
                    : 'follow-up',
                turnId,
                clientMessageId:
                  typeof payload.clientMessageId === 'string'
                    ? payload.clientMessageId
                    : null,
                mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
                mentionDrops: Array.isArray(payload.mentionDrops)
                  ? payload.mentionDrops
                  : [],
                queuedAt: payload.queuedAt || null,
                appliedAt: payload.appliedAt || event.timestamp,
                promotedFromFollowUp: Boolean(payload.promotedFromFollowUp),
              },
            });

            await appendTraceLog({
              sessionId,
              turnId,
              clientMessageId,
              channel: 'db',
              event: 'db.user_entry.appended',
              data: {
                mode: event.type === 'steer.applied' ? 'steer' : 'follow-up',
                source: 'queueAppliedEvent',
              },
            });
          }

          if (event.type === 'assistant.completed') {
            await appendAgentEntry({
              sessionId,
              turnId,
              entryType: 'assistant',
              payload: {
                turnId,
                ...(event.payload as Record<string, unknown>),
              },
            });

            await appendTraceLog({
              sessionId,
              turnId,
              clientMessageId,
              channel: 'db',
              event: 'db.assistant_entry.appended',
              data: {
                payload:
                  isRecord(event.payload) &&
                  typeof event.payload.text === 'string'
                    ? {
                        textLen: event.payload.text.length,
                        stopReason: event.payload.stopReason || null,
                      }
                    : null,
              },
            });
          }

          if (event.type === 'tool.result') {
            const toolPayload = {
              turnId,
              ...(event.payload as Record<string, unknown>),
            } as Record<string, unknown> & { turnId: string };
            const entry = await appendAgentEntry({
              sessionId,
              turnId,
              entryType: 'toolResult',
              payload: toolPayload,
            });

            if (agentFlags.toolResultEnhancement) {
              const toolName =
                typeof toolPayload.toolName === 'string'
                  ? toolPayload.toolName.trim()
                  : 'tool';
              const result = isRecord(toolPayload.result) ? toolPayload.result : {};
              const sourceHash = buildToolResultSourceHash({
                toolName,
                result,
                locale: 'zh-CN',
              });
              const rawStats = isRecord(toolPayload.rawStats)
                ? toolPayload.rawStats
                : {};
              const sourceSize =
                typeof rawStats.chars === 'number'
                  ? Math.max(0, Math.floor(rawStats.chars))
                  : stableSerialize(result).length;
              const ruleSummary =
                typeof toolPayload.summary === 'string' && toolPayload.summary.trim()
                  ? toolPayload.summary.trim()
                  : toolName;
              const ruleDetail =
                typeof toolPayload.readableDetail === 'string' &&
                toolPayload.readableDetail.trim()
                  ? toolPayload.readableDetail.trim()
                  : ruleSummary;

              await appendToolResultReadability({
                entryId: entry.id,
                sessionId,
                turnId,
                toolCallId:
                  typeof toolPayload.toolCallId === 'string'
                    ? toolPayload.toolCallId
                    : null,
                sourceHash,
                sourceSize,
                ruleSummary,
                ruleDetail,
              });

              const shouldQueue = shouldEnhanceToolResult(toolPayload);
              if (shouldQueue) {
                const recentCount = await countRecentReadabilityBySession({
                  sessionId,
                  since: new Date(Date.now() - 60 * 1000),
                });

                if (recentCount > 6) {
                  await updateToolResultReadabilityStatus({
                    entryId: entry.id,
                    status: 'skipped',
                    error: 'RATE_LIMITED_PER_SESSION',
                  });
                } else {
                  const db = getDb();
                  await db.insert(tasks).values({
                    id: randomUUID(),
                    type: 'agent-toolresult-enhance',
                    status: 'pending',
                    input: JSON.stringify({
                      sessionId,
                      turnId,
                      entryId: entry.id,
                      toolCallId:
                        typeof toolPayload.toolCallId === 'string'
                          ? toolPayload.toolCallId
                          : null,
                      toolName,
                      providerId: lockedSession.providerId || null,
                      sourceHash,
                      sourceSize,
                      sourcePayload: toolPayload,
                      locale: 'zh-CN',
                      queuedAt: new Date().toISOString(),
                    }),
                    relatedId: sessionId,
                    relatedMeta: turnId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });
                }
              } else {
                await updateToolResultReadabilityStatus({
                  entryId: entry.id,
                  status: 'skipped',
                });
              }
            }
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
          .runTurn({
            sessionId,
            turnId,
            text: runtimeText,
            onEvent: onRuntimeEvent,
            gateAlreadyAcquired: true,
            beforeRun: async () => {
              await appendAgentEntry({
                sessionId,
                turnId,
                entryType: 'user',
                payload: {
                  text,
                  mode: 'turn',
                  turnId,
                  clientMessageId,
                  mentions: mentionsResolution.mentions,
                  mentionDrops: mentionsResolution.dropped,
                },
              });

              await appendTraceLog({
                sessionId,
                turnId,
                clientMessageId,
                channel: 'db',
                event: 'db.user_entry.appended',
                data: {
                  mode: 'turn',
                },
              });
            },
          })
          .then(() => {
            closeStream('server');
          })
          .catch(async (error) => {
            const message = error instanceof Error ? error.message : '执行失败';
            if (!sawTurnFailed) {
              const failedEvent = await appendAgentEvent({
                sessionId,
                turnId,
                eventType: 'turn.failed',
                payload: { message },
              });

              await appendTraceLog({
                sessionId,
                turnId,
                clientMessageId,
                channel: 'db',
                event: 'db.runtime_event.appended',
                level: 'warn',
                ok: false,
                data: {
                  seq: failedEvent.seq,
                  eventType: 'turn.failed',
                  message,
                },
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
            closeStream('error');
          });

        c.req.raw.signal.addEventListener(
          'abort',
          () => {
            closeStream('client');
          },
          { once: true },
        );
      },
    });
  } catch (error) {
    runtimeRouter.releaseTurnGate(sessionId);
    await traceApiTurnEvent({
      sessionId,
      turnId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'error',
      ok: false,
      data: {
        action: 'turn',
        reason: 'STREAM_INIT_FAILED',
        message: toTraceErrorMessage(error),
      },
    });
    throw error;
  }

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
  const clientMessageId = parseClientMessageId(body);
  const rawMentions =
    isRecord(body) && Array.isArray(body.mentions) ? body.mentions : [];
  setAgentTraceContext({
    sessionId,
    clientMessageId,
  });

  if (!text) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'steer',
        reason: 'INVALID_PAYLOAD',
        message: 'steer 文本不能为空',
      },
    });
    return c.json(toError('steer 文本不能为空。', 'INVALID_PAYLOAD'), 400);
  }
  if (!clientMessageId) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'steer',
        reason: 'INVALID_PAYLOAD',
        message: '缺少 clientMessageId',
      },
    });
    return c.json(toError('缺少 clientMessageId。', 'INVALID_PAYLOAD'), 400);
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'steer',
        reason: 'SESSION_NOT_FOUND',
      },
    });
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'steer',
        reason: 'SESSION_ARCHIVED',
      },
    });
    return c.json(
      toError('会话已归档，无法发送 steer。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'steer',
        reason: 'SESSION_NOT_RUNNING',
      },
    });
    return c.json(
      toError(
        '当前会话没有执行中的 turn，无法执行 steer。',
        'SESSION_NOT_RUNNING',
      ),
      409,
    );
  }

  const mentionsResolution = await resolveAgentMentionsForRuntime(rawMentions);
  const mentionsContext = buildAgentMentionsContextBlock(
    mentionsResolution.mentions,
  );
  const runtimeText = mentionsContext ? `${text}\n\n${mentionsContext}` : text;

  await traceApiTurnEvent({
    sessionId,
    clientMessageId,
    event: 'api.turn.accepted',
    data: {
      action: 'steer',
      textLen: text.length,
      runtimeTextLen: runtimeText.length,
      mentionsResolved: mentionsResolution.mentions.length,
      mentionsDropped: mentionsResolution.dropped.length,
    },
  });

  await runtimeRouter.steer(sessionId, {
    clientMessageId,
    text,
    runtimeText,
    mentions: mentionsResolution.mentions,
    mentionDrops: mentionsResolution.dropped,
  });
  if (!agentFlags.queueAppliedEvent) {
    await appendAgentEntry({
      sessionId,
      turnId: null,
      entryType: 'user',
      payload: {
        text,
        mode: 'steer',
        clientMessageId,
        mentions: mentionsResolution.mentions,
        mentionDrops: mentionsResolution.dropped,
      },
    });

    await appendTraceLog({
      sessionId,
      clientMessageId,
      channel: 'db',
      event: 'db.user_entry.appended',
      data: {
        mode: 'steer',
      },
    });
  }
  await touchAgentSessionTurn(sessionId);
  return c.json({
    success: true,
    mentionsResolved: mentionsResolution.mentions.length,
    mentionsDropped: mentionsResolution.dropped.length,
  });
});

agentRoutes.post('/sessions/:id/follow-up', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const clientMessageId = parseClientMessageId(body);
  const rawMentions =
    isRecord(body) && Array.isArray(body.mentions) ? body.mentions : [];
  setAgentTraceContext({
    sessionId,
    clientMessageId,
  });

  if (!text) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up',
        reason: 'INVALID_PAYLOAD',
        message: 'follow-up 文本不能为空',
      },
    });
    return c.json(toError('follow-up 文本不能为空。', 'INVALID_PAYLOAD'), 400);
  }
  if (!clientMessageId) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up',
        reason: 'INVALID_PAYLOAD',
        message: '缺少 clientMessageId',
      },
    });
    return c.json(toError('缺少 clientMessageId。', 'INVALID_PAYLOAD'), 400);
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up',
        reason: 'SESSION_NOT_FOUND',
      },
    });
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up',
        reason: 'SESSION_ARCHIVED',
      },
    });
    return c.json(
      toError('会话已归档，无法发送 follow-up。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up',
        reason: 'SESSION_NOT_RUNNING',
      },
    });
    return c.json(
      toError(
        '当前会话没有执行中的 turn，无法执行 follow-up。',
        'SESSION_NOT_RUNNING',
      ),
      409,
    );
  }

  const mentionsResolution = await resolveAgentMentionsForRuntime(rawMentions);
  const mentionsContext = buildAgentMentionsContextBlock(
    mentionsResolution.mentions,
  );
  const runtimeText = mentionsContext ? `${text}\n\n${mentionsContext}` : text;

  await traceApiTurnEvent({
    sessionId,
    clientMessageId,
    event: 'api.turn.accepted',
    data: {
      action: 'follow-up',
      textLen: text.length,
      runtimeTextLen: runtimeText.length,
      mentionsResolved: mentionsResolution.mentions.length,
      mentionsDropped: mentionsResolution.dropped.length,
    },
  });

  await runtimeRouter.followUp(sessionId, {
    clientMessageId,
    text,
    runtimeText,
    mentions: mentionsResolution.mentions,
    mentionDrops: mentionsResolution.dropped,
  });
  if (!agentFlags.queueAppliedEvent) {
    await appendAgentEntry({
      sessionId,
      turnId: null,
      entryType: 'user',
      payload: {
        text,
        mode: 'follow-up',
        clientMessageId,
        mentions: mentionsResolution.mentions,
        mentionDrops: mentionsResolution.dropped,
      },
    });

    await appendTraceLog({
      sessionId,
      clientMessageId,
      channel: 'db',
      event: 'db.user_entry.appended',
      data: {
        mode: 'follow-up',
      },
    });
  }
  await touchAgentSessionTurn(sessionId);
  return c.json({
    success: true,
    mentionsResolved: mentionsResolution.mentions.length,
    mentionsDropped: mentionsResolution.dropped.length,
  });
});

agentRoutes.post('/sessions/:id/follow-up/promote', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const clientMessageId = parseClientMessageId(body);
  setAgentTraceContext({
    sessionId,
    clientMessageId,
  });

  if (!clientMessageId) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up.promote',
        reason: 'INVALID_PAYLOAD',
        message: '缺少 clientMessageId',
      },
    });
    return c.json(
      toError('缺少 clientMessageId。', 'INVALID_PAYLOAD'),
      400,
    );
  }

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up.promote',
        reason: 'SESSION_NOT_FOUND',
      },
    });
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up.promote',
        reason: 'SESSION_ARCHIVED',
      },
    });
    return c.json(
      toError('会话已归档，无法执行 follow-up promote。', 'SESSION_ARCHIVED'),
      409,
    );
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    await traceApiTurnEvent({
      sessionId,
      clientMessageId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'follow-up.promote',
        reason: 'SESSION_NOT_RUNNING',
      },
    });
    return c.json(
      toError(
        '当前会话没有执行中的 turn，无法执行 follow-up promote。',
        'SESSION_NOT_RUNNING',
      ),
      409,
    );
  }

  await traceApiTurnEvent({
    sessionId,
    clientMessageId,
    event: 'api.turn.accepted',
    data: {
      action: 'follow-up.promote',
      textLen: text.length,
    },
  });

  const removed = await runtimeRouter.promoteFollowUpToSteer(
    sessionId,
    { clientMessageId },
  );
  if (!agentFlags.queueAppliedEvent && removed && text) {
    await appendAgentEntry({
      sessionId,
      turnId: null,
      entryType: 'user',
      payload: {
        text,
        mode: 'steer',
        clientMessageId,
        promotedFromFollowUp: true,
      },
    });

    await appendTraceLog({
      sessionId,
      clientMessageId,
      channel: 'db',
      event: 'db.user_entry.appended',
      data: {
        mode: 'steer',
        promotedFromFollowUp: true,
      },
    });
  }
  await touchAgentSessionTurn(sessionId);

  return c.json({ success: true, removed });
});

agentRoutes.post('/sessions/:id/abort', async (c) => {
  const sessionId = c.req.param('id');
  const traceContext = getAgentTraceContext();
  setAgentTraceContext({
    sessionId,
    clientMessageId: traceContext?.clientMessageId || null,
  });

  const session = await getAgentSessionRecord(sessionId);
  if (!session) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'abort',
        reason: 'SESSION_NOT_FOUND',
      },
    });
    return c.json(toError('会话不存在。', 'SESSION_NOT_FOUND'), 404);
  }
  if (session.archivedAt) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'abort',
        reason: 'SESSION_ARCHIVED',
      },
    });
    return c.json(toError('会话已归档。', 'SESSION_ARCHIVED'), 409);
  }

  const running = await runtimeRouter.isRunning(sessionId);
  if (!running) {
    await traceApiTurnEvent({
      sessionId,
      event: 'api.turn.rejected',
      level: 'warn',
      ok: false,
      data: {
        action: 'abort',
        reason: 'SESSION_NOT_RUNNING',
      },
    });
    return c.json(
      toError('当前会话没有执行中的 turn。', 'SESSION_NOT_RUNNING'),
      409,
    );
  }

  await traceApiTurnEvent({
    sessionId,
    event: 'api.turn.accepted',
    data: {
      action: 'abort',
    },
  });

  await runtimeRouter.abort(sessionId);

  return c.json({ success: true });
});

agentRoutes.get('/sessions/:id/events', async (c) => {
  const sessionId = c.req.param('id');
  const turnIdRaw = c.req.query('turnId');
  const cursorRaw = c.req.query('cursor');
  const limitRaw = c.req.query('limit');
  const turnId =
    typeof turnIdRaw === 'string' && turnIdRaw.trim() ? turnIdRaw.trim() : undefined;

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
    turnId,
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

agentRoutes.get('/sessions/:id/entries', async (c) => {
  const sessionId = c.req.param('id');
  const turnIdRaw = c.req.query('turnId');
  const limitRaw = c.req.query('limit');
  const turnId =
    typeof turnIdRaw === 'string' && turnIdRaw.trim() ? turnIdRaw.trim() : undefined;
  const limit = parsePositiveInt(limitRaw, 300);

  const data = await listAgentEntries({
    sessionId,
    turnId,
    limit,
  });

  return c.json({ data, total: data.length });
});

agentRoutes.get('/sessions/:id/outputs', async (c) => {
  const sessionId = c.req.param('id');
  const turnIdRaw = c.req.query('turnId');
  const kindRaw = c.req.query('kind');
  const kind = kindRaw === 'photo' || kindRaw === 'copy' ? kindRaw : undefined;
  const turnId =
    typeof turnIdRaw === 'string' && turnIdRaw.trim() ? turnIdRaw.trim() : undefined;

  const data = await listAgentOutputs({ sessionId, kind, turnId });
  return c.json({ data, total: data.length });
});
