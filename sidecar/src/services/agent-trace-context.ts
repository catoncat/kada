import { AsyncLocalStorage } from 'node:async_hooks';

export interface AgentTraceContextValue {
  traceId: string;
  requestId: string;
  clientMessageId?: string | null;
  sessionId?: string | null;
  turnId?: string | null;
}

const traceContextStorage = new AsyncLocalStorage<AgentTraceContextValue>();

export function runWithAgentTraceContext<T>(
  value: AgentTraceContextValue,
  fn: () => T,
): T {
  return traceContextStorage.run(value, fn);
}

export function getAgentTraceContext(): AgentTraceContextValue | null {
  return traceContextStorage.getStore() ?? null;
}

export function setAgentTraceContext(
  patch: Partial<AgentTraceContextValue>,
): void {
  const current = traceContextStorage.getStore();
  if (!current) return;
  traceContextStorage.enterWith({
    ...current,
    ...patch,
  });
}

export function withAgentTraceContext<T>(
  patch: Partial<AgentTraceContextValue>,
  fn: () => T,
): T {
  const current = traceContextStorage.getStore();
  if (!current) {
    return fn();
  }

  return traceContextStorage.run(
    {
      ...current,
      ...patch,
    },
    fn,
  );
}
