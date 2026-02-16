import {
  AuthStorage,
  createBashTool,
  createAgentSession,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import type { Model } from '@mariozechner/pi-ai';
import { createPhotoCopyExtension, type RuntimeProviderLike } from '../extensions/photo-copy-extension';
import { createResourceExtension } from '../extensions/resource-extension';
import { appendTraceLog } from '../../services/agent-trace-store';
import type {
  AgentRuntime,
  AgentRuntimeEvent,
  AgentRuntimeQueueMessageInput,
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

function extractUsageTotalTokens(usage: unknown): number | null {
  if (!usage || typeof usage !== 'object') return null;
  const row = usage as Record<string, unknown>;

  const direct = row.totalTokens ?? row.total_tokens;
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }

  const output = row.outputTokens ?? row.output_tokens;
  const input = row.inputTokens ?? row.input_tokens;
  if (
    typeof output === 'number' &&
    Number.isFinite(output) &&
    typeof input === 'number' &&
    Number.isFinite(input)
  ) {
    return output + input;
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function scalarToText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function pickScalarLines(source: Record<string, unknown>, keys: string[]): string[] {
  const lines: string[] = [];
  for (const key of keys) {
    const value = scalarToText(source[key]);
    if (!value) continue;
    lines.push(`${key}: ${value}`);
  }
  return lines;
}

function clipText(value: string, maxLength: number): string {
  const text = value.trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function parseJsonString(value: unknown): unknown | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstNonEmptyLine(value: string): string {
  const line = value
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line || '';
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return value.slice(0, 8);
}

function getToolResultText(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    const row = toRecord(item);
    if (typeof row.text === 'string' && row.text.trim()) {
      return row.text.trim();
    }
  }
  if (typeof result.message === 'string' && result.message.trim()) {
    return result.message.trim();
  }
  return '';
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function buildToolResultReadablePayload(input: {
  toolName: string;
  result: unknown;
  isError: boolean;
}): { summary: string; readableDetail: string } {
  const toolName = input.toolName.trim() || 'tool';
  const result = toRecord(input.result);
  const details = toRecord(result.details);
  const textOutput = getToolResultText(result);
  const parsedText = toRecord(parseJsonString(textOutput));
  const merged = { ...parsedText, ...details };

  if (
    (toolName === 'photo_enqueue_generation' ||
      toolName === 'photo_get_generation_status') &&
    typeof merged.status === 'string'
  ) {
    const taskSuffix =
      typeof merged.taskId === 'string' && merged.taskId.trim()
        ? ` ${shortId(merged.taskId)}`
        : '';
    const summary = clipText(`${merged.status}${taskSuffix}`, 120) || toolName;
    const detailLines = pickScalarLines(merged, [
      'status',
      'taskId',
      'providerId',
      'updatedAt',
      'error',
      'message',
    ]);
    if (detailLines.length > 0) {
      return {
        summary,
        readableDetail: clipText(detailLines.join('\n'), 1600),
      };
    }
  }

  if (toolName === 'copy_generate_variants' && textOutput) {
    const titleLine = textOutput
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('标题：'));
    const summary = clipText(titleLine || firstNonEmptyLine(textOutput), 120) || toolName;
    const detail = clipText(
      textOutput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 16)
        .join('\n'),
      1800,
    );
    return {
      summary,
      readableDetail: detail || summary,
    };
  }

  if (textOutput) {
    const parsed = parseJsonString(textOutput);
    const parsedLines = pickScalarLines(toRecord(parsed), [
      'status',
      'taskId',
      'providerId',
      'updatedAt',
      'error',
      'message',
    ]);

    if (parsedLines.length > 0) {
      return {
        summary: clipText(firstNonEmptyLine(textOutput), 120) || toolName,
        readableDetail: clipText(parsedLines.join('\n'), 1500),
      };
    }

    return {
      summary: clipText(firstNonEmptyLine(textOutput), 120) || toolName,
      readableDetail: clipText(textOutput, 1800),
    };
  }

  const detailsLines = pickScalarLines(details, [
    'status',
    'taskId',
    'providerId',
    'updatedAt',
    'error',
    'message',
  ]);
  if (detailsLines.length > 0) {
    return {
      summary: clipText(detailsLines[0], 120) || toolName,
      readableDetail: clipText(detailsLines.join('\n'), 1600),
    };
  }

  const jsonFallback = toPrettyJson(result);
  return {
    summary: input.isError ? `${toolName} 失败` : toolName,
    readableDetail: clipText(jsonFallback || toolName, 1800),
  };
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
  private waitingForTurnPromptStart = false;
  private pendingById = new Map<string, PendingQueueItem>();
  private steeringQueueIds: string[] = [];
  private followUpQueueIds: string[] = [];
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
    const cwd = process.cwd();
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
      cwd,
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

    const tools = [
      createReadTool(cwd),
      createBashTool(cwd),
      createEditTool(cwd),
      createWriteTool(cwd),
      createGrepTool(cwd),
      createFindTool(cwd),
      createLsTool(cwd),
    ];

    const { session } = await createAgentSession({
      cwd,
      model,
      thinkingLevel: 'off',
      authStorage,
      settingsManager,
      sessionManager: SessionManager.inMemory(cwd),
      resourceLoader,
      tools,
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
    this.waitingForTurnPromptStart = true;

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
      this.waitingForTurnPromptStart = false;
      this.clearPendingQueue();
    }
  }

  async steer(input: AgentRuntimeQueueMessageInput): Promise<void> {
    const item = this.buildPendingItem('steer', input);
    this.putPending(item, 'append');
    await this.agentSession.steer(item.runtimeText);

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
    await this.agentSession.followUp(item.runtimeText);

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
    await this.rebuildUnderlyingQueue();

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
    await this.agentSession.abort();
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
    this.agentSession.dispose();
  }

  private bindEvents(): void {
    this.unsub = this.agentSession.subscribe(async (event: any) => {
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
        const message = event.message as
          | { stopReason?: string; errorMessage?: string; usage?: unknown }
          | undefined;
        const stopReason = message?.stopReason || null;
        const errorMessage = message?.errorMessage || null;
        const usage = message?.usage || null;
        const totalTokens = extractUsageTotalTokens(usage);
        const textLen = text.length;

        await this.emit({
          type: 'assistant.completed',
          payload: {
            text,
            stopReason,
            errorMessage,
            usage,
          },
        });

        await appendTraceLog({
          sessionId: this.sessionIdValue,
          turnId: this.currentTurnId,
          channel: 'runtime',
          event: 'runtime.assistant.completed',
          data: {
            stopReason,
            errorMessage,
            textLen,
            usage,
            totalTokens,
          },
        });

        if (
          stopReason === 'stop' &&
          textLen === 0 &&
          (totalTokens ?? 0) === 0
        ) {
          await appendTraceLog({
            sessionId: this.sessionIdValue,
            turnId: this.currentTurnId,
            channel: 'runtime',
            event: 'runtime.assistant.empty_stop_detected',
            level: 'warn',
            data: {
              stopReason,
              textLen,
              totalTokens: totalTokens ?? 0,
            },
          });
        }
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
        const toolName = typeof event.toolName === 'string' ? event.toolName : '';
        const readable = buildToolResultReadablePayload({
          toolName,
          result: event.result,
          isError: Boolean(event.isError),
        });
        await this.emit({
          type: 'tool.result',
          payload: {
            toolCallId: event.toolCallId,
            toolName,
            result: event.result,
            isError: Boolean(event.isError),
            summary: readable.summary,
            readableDetail: readable.readableDetail,
            readableVersion: 1,
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

  private async rebuildUnderlyingQueue(): Promise<void> {
    const clearQueue = (this.agentSession as any)?.clearQueue;
    if (typeof clearQueue === 'function') {
      clearQueue.call(this.agentSession);
    }

    for (const id of this.steeringQueueIds) {
      const item = this.pendingById.get(id);
      if (!item) continue;
      await this.agentSession.steer(item.runtimeText);
    }

    for (const id of this.followUpQueueIds) {
      const item = this.pendingById.get(id);
      if (!item) continue;
      await this.agentSession.followUp(item.runtimeText);
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

export async function createCodingAgentRuntime(
  input: CreateCodingRuntimeInput,
): Promise<AgentRuntime> {
  return CodingAgentRuntime.create(input);
}
