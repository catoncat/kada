export type TaskRecoverySourceType = 'projectResult' | 'project' | 'assets';

export interface TaskPromptReferenceByRole {
  identity: string[];
  scene: string[];
}

export interface TaskPromptReferenceIdentityBinding {
  index: number;
  image: string;
  role?: string;
  subjectId?: string;
}

export interface TaskPromptReferencePlan {
  totalCount?: number;
  order?: string[];
  byRole?: TaskPromptReferenceByRole;
  identitySourceImages?: string[];
  identityCollageImage?: string | null;
  identityBindings?: TaskPromptReferenceIdentityBinding[];
  droppedGeneratedImages?: string[];
  sceneSanitizedCount?: number;
  counts?: {
    identity?: number;
    scene?: number;
  };
}

export interface TaskPromptOptimization {
  status?: 'optimized' | 'fallback' | 'skipped' | string;
  reason?: string | null;
  providerId?: string | null;
  providerFormat?: string | null;
  textModel?: string | null;
  assumptions?: string[];
  conflicts?: string[];
  negativePrompt?: string | null;
  sourcePrompt?: string | null;
  renderPrompt?: string | null;
}

export interface TaskPromptContext {
  referenceImagesCount?: number;
  referenceImagesByRole?: TaskPromptReferenceByRole;
  referencePlan?: TaskPromptReferencePlan;
  droppedReferenceImages?: string[];
  promptOptimization?: TaskPromptOptimization;
  [key: string]: unknown;
}

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
  promptContext: TaskPromptContext | null;
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
  promptContext: TaskPromptContext | null;
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
