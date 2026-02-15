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
import type { AgentRuntime, AgentRuntimeEvent } from './agent-runtime';
import { createCodingAgentRuntime } from './coding-agent-runtime';

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

export class RuntimeRouter {
  private readonly runtimeBySession = new Map<string, RuntimeHolder>();
  private readonly skillsPath: string;

  constructor(options: RuntimeRouterOptions) {
    this.skillsPath = options.skillsPath;
  }

  async runTurn(
    sessionId: string,
    turnId: string,
    text: string,
    onEvent: (event: AgentRuntimeEvent) => Promise<void> | void,
  ): Promise<void> {
    const runtime = await this.ensureRuntime(sessionId);

    await setAgentSessionStatus(sessionId, 'running');
    await touchAgentSessionTurn(sessionId);

    try {
      await runtime.runTurn({
        turnId,
        text,
        onEvent,
      });
      await this.setStatusIfNotAborted(sessionId, 'idle');
    } catch (error) {
      await this.setStatusIfNotAborted(sessionId, 'failed');
      throw error;
    }
  }

  async steer(sessionId: string, text: string): Promise<void> {
    const runtime = await this.ensureRuntime(sessionId);
    await runtime.steer(text);
  }

  async followUp(sessionId: string, text: string): Promise<void> {
    const runtime = await this.ensureRuntime(sessionId);
    await runtime.followUp(text);
  }

  async abort(sessionId: string): Promise<void> {
    const runtime = await this.ensureRuntime(sessionId);
    await runtime.abort();
    await setAgentSessionStatus(sessionId, 'aborted');
  }

  async isRunning(sessionId: string): Promise<boolean> {
    const runtime = await this.ensureRuntime(sessionId);
    return runtime.isRunning();
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
