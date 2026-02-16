export type AgentEngine = 'coding-agent' | 'agent-core';
export type AgentSessionStatus = 'idle' | 'running' | 'failed' | 'aborted';
export type AgentMentionKind = 'project' | 'scene' | 'model' | 'image';

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
