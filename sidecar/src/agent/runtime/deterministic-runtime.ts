import type {
  AgentRuntime,
  AgentRuntimeEngine,
  AgentRuntimeEvent,
  AgentRuntimeQueueMessageInput,
  AgentRuntimeTurnInput,
} from './agent-runtime';

export const DETERMINISTIC_RUNTIME_PROVIDER_ID = '__bdd_deterministic__';

interface CreateDeterministicRuntimeInput {
  sessionId: string;
  engine: AgentRuntimeEngine;
  stepDelayMs?: number;
}

type QueueMode = 'steer' | 'follow-up';

interface QueueItem {
  clientMessageId: string;
  mode: QueueMode;
  text: string;
  runtimeText: string;
  mentions: unknown[];
  mentionDrops: Array<{ mentionId: string | null; reason: string }>;
  createdAt: string;
  promotedFromFollowUp: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildDeltaChunks(text: string): string[] {
  const normalized = text.trim() || '已收到你的请求';
  return [
    '好的，我已收到你的需求。',
    `正在处理：${normalized.slice(0, 30)}。`,
    '我会按当前会话上下文继续输出。',
    '已完成本轮响应。',
  ];
}

class DeterministicAgentRuntime implements AgentRuntime {
  readonly engine: AgentRuntimeEngine;
  readonly sessionId: string;

  private running = false;
  private currentTurnId: string | null = null;
  private turnSink: ((event: AgentRuntimeEvent) => Promise<void> | void) | null =
    null;
  private abortRequested = false;
  private readonly stepDelayMs: number;

  private pendingById = new Map<string, QueueItem>();
  private steeringQueueIds: string[] = [];
  private followUpQueueIds: string[] = [];

  constructor(input: CreateDeterministicRuntimeInput) {
    this.sessionId = input.sessionId;
    this.engine = input.engine;
    this.stepDelayMs =
      typeof input.stepDelayMs === 'number' && Number.isFinite(input.stepDelayMs)
        ? Math.max(10, Math.floor(input.stepDelayMs))
        : 120;
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
    this.abortRequested = false;

    await this.emit({
      type: 'turn.started',
      payload: {
        engine: this.engine,
        providerId: DETERMINISTIC_RUNTIME_PROVIDER_ID,
        model: 'bdd-deterministic-model',
        activeTools: [],
        allTools: [],
      },
    });

    const chunks = buildDeltaChunks(input.text);
    let outputText = '';

    try {
      for (const chunk of chunks) {
        if (this.abortRequested) break;

        outputText += chunk;
        await this.emit({
          type: 'assistant.delta',
          payload: {
            delta: chunk,
          },
        });

        await this.flushPendingQueue();
        await this.sleep(this.stepDelayMs);
      }

      if (!this.abortRequested) {
        await this.flushPendingQueue({ drainAll: true });
      }

      await this.emit({
        type: 'assistant.completed',
        payload: {
          text: outputText || '已完成响应。',
          stopReason: this.abortRequested ? 'aborted' : 'stop',
          errorMessage: null,
          usage: null,
        },
      });

      await this.emit({
        type: 'turn.completed',
        payload: {
          engine: this.engine,
          aborted: this.abortRequested,
        },
      });
    } finally {
      this.running = false;
      this.currentTurnId = null;
      this.turnSink = null;
      this.abortRequested = false;
      this.clearPendingQueue();
    }
  }

  async steer(input: AgentRuntimeQueueMessageInput): Promise<void> {
    const item = this.buildQueueItem('steer', input);
    this.putPending(item, 'append');

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
    const item = this.buildQueueItem('follow-up', input);
    this.putPending(item, 'append');

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
    const index = this.followUpQueueIds.findIndex(
      (id) => id === input.clientMessageId,
    );
    if (index < 0) {
      return false;
    }

    this.followUpQueueIds.splice(index, 1);
    const item = this.pendingById.get(input.clientMessageId);
    if (!item) {
      return false;
    }

    item.mode = 'steer';
    item.promotedFromFollowUp = true;
    this.steeringQueueIds = this.steeringQueueIds.filter(
      (id) => id !== input.clientMessageId,
    );
    this.steeringQueueIds.unshift(input.clientMessageId);

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
    this.abortRequested = true;
    this.clearPendingQueue();

    await this.emit({
      type: 'session.aborted',
      payload: {
        reason: 'manual',
      },
    });
  }

  async dispose(): Promise<void> {
    this.abortRequested = true;
    this.clearPendingQueue();
  }

  private async flushPendingQueue(input?: { drainAll?: boolean }): Promise<void> {
    const drainAll = input?.drainAll === true;

    do {
      const applied = this.consumeNextPending();
      if (!applied) return;

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
    } while (drainAll);
  }

  private buildQueueItem(
    mode: QueueMode,
    input: AgentRuntimeQueueMessageInput,
  ): QueueItem {
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

  private putPending(item: QueueItem, position: 'append' | 'prepend'): void {
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

  private consumeNextPending(): QueueItem | null {
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

  private takePending(clientMessageId: string): QueueItem | null {
    const item = this.pendingById.get(clientMessageId);
    if (!item) {
      return null;
    }

    this.pendingById.delete(clientMessageId);
    return item;
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
      sessionId: this.sessionId,
      turnId: this.currentTurnId,
      timestamp: nowIso(),
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export async function createDeterministicAgentRuntime(
  input: CreateDeterministicRuntimeInput,
): Promise<AgentRuntime> {
  return new DeterministicAgentRuntime(input);
}
