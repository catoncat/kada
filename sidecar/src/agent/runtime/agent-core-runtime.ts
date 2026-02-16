import { Agent, type AgentMessage } from '@mariozechner/pi-agent-core';
import type { Message, Model } from '@mariozechner/pi-ai';
import type {
  AgentRuntime,
  AgentRuntimeEvent,
  AgentRuntimeQueueMessageInput,
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

type PendingQueueMode = 'steer' | 'follow-up';

interface PendingQueueItem {
  clientMessageId: string;
  mode: PendingQueueMode;
  text: string;
  runtimeText: string;
  mentions: unknown[];
  mentionDrops: Array<{ mentionId: string | null; reason: string }>;
  createdAt: string;
  promotedFromFollowUp: boolean;
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
  private waitingForTurnPromptStart = false;
  private pendingById = new Map<string, PendingQueueItem>();
  private steeringQueueIds: string[] = [];
  private followUpQueueIds: string[] = [];
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
    this.waitingForTurnPromptStart = true;

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
      this.waitingForTurnPromptStart = false;
      this.clearPendingQueue();
    }
  }

  async steer(input: AgentRuntimeQueueMessageInput): Promise<void> {
    const item = this.buildPendingItem('steer', input);
    this.putPending(item, 'append');
    this.agent.steer({
      role: 'user',
      content: item.runtimeText,
      timestamp: Date.now(),
    });

    await this.emit({
      type: 'queue.updated',
      payload: {
        queueAction: 'queued',
        clientMessageId: item.clientMessageId,
        mode: 'steer',
        text: item.text,
      },
    });
  }

  async followUp(input: AgentRuntimeQueueMessageInput): Promise<void> {
    const item = this.buildPendingItem('follow-up', input);
    this.putPending(item, 'append');
    this.agent.followUp({
      role: 'user',
      content: item.runtimeText,
      timestamp: Date.now(),
    });

    await this.emit({
      type: 'queue.updated',
      payload: {
        queueAction: 'queued',
        clientMessageId: item.clientMessageId,
        mode: 'follow-up',
        text: item.text,
      },
    });
  }

  async promoteFollowUpToSteer(input: {
    clientMessageId: string;
  }): Promise<boolean> {
    const clientMessageId = input.clientMessageId;
    const index = this.followUpQueueIds.findIndex((id) => id === clientMessageId);
    if (index < 0) {
      return false;
    }

    this.followUpQueueIds.splice(index, 1);
    const item = this.pendingById.get(clientMessageId);
    if (!item) {
      return false;
    }

    item.mode = 'steer';
    item.promotedFromFollowUp = true;
    this.steeringQueueIds = this.steeringQueueIds.filter((id) => id !== clientMessageId);
    this.steeringQueueIds.unshift(clientMessageId);
    this.rebuildUnderlyingQueue();

    await this.emit({
      type: 'queue.updated',
      payload: {
        queueAction: 'promoted',
        clientMessageId: item.clientMessageId,
        mode: 'steer',
        text: item.text,
        promotedFromFollowUp: true,
      },
    });

    return true;
  }

  async abort(): Promise<void> {
    this.agent.abort();
    this.clearPendingQueue();
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
      if (event?.type === 'message_start' && event?.message?.role === 'user') {
        if (this.waitingForTurnPromptStart) {
          this.waitingForTurnPromptStart = false;
          return;
        }

        const applied = this.consumeNextPending();
        if (applied) {
          await this.emit({
            type: applied.mode === 'steer' ? 'steer.applied' : 'followup.applied',
            payload: {
              clientMessageId: applied.clientMessageId,
              text: applied.text,
              mode: applied.mode,
              mentions: applied.mentions,
              mentionDrops: applied.mentionDrops,
              queuedAt: applied.createdAt,
              appliedAt: nowIso(),
              promotedFromFollowUp: applied.promotedFromFollowUp,
            },
          });
        }
        return;
      }

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

  private buildPendingItem(
    mode: PendingQueueMode,
    input: AgentRuntimeQueueMessageInput,
  ): PendingQueueItem {
    return {
      clientMessageId: input.clientMessageId,
      mode,
      text: input.text,
      runtimeText: input.runtimeText,
      mentions: Array.isArray(input.mentions) ? input.mentions : [],
      mentionDrops: Array.isArray(input.mentionDrops) ? input.mentionDrops : [],
      createdAt: nowIso(),
      promotedFromFollowUp: false,
    };
  }

  private putPending(
    item: PendingQueueItem,
    position: 'append' | 'prepend',
  ): void {
    if (this.pendingById.has(item.clientMessageId)) {
      return;
    }

    this.pendingById.set(item.clientMessageId, item);
    if (item.mode === 'steer') {
      if (position === 'prepend') {
        this.steeringQueueIds.unshift(item.clientMessageId);
      } else {
        this.steeringQueueIds.push(item.clientMessageId);
      }
      return;
    }
    this.followUpQueueIds.push(item.clientMessageId);
  }

  private consumeNextPending(): PendingQueueItem | null {
    const steerId = this.steeringQueueIds.shift();
    if (steerId) {
      return this.takePending(steerId);
    }

    const followUpId = this.followUpQueueIds.shift();
    if (followUpId) {
      return this.takePending(followUpId);
    }
    return null;
  }

  private takePending(clientMessageId: string): PendingQueueItem | null {
    const item = this.pendingById.get(clientMessageId);
    if (!item) return null;
    this.pendingById.delete(clientMessageId);
    return item;
  }

  private rebuildUnderlyingQueue(): void {
    const agentAny = this.agent as any;
    if (typeof agentAny?.clearAllQueues === 'function') {
      agentAny.clearAllQueues();
    }

    for (const id of this.steeringQueueIds) {
      const item = this.pendingById.get(id);
      if (!item) continue;
      this.agent.steer({
        role: 'user',
        content: item.runtimeText,
        timestamp: Date.now(),
      });
    }

    for (const id of this.followUpQueueIds) {
      const item = this.pendingById.get(id);
      if (!item) continue;
      this.agent.followUp({
        role: 'user',
        content: item.runtimeText,
        timestamp: Date.now(),
      });
    }
  }

  private clearPendingQueue(): void {
    this.pendingById.clear();
    this.steeringQueueIds = [];
    this.followUpQueueIds = [];
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
