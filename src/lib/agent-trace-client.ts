import { apiUrl } from '@/lib/api-config';

export type AgentClientTraceChannel = 'ui' | 'network' | 'sse' | 'render';
export type AgentClientTraceLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AgentClientTraceEvent {
  traceId: string;
  sessionId?: string | null;
  turnId?: string | null;
  clientMessageId?: string | null;
  channel: AgentClientTraceChannel;
  event: string;
  level?: AgentClientTraceLevel;
  at?: number;
  data?: Record<string, unknown>;
}

const MAX_RING_BUFFER = 500;
const MAX_STORAGE_BUFFER = 200;
const FLUSH_BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 1200;
const STORAGE_KEY = 'agent_trace_client_queue_v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function normalizeTraceEvent(input: AgentClientTraceEvent): AgentClientTraceEvent {
  return {
    traceId: input.traceId,
    sessionId: input.sessionId ?? null,
    turnId: input.turnId ?? null,
    clientMessageId: input.clientMessageId ?? null,
    channel: input.channel,
    event: input.event,
    level: input.level ?? 'info',
    at: typeof input.at === 'number' && Number.isFinite(input.at)
      ? Math.floor(input.at)
      : Date.now(),
    data: input.data ?? {},
  };
}

function readStorageQueue(): AgentClientTraceEvent[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => normalizeTraceEvent(item as AgentClientTraceEvent));
  } catch {
    return [];
  }
}

function writeStorageQueue(events: AgentClientTraceEvent[]): void {
  if (!isBrowser()) return;

  try {
    if (events.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    const compact = events.slice(-MAX_STORAGE_BUFFER);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // ignore storage failures
  }
}

class AgentTraceClient {
  private queue: AgentClientTraceEvent[] = [];
  private timer: number | null = null;
  private flushing = false;
  private hydrated = false;

  log(input: AgentClientTraceEvent): void {
    if (!isBrowser()) return;
    if (!input.traceId || !input.event) return;

    this.hydrateOnce();

    this.queue.push(normalizeTraceEvent(input));
    if (this.queue.length > MAX_RING_BUFFER) {
      this.queue.splice(0, this.queue.length - MAX_RING_BUFFER);
    }

    writeStorageQueue(this.queue);
    this.scheduleFlush();
  }

  async flushNow(): Promise<void> {
    this.hydrateOnce();
    await this.flush();
  }

  private hydrateOnce(): void {
    if (this.hydrated) return;
    this.hydrated = true;

    const stored = readStorageQueue();
    if (stored.length === 0) return;

    this.queue.push(...stored);
    if (this.queue.length > MAX_RING_BUFFER) {
      this.queue.splice(0, this.queue.length - MAX_RING_BUFFER);
    }

    writeStorageQueue(this.queue);
  }

  private scheduleFlush(): void {
    if (!isBrowser()) return;
    if (this.timer != null) return;

    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.queue.length === 0) {
      writeStorageQueue([]);
      return;
    }

    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, FLUSH_BATCH_SIZE);
        const res = await fetch(apiUrl('/api/agent/traces/client-batch'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-agent-trace-id': batch[0]?.traceId || '',
          },
          body: JSON.stringify({ events: batch }),
          keepalive: true,
        });

        if (!res.ok) {
          writeStorageQueue(this.queue);
          this.scheduleFlush();
          break;
        }

        this.queue.splice(0, batch.length);
        writeStorageQueue(this.queue);
      }
    } catch {
      writeStorageQueue(this.queue);
      this.scheduleFlush();
    } finally {
      this.flushing = false;
    }
  }
}

export const agentTraceClient = new AgentTraceClient();
