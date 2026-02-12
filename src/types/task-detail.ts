export type TaskRecoverySourceType = 'projectResult' | 'project' | 'assets';

export interface TaskDetailTimelineItem {
  status: string;
  at: string;
}

export interface TaskDetailRecoveryContext {
  sourceType: TaskRecoverySourceType;
  projectId: string | null;
  sceneIndex: number | null;
}

export interface TaskDetailRun {
  id: string;
  kind: 'plan-generation' | 'image-generation' | 'image-edit' | string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  relatedType: string | null;
  relatedId: string | null;
  effectivePrompt: string | null;
  promptContext: Record<string, unknown> | null;
  parentRunId: string | null;
  taskId: string | null;
  error: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TaskDetailArtifact {
  id: string;
  runId: string;
  type: string;
  mimeType: string | null;
  filePath: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  ownerType: string | null;
  ownerId: string | null;
  ownerSlot: string | null;
  effectivePrompt: string | null;
  promptContext: Record<string, unknown> | null;
  referenceImages: string[];
  editInstruction: string | null;
  parentArtifactId: string | null;
  createdAt?: string | null;
  deletedAt?: string | null;
}

export interface TaskDetailTask<TInput = unknown, TOutput = unknown> {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  input: TInput;
  output: TOutput | null;
  error: string | null;
  relatedId: string | null;
  relatedMeta: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TaskDetailView<TInput = unknown, TOutput = unknown> {
  task: TaskDetailTask<TInput, TOutput>;
  run: TaskDetailRun | null;
  artifacts: TaskDetailArtifact[];
  timeline: TaskDetailTimelineItem[];
  recoveryContext: TaskDetailRecoveryContext;
  missingFields: string[];
}

export interface ReplayTaskResponse {
  task: {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | string;
  };
  replayOfTaskId: string;
  deduped: boolean;
}
