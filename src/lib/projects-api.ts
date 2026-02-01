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

/** 生成预案（创建异步任务） */
export async function generatePlan(id: string): Promise<GeneratePlanResponse> {
  const res = await fetch(`${API_BASE}/projects/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || '创建生成任务失败');
  }
  return res.json();
}
