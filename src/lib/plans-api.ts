/**
 * Plans API 客户端
 * 与 Sidecar 的 /api/plans 交互
 */

import { apiUrl } from './api-config';
import type { ExtendedShootingPlan } from '@/types/single-plan';
import type { ProjectPlan } from '@/types/project-plan';

export interface PlanRecord {
  id: string;
  title: string;
  kind: 'single' | 'project';
  data: ExtendedShootingPlan | ProjectPlan;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePlanInput {
  title: string;
  kind: 'single' | 'project';
  data: ExtendedShootingPlan | ProjectPlan;
}

export interface UpdatePlanInput {
  title?: string;
  data?: ExtendedShootingPlan | ProjectPlan;
}

/**
 * 获取所有 Plans
 */
export async function fetchPlans(limit = 20): Promise<PlanRecord[]> {
  const response = await fetch(apiUrl(`/api/plans?limit=${limit}`));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '获取 Plans 失败');
  }
  return data.plans;
}

/**
 * 获取单个 Plan
 */
export async function fetchPlan(id: string): Promise<PlanRecord> {
  const response = await fetch(apiUrl(`/api/plans/${id}`));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Plan 不存在');
  }
  return data.plan;
}

/**
 * 创建 Plan
 */
export async function createPlan(input: CreatePlanInput): Promise<PlanRecord> {
  const response = await fetch(apiUrl('/api/plans'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '创建 Plan 失败');
  }
  return data.plan;
}

/**
 * 更新 Plan
 */
export async function updatePlan(id: string, input: UpdatePlanInput): Promise<PlanRecord> {
  const response = await fetch(apiUrl(`/api/plans/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '更新 Plan 失败');
  }
  return data.plan;
}

/**
 * 删除 Plan
 */
export async function deletePlan(id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/plans/${id}`), {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '删除 Plan 失败');
  }
}
