import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import type { Model } from '@mariozechner/pi-ai';
import { createPhotoCopyExtension, type RuntimeProviderLike } from '../extensions/photo-copy-extension';
import { createResourceExtension } from '../extensions/resource-extension';
import type {
  AgentRuntime,
  AgentRuntimeEvent,
  AgentRuntimeTurnInput,
} from './agent-runtime';

interface CreateCodingRuntimeInput {
  sessionId: string;
  provider: RuntimeProviderLike;
  skillsPath: string;
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

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const row = message as { content?: unknown };
  if (!Array.isArray(row.content)) return '';
  return row.content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const content = item as { type?: string; text?: string };
      if (content.type === 'text' && typeof content.text === 'string') return content.text;
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

export class CodingAgentRuntime implements AgentRuntime {
  readonly engine = 'coding-agent' as const;

  private readonly sessionIdValue: string;
  private readonly provider: RuntimeProviderLike;
  private readonly agentSession: AgentSession;
  private running = false;
  private currentTurnId: string | null = null;
  private turnSink: ((event: AgentRuntimeEvent) => Promise<void> | void) | null = null;
  private unsub?: () => void;

  private constructor(input: {
    sessionId: string;
    provider: RuntimeProviderLike;
    agentSession: AgentSession;
  }) {
    this.sessionIdValue = input.sessionId;
    this.provider = input.provider;
    this.agentSession = input.agentSession;
  }

  static async create(input: CreateCodingRuntimeInput): Promise<CodingAgentRuntime> {
    const model = buildModel(input.provider);

    const authStorage = new AuthStorage();
    authStorage.setRuntimeApiKey(input.provider.id, input.provider.apiKey);

    const settingsManager = SettingsManager.inMemory({
      steeringMode: 'one-at-a-time',
      followUpMode: 'one-at-a-time',
      compaction: {
        enabled: false,
      },
      retry: {
        enabled: true,
        maxRetries: 2,
        baseDelayMs: 500,
        maxDelayMs: 10000,
      },
    });

    let runtimeRef: CodingAgentRuntime | null = null;

    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      settingsManager,
      systemPrompt: AGENT_SYSTEM_PROMPT,
      additionalSkillPaths: [input.skillsPath],
      extensionFactories: [
        createResourceExtension({ sessionId: input.sessionId }),
        createPhotoCopyExtension({
          sessionId: input.sessionId,
          getProvider: async () => input.provider,
          emitRuntimeEvent: async (type, payload) => {
            if (!runtimeRef) return;
            await runtimeRef.emit({ type: type as AgentRuntimeEvent['type'], payload });
          },
        }),
      ],
    });

    await resourceLoader.reload();

    const { session } = await createAgentSession({
      model,
      thinkingLevel: 'off',
      authStorage,
      settingsManager,
      sessionManager: SessionManager.inMemory(process.cwd()),
      resourceLoader,
      tools: [],
      scopedModels: [{ model, thinkingLevel: 'off' }],
    });

    const runtime = new CodingAgentRuntime({
      sessionId: input.sessionId,
      provider: input.provider,
      agentSession: session,
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

    const activeTools = this.agentSession.getActiveToolNames();
    const allTools = this.agentSession.getAllTools().map((tool) => tool.name);

    await this.emit({
      type: 'turn.started',
      payload: {
        engine: this.engine,
        providerId: this.provider.id,
        model: this.provider.textModel,
        activeTools,
        allTools,
      },
    });

    try {
      await this.agentSession.prompt(input.text);
      await this.emit({
        type: 'turn.completed',
        payload: {
          engine: this.engine,
        },
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
    await this.agentSession.steer(text);

    await this.emit({
      type: 'queue.updated',
      payload: {
        mode: 'steer',
        text,
      },
    });
  }

  async followUp(text: string): Promise<void> {
    await this.agentSession.followUp(text);

    await this.emit({
      type: 'queue.updated',
      payload: {
        mode: 'follow-up',
        text,
      },
    });
  }

  async abort(): Promise<void> {
    await this.agentSession.abort();
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
    this.agentSession.dispose();
  }

  private bindEvents(): void {
    this.unsub = this.agentSession.subscribe(async (event: any) => {
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
        const message = event.message as
          | { stopReason?: string; errorMessage?: string; usage?: unknown }
          | undefined;
        await this.emit({
          type: 'assistant.completed',
          payload: {
            text,
            stopReason: message?.stopReason || null,
            errorMessage: message?.errorMessage || null,
            usage: message?.usage || null,
          },
        });
        return;
      }

      if (event?.type === 'tool_execution_start') {
        await this.emit({
          type: 'tool.call',
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          },
        });
        return;
      }

      if (event?.type === 'tool_execution_update') {
        await this.emit({
          type: 'tool.progress',
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            partialResult: event.partialResult,
          },
        });
        return;
      }

      if (event?.type === 'tool_execution_end') {
        await this.emit({
          type: 'tool.result',
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result,
            isError: Boolean(event.isError),
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

export async function createCodingAgentRuntime(
  input: CreateCodingRuntimeInput,
): Promise<AgentRuntime> {
  return CodingAgentRuntime.create(input);
}
