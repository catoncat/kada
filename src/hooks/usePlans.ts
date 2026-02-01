/**
 * Plans TanStack Query hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPlans,
  fetchPlan,
  createPlan,
  updatePlan,
  deletePlan,
  type PlanRecord,
  type CreatePlanInput,
  type UpdatePlanInput,
} from '@/lib/plans-api';

export const planKeys = {
  all: ['plans'] as const,
  lists: () => [...planKeys.all, 'list'] as const,
  list: (limit?: number) => [...planKeys.lists(), { limit }] as const,
  details: () => [...planKeys.all, 'detail'] as const,
  detail: (id: string) => [...planKeys.details(), id] as const,
};

/**
 * 获取所有 Plans（历史记录）
 */
export function usePlans(limit = 20) {
  return useQuery({
    queryKey: planKeys.list(limit),
    queryFn: () => fetchPlans(limit),
  });
}

/**
 * 获取单个 Plan
 */
export function usePlan(id: string) {
  return useQuery({
    queryKey: planKeys.detail(id),
    queryFn: () => fetchPlan(id),
    enabled: !!id,
  });
}

/**
 * 创建 Plan
 */
export function useCreatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlanInput) => createPlan(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

/**
 * 更新 Plan
 */
export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePlanInput }) =>
      updatePlan(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      queryClient.setQueryData(planKeys.detail(data.id), data);
    },
  });
}

/**
 * 删除 Plan
 */
export function useDeletePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

// 重新导出类型
export type { PlanRecord, CreatePlanInput, UpdatePlanInput };
