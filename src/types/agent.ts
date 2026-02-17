export type AgentEngine = 'coding-agent' | 'agent-core';
export type AgentSessionStatus = 'idle' | 'running' | 'failed' | 'aborted';
export type AgentMentionKind = 'project' | 'scene' | 'model' | 'image';
export type AgentApiErrorCode =
  | 'INVALID_PAYLOAD'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ARCHIVED'
  | 'SESSION_RUNNING'
  | 'SESSION_NOT_RUNNING'
  | 'INTERNAL_ERROR';

export interface AgentMentionImageRef {
  id: string;
  kind: AgentMentionKind;
  resourceId: string;
  filePath: string;
  label?: string;
}

export interface AgentMention {
  mentionId: string;
  kind: AgentMentionKind;
  resourceId: string;
  resourceTitle: string;
  images?: AgentMentionImageRef[];
}

export interface AgentResourceSearchItem {
  kind: AgentMentionKind;
  id: string;
  title: string;
  subtitle: string;
  image: string | null;
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  engine: AgentEngine;
  status: AgentSessionStatus;
  archivedAt: string | null;
  providerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastTurnAt: string | null;
}

export interface AgentEntry {
  id: string;
  sessionId: string;
  turnId: string | null;
  entryType: string;
  parentEntryId: string | null;
  payload: unknown;
  createdAt: string | null;
}

export interface AgentOutput {
  id: string;
  sessionId: string;
  turnId: string | null;
  kind: 'photo' | 'copy';
  refId: string | null;
  content: unknown;
  createdAt: string | null;
}

export interface AgentSessionDetail extends AgentSessionSummary {
  entries: AgentEntry[];
  outputs: AgentOutput[];
  cursor: number;
}

export interface AgentCapabilities {
  autoFollowUpOnSessionRunning: boolean;
  queueAppliedEvent: boolean;
  externalEventBridge: boolean;
  toolResultEnhancement: boolean;
}

export interface AgentTurnStartedPayload {
  engine: AgentEngine | null;
  providerId: string | null;
  model: string | null;
  activeTools: string[];
  [key: string]: unknown;
}

export interface AgentAssistantCompletedPayload {
  text: string;
  stopReason: string | null;
  errorMessage: string | null;
  usage: unknown | null;
  [key: string]: unknown;
}

export interface AgentQueueUpdatedPayload {
  queueAction: string;
  clientMessageId: string | null;
  mode: 'steer' | 'follow-up';
  text: string;
  mentions?: unknown[];
  mentionDrops?: unknown[];
  queuedAt?: string | null;
  appliedAt?: string | null;
  promotedFromFollowUp?: boolean;
  [key: string]: unknown;
}

export interface AgentToolResultPayload {
  toolCallId: string | null;
  toolName: string | null;
  isError: boolean;
  result?: unknown;
  [key: string]: unknown;
}

export interface AgentSessionAbortedPayload {
  reason: string;
  [key: string]: unknown;
}

export type AgentTurnEventPayload =
  | AgentTurnStartedPayload
  | AgentAssistantCompletedPayload
  | AgentQueueUpdatedPayload
  | AgentToolResultPayload
  | AgentSessionAbortedPayload
  | Record<string, unknown>
  | null;

export interface AgentTurnEvent {
  type:
    | 'turn.started'
    | 'assistant.delta'
    | 'assistant.completed'
    | 'tool.call'
    | 'tool.progress'
    | 'tool.result'
    | 'tool.result.enhanced'
    | 'photo.task.created'
    | 'photo.task.updated'
    | 'photo.ready'
    | 'copy.ready'
    | 'queue.updated'
    | 'steer.applied'
    | 'followup.applied'
    | 'turn.completed'
    | 'turn.failed'
    | 'session.aborted';
  sessionId: string;
  turnId: string | null;
  timestamp: string;
  payload: unknown;
}

export interface AgentTurnStreamChunk {
  cursor: number;
  event: AgentTurnEvent;
}

export interface AgentToolCallViewModel {
  id: string;
  toolName: string;
  args: unknown;
  status: 'running' | 'completed' | 'error';
  result?: unknown;
}

export interface AgentPhotoOutput {
  id: string;
  taskId?: string;
  artifactId?: string;
  filePath?: string;
  mimeType?: string;
  prompt?: string;
  status?: string;
}

export interface AgentCopyOutput {
  id: string;
  content: string;
  tone?: string;
  channels?: string[];
}
