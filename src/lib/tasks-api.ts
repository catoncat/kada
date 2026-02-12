/**
 * Tasks API 客户端
 * 与 Sidecar 的 /api/tasks 交互
 */

import { apiUrl } from './api-config';
import type { TaskDetailView, ReplayTaskResponse } from '@/types/task-detail';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface ApiErrorPayload {
  error?: string;
  code?: string;
  recoverableActions?: string[];
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string | null;
  recoverableActions: string[];
  details: unknown;

  constructor(options: {
    message: string;
    status: number;
    code?: string | null;
    recoverableActions?: string[];
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code ?? null;
    this.recoverableActions = options.recoverableActions ?? [];
    this.details = options.details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export interface Task<TInput = unknown, TOutput = unknown> {
  id: string;
  type: string;
  status: TaskStatus;
  input: TInput;
  output: TOutput | null;
  error: string | null;
  relatedId: string | null;
  relatedMeta: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTaskInput<T = unknown> {
  type: string;
  input: T;
  relatedId?: string;
  relatedMeta?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(
  response: Response,
  body: unknown,
  fallbackMessage: string,
): ApiError {
  const payload = isRecord(body) ? (body as ApiErrorPayload) : null;
  return new ApiError({
    message:
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : fallbackMessage,
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : null,
    recoverableActions: Array.isArray(payload?.recoverableActions)
      ? payload.recoverableActions.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    details: body,
  });
}

/**
 * 创建任务
 */
export async function createTask<TInput, TOutput = unknown>(
  input: CreateTaskInput<TInput>
): Promise<Task<TInput, TOutput>> {
  const response = await fetch(apiUrl('/api/tasks'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '创建任务失败');
  }

  if (!isRecord(data) || !('task' in data)) {
    throw new Error('创建任务返回格式异常');
  }

  return data.task as Task<TInput, TOutput>;
}

/**
 * 获取任务状态
 */
export async function fetchTask<TInput = unknown, TOutput = unknown>(
  id: string
): Promise<Task<TInput, TOutput>> {
  const response = await fetch(apiUrl(`/api/tasks/${id}`));
  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '获取任务失败');
  }

  if (!isRecord(data) || !('task' in data)) {
    throw new Error('获取任务返回格式异常');
  }

  return data.task as Task<TInput, TOutput>;
}

/**
 * 获取任务详情聚合视图
 */
export async function fetchTaskDetail<TInput = unknown, TOutput = unknown>(
  id: string
): Promise<TaskDetailView<TInput, TOutput>> {
  const response = await fetch(apiUrl(`/api/tasks/${id}/detail`));
  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '获取任务详情失败');
  }

  if (!isRecord(data) || !('detail' in data)) {
    throw new Error('获取任务详情返回格式异常');
  }

  return data.detail as TaskDetailView<TInput, TOutput>;
}

/**
 * 获取任务列表
 */
export async function fetchTasks(options?: {
  status?: TaskStatus | TaskStatus[];
  type?: string;
  relatedId?: string;
  limit?: number;
}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', Array.isArray(options.status) ? options.status.join(',') : options.status);
  }
  if (options?.type) params.set('type', options.type);
  if (options?.relatedId) params.set('relatedId', options.relatedId);
  if (options?.limit) params.set('limit', options.limit.toString());

  const response = await fetch(apiUrl(`/api/tasks?${params.toString()}`));
  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '获取任务列表失败');
  }

  if (!isRecord(data) || !Array.isArray(data.tasks)) {
    throw new Error('获取任务列表返回格式异常');
  }

  return data.tasks as Task[];
}

/**
 * 批量获取任务状态
 */
export async function fetchTasksBatch(ids: string[]): Promise<Task[]> {
  const response = await fetch(apiUrl('/api/tasks/batch-status'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '批量获取任务失败');
  }

  if (!isRecord(data) || !Array.isArray(data.tasks)) {
    throw new Error('批量获取任务返回格式异常');
  }

  return data.tasks as Task[];
}

/**
 * 删除任务
 */
export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/tasks/${id}`), {
    method: 'DELETE',
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '删除任务失败');
  }
}

// 图片生成任务的类型定义
export interface ImageGenerationInput {
  prompt: string;
  providerId?: string;
  referenceImages?: string[];
  options?: Record<string, unknown>;
  owner?: {
    type: 'asset' | 'projectPlanVersion' | 'planScene';
    id: string;
    slot?: string;
  };
  parentArtifactId?: string;
  editInstruction?: string;
}

export interface ImageGenerationOutput {
  // 新版本（落盘后）
  artifactId: string;
  runId: string;
  filePath: string;
  mimeType: string;
  effectivePrompt: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  // 兼容旧版本
  imageBase64?: string;
}

export type ImageGenerationTask = Task<ImageGenerationInput, ImageGenerationOutput>;

/**
 * 创建图片生成任务
 */
export async function createImageTask(
  prompt: string,
  options?: {
    providerId?: string;
    relatedId?: string;
    relatedMeta?: string;
    referenceImages?: string[];
    owner?: ImageGenerationInput['owner'];
    parentArtifactId?: string;
    editInstruction?: string;
  }
): Promise<ImageGenerationTask> {
  return createTask<ImageGenerationInput, ImageGenerationOutput>({
    type: 'image-generation',
    input: {
      prompt,
      providerId: options?.providerId,
      referenceImages: options?.referenceImages,
      owner: options?.owner,
      parentArtifactId: options?.parentArtifactId,
      editInstruction: options?.editInstruction,
    },
    relatedId: options?.relatedId,
    relatedMeta: options?.relatedMeta,
  });
}

// 预案生成任务的类型定义
export interface PlanGenerationInput {
  projectId: string;
  providerId?: string;
}

export interface GeneratedScene {
  location: string;
  description: string;
  shots: string;
  lighting: string;
  visualPrompt: string;
  sceneAssetId?: string;
  sceneAssetImage?: string;
}

export interface GeneratedPlan {
  title: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: GeneratedScene[];
}

export interface PlanGenerationOutput {
  plan: GeneratedPlan;
}

export type PlanGenerationTask = Task<PlanGenerationInput, PlanGenerationOutput>;

/**
 * 获取活跃任务（pending 或 running）
 */
export async function fetchActiveTasks(): Promise<Task[]> {
  return fetchTasks({ status: ['pending', 'running'] });
}

/**
 * 获取所有任务（包括历史）
 */
export async function fetchAllTasks(limit = 50): Promise<Task[]> {
  return fetchTasks({ limit });
}

/**
 * 重试失败的任务
 */
export async function retryTask(id: string): Promise<Task> {
  const response = await fetch(apiUrl(`/api/tasks/${id}/retry`), {
    method: 'POST',
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '重试任务失败');
  }

  if (!isRecord(data) || !('task' in data)) {
    throw new Error('重试任务返回格式异常');
  }

  return data.task as Task;
}

/**
 * 按原参数重放任务（创建新任务）
 */
export async function replayTask(
  id: string,
  requestId?: string
): Promise<ReplayTaskResponse> {
  const payload = {
    requestId: requestId || crypto.randomUUID(),
  };

  const response = await fetch(apiUrl(`/api/tasks/${id}/replay`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw toApiError(response, data, '重放任务失败');
  }

  if (
    !isRecord(data) ||
    !isRecord(data.task) ||
    typeof data.replayOfTaskId !== 'string' ||
    typeof data.deduped !== 'boolean'
  ) {
    throw new Error('重放任务返回格式异常');
  }

  return data as unknown as ReplayTaskResponse;
}

/** 任务类型显示名称 */
export const TASK_TYPE_LABELS: Record<string, string> = {
  'plan-generation': '预案生成',
  'image-generation': '图片生成',
};

/** 任务状态显示名称 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
};
