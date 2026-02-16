export type AgentRuntimeEngine = 'coding-agent' | 'agent-core';

export type AgentRuntimeEventType =
  | 'turn.started'
  | 'assistant.delta'
  | 'assistant.completed'
  | 'tool.call'
  | 'tool.progress'
  | 'tool.result'
  | 'photo.task.created'
  | 'photo.task.updated'
  | 'photo.ready'
  | 'copy.ready'
  | 'queue.updated'
  | 'turn.completed'
  | 'turn.failed'
  | 'session.aborted';

export interface AgentRuntimeEvent {
  type: AgentRuntimeEventType;
  sessionId: string;
  turnId?: string | null;
  timestamp: string;
  payload: unknown;
}

export interface AgentRuntimeTurnInput {
  turnId: string;
  text: string;
  onEvent: (event: AgentRuntimeEvent) => Promise<void> | void;
}

export interface AgentRuntime {
  readonly engine: AgentRuntimeEngine;
  readonly sessionId: string;

  runTurn(input: AgentRuntimeTurnInput): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  promoteFollowUpToSteer?(text: string, queueIndex?: number): Promise<boolean>;
  abort(): Promise<void>;
  isRunning(): boolean;
  dispose(): Promise<void>;
}
