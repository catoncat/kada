/**
 * Tasks API 客户端
 * 与 Sidecar 的 /api/tasks 交互
 */

import { apiUrl } from './api-config';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

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

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '创建任务失败');
  }
  return data.task;
}

/**
 * 获取任务状态
 */
export async function fetchTask<TInput = unknown, TOutput = unknown>(
  id: string
): Promise<Task<TInput, TOutput>> {
  const response = await fetch(apiUrl(`/api/tasks/${id}`));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取任务失败');
  }
  return data.task;
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
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取任务列表失败');
  }
  return data.tasks;
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

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '批量获取任务失败');
  }
  return data.tasks;
}

/**
 * 删除任务
 */
export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/tasks/${id}`), {
    method: 'DELETE',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '删除任务失败');
  }
}

// 图片生成任务的类型定义
export interface ImageGenerationInput {
  prompt: string;
  providerId?: string;
}

export interface ImageGenerationOutput {
  imageBase64: string;
  mimeType: string;
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
  }
): Promise<ImageGenerationTask> {
  return createTask<ImageGenerationInput, ImageGenerationOutput>({
    type: 'image-generation',
    input: { prompt, providerId: options?.providerId },
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

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '重试任务失败');
  }
  return data.task;
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
