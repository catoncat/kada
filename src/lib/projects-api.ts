/**
 * 项目 API 客户端
 */

import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectListResponse,
} from '@/types/project';

const API_BASE = 'http://localhost:3001/api';

/** 获取项目列表 */
export async function getProjects(): Promise<ProjectListResponse> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取项目列表失败');
  }
  return res.json();
}

/** 获取单个项目 */
export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取项目失败');
  }
  return res.json();
}

/** 创建项目 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '创建项目失败');
  }
  return res.json();
}

/** 更新项目 */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '更新项目失败');
  }
  return res.json();
}

/** 删除项目 */
export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '删除项目失败');
  }
}

/** 生成预案响应（任务队列模式） */
export interface GeneratePlanResponse {
  taskId: string;
  status: 'pending';
  message: string;
}

/** 预览 Prompt 响应 */
export interface PreviewPromptResponse {
  prompt: string;
}

/** 生成预案选项 */
export interface GeneratePlanOptions {
  /** 模式：preview 只返回 prompt，execute 创建任务 */
  mode?: 'preview' | 'execute';
  /** 自定义 prompt（覆盖默认生成的） */
  customPrompt?: string;
}

/** 生成预案（创建异步任务） */
export async function generatePlan(
  id: string,
  options?: GeneratePlanOptions
): Promise<GeneratePlanResponse> {
  const res = await fetch(`${API_BASE}/projects/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || { mode: 'execute' }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '创建生成任务失败');
  }
  return res.json();
}

/** 预览生成 Prompt */
export async function previewPrompt(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/projects/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview' }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '获取 Prompt 失败');
  }
  const data: PreviewPromptResponse = await res.json();
  return data.prompt;
}
