import { Agent, type AgentMessage } from '@mariozechner/pi-agent-core';
import type { Message, Model } from '@mariozechner/pi-ai';
import type {
  AgentRuntime,
  AgentRuntimeEvent,
  AgentRuntimeTurnInput,
} from './agent-runtime';
import {
  createPhotoCopyToolDefinitions,
  type RuntimeProviderLike,
} from '../extensions/photo-copy-extension';
import { createResourceToolDefinitions } from '../extensions/resource-extension';
import { toAgentCoreTools } from '../extensions/tool-definitions';

interface CreateAgentCoreRuntimeInput {
  sessionId: string;
  provider: RuntimeProviderLike;
}

const AGENT_SYSTEM_PROMPT = [
  '你是摄影与营销协作 Agent。',
  '用户要求生图时，必须优先调用 photo_compose_prompt -> photo_enqueue_generation -> photo_get_generation_status，不能只做文字解释。',
  '用户要求文案时，优先调用 copy_generate_variants 或 copy_rewrite_by_tone。',
  '需要资源上下文时，优先调用 resource_search_scenes/resource_search_models/resource_get_project_context。',
  '输出保持中文，并明确给出可追踪 ID（taskId、artifactId 等）。',
].join('\n');

function nowIso(): string {
  return new Date().toISOString();
}

function toLlmMessages(messages: AgentMessage[]): Message[] {
  return messages.flatMap((message) => {
    if (!message || typeof message !== 'object') return [];
    const row = message as { role?: string };
    if (row.role === 'user' || row.role === 'assistant' || row.role === 'toolResult') {
      return [message as Message];
    }
    return [];
  });
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const row = message as { content?: unknown };
  if (!Array.isArray(row.content)) return '';
  return row.content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const block = item as { type?: string; text?: string };
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
      return '';
    })
    .join('')
    .trim();
}

function extractQueuedMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const row = message as { content?: unknown };
  if (typeof row.content === 'string') return row.content;
  if (!Array.isArray(row.content)) return '';
  return row.content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const block = item as { type?: string; text?: string };
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
      return '';
    })
    .join('')
    .trim();
}

function buildModel(provider: RuntimeProviderLike): Model<any> {
  const isGemini = provider.format === 'gemini';
  return {
    id: provider.textModel,
    name: provider.textModel,
    api: isGemini ? 'google-generative-ai' : 'openai-completions',
    provider: provider.id,
    baseUrl: provider.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

export class AgentCoreRuntime implements AgentRuntime {
  readonly engine = 'agent-core' as const;

  private readonly sessionIdValue: string;
  private readonly provider: RuntimeProviderLike;
  private readonly agent: Agent;
  private running = false;
  private currentTurnId: string | null = null;
  private turnSink: ((event: AgentRuntimeEvent) => Promise<void> | void) | null = null;
  private unsub?: () => void;

  private constructor(input: {
    sessionId: string;
    provider: RuntimeProviderLike;
    agent: Agent;
  }) {
    this.sessionIdValue = input.sessionId;
    this.provider = input.provider;
    this.agent = input.agent;
  }

  static async create(input: CreateAgentCoreRuntimeInput): Promise<AgentCoreRuntime> {
    const model = buildModel(input.provider);
    let runtimeRef: AgentCoreRuntime | null = null;

    const resourceTools = createResourceToolDefinitions({
      sessionId: input.sessionId,
    });

    const photoCopyTools = await createPhotoCopyToolDefinitions({
      sessionId: input.sessionId,
      getProvider: async () => input.provider,
      emitRuntimeEvent: async (type, payload) => {
        if (!runtimeRef) return;
        await runtimeRef.emit({ type: type as AgentRuntimeEvent['type'], payload });
      },
    });

    const tools = toAgentCoreTools([...resourceTools, ...photoCopyTools]);

    const agent = new Agent({
      initialState: {
        model,
        thinkingLevel: 'off',
        systemPrompt: AGENT_SYSTEM_PROMPT,
        tools,
      },
      convertToLlm: toLlmMessages,
      getApiKey: async () => input.provider.apiKey,
      steeringMode: 'one-at-a-time',
      followUpMode: 'one-at-a-time',
    });

    const runtime = new AgentCoreRuntime({
      sessionId: input.sessionId,
      provider: input.provider,
      agent,
    });

    runtimeRef = runtime;
    runtime.bindEvents();
    return runtime;
  }

  get sessionId(): string {
    return this.sessionIdValue;
  }

  isRunning(): boolean {
    return this.running;
  }

  async runTurn(input: AgentRuntimeTurnInput): Promise<void> {
    if (this.running) {
      throw new Error('当前会话已有执行中的 turn。');
    }

    this.running = true;
    this.currentTurnId = input.turnId;
    this.turnSink = input.onEvent;

    const activeTools = this.agent.state.tools.map((tool) => tool.name);

    await this.emit({
      type: 'turn.started',
      payload: {
        engine: this.engine,
        providerId: this.provider.id,
        model: this.provider.textModel,
        activeTools,
      },
    });

    try {
      await this.agent.prompt(input.text);
      await this.emit({
        type: 'turn.completed',
        payload: { engine: this.engine },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.emit({
        type: 'turn.failed',
        payload: { message },
      });
      throw error;
    } finally {
      this.running = false;
      this.currentTurnId = null;
      this.turnSink = null;
    }
  }

  async steer(text: string): Promise<void> {
    this.agent.steer({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    await this.emit({
      type: 'queue.updated',
      payload: {
        mode: 'steer',
        text,
      },
    });
  }

  async followUp(text: string): Promise<void> {
    this.agent.followUp({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    await this.emit({
      type: 'queue.updated',
      payload: {
        mode: 'follow-up',
        text,
      },
    });
  }

  async promoteFollowUpToSteer(
    text: string,
    queueIndex?: number,
  ): Promise<boolean> {
    const agentAny = this.agent as any;
    const steeringQueue = Array.isArray(agentAny?.steeringQueue)
      ? [...(agentAny.steeringQueue as unknown[])]
      : [];
    const followUpQueue = Array.isArray(agentAny?.followUpQueue)
      ? [...(agentAny.followUpQueue as unknown[])]
      : [];

    if (typeof agentAny?.clearAllQueues === 'function') {
      agentAny.clearAllQueues();
    }

    let removed = false;
    let removeIndex = -1;

    if (
      typeof queueIndex === 'number' &&
      Number.isInteger(queueIndex) &&
      queueIndex >= 0 &&
      queueIndex < followUpQueue.length &&
      extractQueuedMessageText(followUpQueue[queueIndex]) === text
    ) {
      removeIndex = queueIndex;
      removed = true;
    } else {
      removeIndex = followUpQueue.findIndex(
        (message) => extractQueuedMessageText(message) === text,
      );
      removed = removeIndex >= 0;
    }

    const remainingFollowUps = followUpQueue.filter(
      (_message, index) => index !== removeIndex,
    );

    for (const message of steeringQueue) {
      this.agent.steer(message as any);
    }

    for (const message of remainingFollowUps) {
      this.agent.followUp(message as any);
    }

    await this.steer(text);
    return removed;
  }

  async abort(): Promise<void> {
    this.agent.abort();
    await this.emit({
      type: 'session.aborted',
      payload: {
        reason: 'manual',
      },
    });
  }

  async dispose(): Promise<void> {
    if (this.unsub) {
      this.unsub();
      this.unsub = undefined;
    }
  }

  private bindEvents(): void {
    this.unsub = this.agent.subscribe(async (event: any) => {
      if (event?.type === 'message_update') {
        const assistantEvent = event.assistantMessageEvent as
          | { type?: string; delta?: string }
          | undefined;

        if (assistantEvent?.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
          await this.emit({
            type: 'assistant.delta',
            payload: {
              delta: assistantEvent.delta,
            },
          });
        }
        return;
      }

      if (event?.type === 'message_end' && event?.message?.role === 'assistant') {
        const text = extractAssistantText(event.message);
        await this.emit({
          type: 'assistant.completed',
          payload: {
            text,
          },
        });
      }
    });
  }

  private async emit(input: {
    type: AgentRuntimeEvent['type'];
    payload: unknown;
  }): Promise<void> {
    if (!this.turnSink) return;

    await this.turnSink({
      type: input.type,
      payload: input.payload,
      sessionId: this.sessionIdValue,
      turnId: this.currentTurnId,
      timestamp: nowIso(),
    });
  }
}

export async function createAgentCoreRuntime(
  input: CreateAgentCoreRuntimeInput,
): Promise<AgentRuntime> {
  return AgentCoreRuntime.create(input);
}
