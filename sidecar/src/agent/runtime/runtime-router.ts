import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { providers } from '../../db/schema';
import {
  getAgentSessionRecord,
  setAgentSessionStatus,
  touchAgentSessionTurn,
  type AgentEngine,
} from '../../services/agent-session-store';
import { createAgentCoreRuntime } from './agent-core-runtime';
import type {
  AgentRuntime,
  AgentRuntimeEvent,
  AgentRuntimeQueueMessageInput,
} from './agent-runtime';
import { createCodingAgentRuntime } from './coding-agent-runtime';
import { appendTraceLog } from '../../services/agent-trace-store';

interface RuntimeHolder {
  runtime: AgentRuntime;
  engine: AgentEngine;
}

export interface RuntimeRouterOptions {
  skillsPath: string;
}

interface ProviderRuntimeShape {
  id: string;
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function toIsoTimestamp(value: unknown, fallback: string): string {
  const raw = toNonEmptyString(value);
  if (!raw) return fallback;
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return fallback;
  return new Date(time).toISOString();
}

export function normalizeRuntimeEvent(input: {
  event: AgentRuntimeEvent;
  engine: AgentEngine;
  sessionId: string;
  fallbackTurnId: string;
  fallbackTimestamp?: string;
}): AgentRuntimeEvent {
  const fallbackTimestamp = input.fallbackTimestamp || new Date().toISOString();
  const payload = toRecord(input.event.payload);
  const turnId =
    toNonEmptyString(input.event.turnId) || input.fallbackTurnId;
  const timestamp = toIsoTimestamp(input.event.timestamp, fallbackTimestamp);

  const base = {
    type: input.event.type,
    sessionId: input.sessionId,
    turnId,
    timestamp,
  } as const;

  switch (input.event.type) {
    case 'turn.started': {
      return {
        ...base,
        payload: {
          ...payload,
          engine: toNonEmptyString(payload.engine) || input.engine,
          providerId: toNonEmptyString(payload.providerId),
          model: toNonEmptyString(payload.model),
          activeTools: toStringArray(payload.activeTools),
        },
      };
    }
    case 'assistant.delta': {
      return {
        ...base,
        payload: {
          ...payload,
          delta: toNonEmptyString(payload.delta) || '',
        },
      };
    }
    case 'assistant.completed': {
      return {
        ...base,
        payload: {
          ...payload,
          text: toNonEmptyString(payload.text) || '',
          stopReason: toNonEmptyString(payload.stopReason),
          errorMessage:
            toNonEmptyString(payload.errorMessage) ||
            toNonEmptyString(payload.message),
          usage: payload.usage ?? null,
        },
      };
    }
    case 'tool.call': {
      return {
        ...base,
        payload: {
          ...payload,
          toolCallId: toNonEmptyString(payload.toolCallId),
          toolName: toNonEmptyString(payload.toolName),
        },
      };
    }
    case 'tool.progress': {
      return {
        ...base,
        payload: {
          ...payload,
          toolCallId: toNonEmptyString(payload.toolCallId),
          toolName: toNonEmptyString(payload.toolName),
        },
      };
    }
    case 'tool.result': {
      return {
        ...base,
        payload: {
          ...payload,
          toolCallId: toNonEmptyString(payload.toolCallId),
          toolName: toNonEmptyString(payload.toolName),
          isError: Boolean(payload.isError),
        },
      };
    }
    case 'queue.updated': {
      const mode = toNonEmptyString(payload.mode) === 'steer' ? 'steer' : 'follow-up';
      return {
        ...base,
        payload: {
          ...payload,
          queueAction: toNonEmptyString(payload.queueAction) || 'queued',
          clientMessageId: toNonEmptyString(payload.clientMessageId),
          mode,
          text: toNonEmptyString(payload.text) || '',
          mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
          mentionDrops: Array.isArray(payload.mentionDrops)
            ? payload.mentionDrops
            : [],
          queuedAt: toNonEmptyString(payload.queuedAt),
          appliedAt: toNonEmptyString(payload.appliedAt),
          promotedFromFollowUp: Boolean(payload.promotedFromFollowUp),
        },
      };
    }
    case 'steer.applied':
    case 'followup.applied': {
      const mode =
        toNonEmptyString(payload.mode) ||
        (input.event.type === 'steer.applied' ? 'steer' : 'follow-up');
      return {
        ...base,
        payload: {
          ...payload,
          clientMessageId: toNonEmptyString(payload.clientMessageId),
          mode,
          text: toNonEmptyString(payload.text) || '',
          mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
          mentionDrops: Array.isArray(payload.mentionDrops)
            ? payload.mentionDrops
            : [],
          queuedAt: toNonEmptyString(payload.queuedAt),
          appliedAt: toNonEmptyString(payload.appliedAt) || timestamp,
          promotedFromFollowUp: Boolean(payload.promotedFromFollowUp),
        },
      };
    }
    case 'turn.completed': {
      return {
        ...base,
        payload: {
          ...payload,
          engine: toNonEmptyString(payload.engine) || input.engine,
        },
      };
    }
    case 'turn.failed': {
      return {
        ...base,
        payload: {
          ...payload,
          message: toNonEmptyString(payload.message) || '执行失败',
        },
      };
    }
    case 'session.aborted': {
      return {
        ...base,
        payload: {
          ...payload,
          reason: toNonEmptyString(payload.reason) || 'manual',
        },
      };
    }
    case 'tool.result.enhanced':
    case 'photo.task.created':
    case 'photo.task.updated':
    case 'photo.ready':
    case 'copy.ready': {
      return {
        ...base,
        payload: input.event.payload,
      };
    }
    default: {
      return {
        ...base,
        payload: input.event.payload,
      };
    }
  }
}

export class SessionRunningError extends Error {
  readonly code = 'SESSION_RUNNING';

  constructor(message = '当前会话已有执行中的 turn。') {
    super(message);
    this.name = 'SessionRunningError';
  }
}

export class RuntimeRouter {
  private readonly runtimeBySession = new Map<string, RuntimeHolder>();
  private readonly turnGateBySession = new Set<string>();
  private readonly skillsPath: string;

  constructor(options: RuntimeRouterOptions) {
    this.skillsPath = options.skillsPath;
  }

  tryAcquireTurnGate(sessionId: string): boolean {
    if (this.turnGateBySession.has(sessionId)) {
      return false;
    }
    this.turnGateBySession.add(sessionId);
    return true;
  }

  releaseTurnGate(sessionId: string): void {
    this.turnGateBySession.delete(sessionId);
  }

  async runTurn(input: {
    sessionId: string;
    turnId: string;
    text: string;
    onEvent: (event: AgentRuntimeEvent) => Promise<void> | void;
    beforeRun?: () => Promise<void>;
    gateAlreadyAcquired?: boolean;
  }): Promise<void> {
    const sessionId = input.sessionId;
    const gateAlreadyAcquired = input.gateAlreadyAcquired === true;

    if (!gateAlreadyAcquired && !this.tryAcquireTurnGate(sessionId)) {
      throw new SessionRunningError();
    }
    if (gateAlreadyAcquired && !this.turnGateBySession.has(sessionId)) {
      throw new Error(`turn gate not acquired for session: ${sessionId}`);
    }

    await appendTraceLog({
      sessionId,
      turnId: input.turnId,
      channel: 'runtime',
      event: 'runtime.turn.start',
      data: {
        textLen: input.text.length,
      },
    });

    try {
      const runtime = await this.ensureRuntime(sessionId);
      if (runtime.isRunning()) {
        throw new SessionRunningError();
      }

      if (input.beforeRun) {
        await input.beforeRun();
      }

      await setAgentSessionStatus(sessionId, 'running');
      await touchAgentSessionTurn(sessionId);

      try {
        const onEvent = async (event: AgentRuntimeEvent) => {
          const normalized = normalizeRuntimeEvent({
            event,
            engine: runtime.engine,
            sessionId,
            fallbackTurnId: input.turnId,
          });
          await input.onEvent(normalized);
        };

        await runtime.runTurn({
          turnId: input.turnId,
          text: input.text,
          onEvent,
        });

        await appendTraceLog({
          sessionId,
          turnId: input.turnId,
          channel: 'runtime',
          event: 'runtime.turn.end',
          data: {
            status: 'completed',
          },
        });
        await this.setStatusIfNotAborted(sessionId, 'idle');
      } catch (error) {
        await appendTraceLog({
          sessionId,
          turnId: input.turnId,
          channel: 'runtime',
          event: 'runtime.turn.failed',
          level: 'error',
          ok: false,
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        await this.setStatusIfNotAborted(sessionId, 'failed');
        throw error;
      }
    } finally {
      this.releaseTurnGate(sessionId);
    }
  }

  async steer(
    sessionId: string,
    input: AgentRuntimeQueueMessageInput,
  ): Promise<void> {
    await appendTraceLog({
      sessionId,
      clientMessageId: input.clientMessageId,
      channel: 'runtime',
      event: 'runtime.queue.steer',
      data: {
        textLen: input.text.length,
      },
    });

    const runtime = await this.ensureRuntime(sessionId);
    await runtime.steer(input);
  }

  async followUp(
    sessionId: string,
    input: AgentRuntimeQueueMessageInput,
  ): Promise<void> {
    await appendTraceLog({
      sessionId,
      clientMessageId: input.clientMessageId,
      channel: 'runtime',
      event: 'runtime.queue.follow_up',
      data: {
        textLen: input.text.length,
      },
    });

    const runtime = await this.ensureRuntime(sessionId);
    await runtime.followUp(input);
  }

  async promoteFollowUpToSteer(
    sessionId: string,
    input: {
      clientMessageId: string;
    },
  ): Promise<boolean> {
    const runtime = await this.ensureRuntime(sessionId);
    if (typeof runtime.promoteFollowUpToSteer === 'function') {
      return runtime.promoteFollowUpToSteer(input);
    }
    return false;
  }

  async abort(sessionId: string): Promise<void> {
    const runtime = await this.ensureRuntime(sessionId);
    await runtime.abort();
    await setAgentSessionStatus(sessionId, 'aborted');
    // Gate release must happen in runTurn() finally after the running turn fully exits.
  }

  async isRunning(sessionId: string): Promise<boolean> {
    if (this.turnGateBySession.has(sessionId)) {
      return true;
    }
    const holder = this.runtimeBySession.get(sessionId);
    if (holder) {
      return holder.runtime.isRunning();
    }
    return false;
  }

  async disposeSession(sessionId: string): Promise<void> {
    const holder = this.runtimeBySession.get(sessionId);
    if (!holder) return;
    await holder.runtime.dispose();
    this.runtimeBySession.delete(sessionId);
  }

  private async ensureRuntime(sessionId: string): Promise<AgentRuntime> {
    const existing = this.runtimeBySession.get(sessionId);
    if (existing) return existing.runtime;

    const session = await getAgentSessionRecord(sessionId);
    if (!session) {
      throw new Error(`Agent 会话不存在: ${sessionId}`);
    }

    const provider = await this.resolveProvider(session.providerId);
    const preferredEngine = session.engine;

    if (preferredEngine === 'agent-core') {
      const runtime = await createAgentCoreRuntime({
        sessionId,
        provider,
      });
      this.runtimeBySession.set(sessionId, {
        runtime,
        engine: 'agent-core',
      });
      return runtime;
    }

    try {
      const runtime = await createCodingAgentRuntime({
        sessionId,
        provider,
        skillsPath: this.skillsPath,
      });
      this.runtimeBySession.set(sessionId, {
        runtime,
        engine: 'coding-agent',
      });
      return runtime;
    } catch (error) {
      console.error('[Agent] coding-agent runtime init failed, fallback to agent-core:', error);

      const runtime = await createAgentCoreRuntime({
        sessionId,
        provider,
      });

      this.runtimeBySession.set(sessionId, {
        runtime,
        engine: 'agent-core',
      });
      return runtime;
    }
  }

  private async setStatusIfNotAborted(
    sessionId: string,
    status: 'idle' | 'failed',
  ): Promise<void> {
    const session = await getAgentSessionRecord(sessionId);
    if (!session || session.status === 'aborted') {
      return;
    }
    await setAgentSessionStatus(sessionId, status);
  }

  private async resolveProvider(providerId: string | null): Promise<ProviderRuntimeShape> {
    const db = getDb();

    const [provider] = providerId
      ? await db
          .select()
          .from(providers)
          .where(and(eq(providers.id, providerId)))
          .limit(1)
      : await db.select().from(providers).where(eq(providers.isDefault, true)).limit(1);

    if (!provider) {
      const [fallback] = await db.select().from(providers).limit(1);
      if (!fallback) {
        throw new Error('未配置 Provider，无法启动 Agent Runtime。');
      }
      return {
        id: fallback.id,
        format: fallback.format,
        baseUrl: fallback.baseUrl,
        apiKey: fallback.apiKey,
        textModel: fallback.textModel,
        imageModel: fallback.imageModel,
      };
    }

    return {
      id: provider.id,
      format: provider.format,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      textModel: provider.textModel,
      imageModel: provider.imageModel,
    };
  }
}
