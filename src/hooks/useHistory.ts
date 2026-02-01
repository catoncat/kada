/**
 * History 管理 Hook
 * 使用 TanStack Query 管理历史记录（Plans）
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePlans,
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
  planKeys,
  type PlanRecord,
  type CreatePlanInput,
  type UpdatePlanInput,
} from '@/hooks/usePlans';
import type { ExtendedShootingPlan } from '@/types/single-plan';
import type { ProjectPlan } from '@/types/project-plan';

export interface UseHistoryReturn {
  history: PlanRecord[];
  isLoading: boolean;
  error: Error | null;
  addPlan: (kind: 'single' | 'project', data: ExtendedShootingPlan | ProjectPlan, title: string) => Promise<PlanRecord>;
  updatePlan: (id: string, data: ExtendedShootingPlan | ProjectPlan, title?: string) => Promise<PlanRecord>;
  deletePlan: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useHistory(): UseHistoryReturn {
  const queryClient = useQueryClient();
  const plansQuery = usePlans(20);
  const createMutation = useCreatePlan();
  const updateMutation = useUpdatePlan();
  const deleteMutation = useDeletePlan();

  const history = plansQuery.data || [];

  // 添加新预案
  const addPlan = useCallback(
    async (kind: 'single' | 'project', data: ExtendedShootingPlan | ProjectPlan, title: string) => {
      const input: CreatePlanInput = { kind, data, title };
      return createMutation.mutateAsync(input);
    },
    [createMutation]
  );

  // 更新预案
  const updatePlan = useCallback(
    async (id: string, data: ExtendedShootingPlan | ProjectPlan, title?: string) => {
      const input: UpdatePlanInput = { data };
      if (title) input.title = title;
      return updateMutation.mutateAsync({ id, input });
    },
    [updateMutation]
  );

  // 删除预案
  const deletePlanFn = useCallback(
    async (id: string) => {
      return deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  // 刷新
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: planKeys.all });
  }, [queryClient]);

  return {
    history,
    isLoading: plansQuery.isLoading,
    error: plansQuery.error,
    addPlan,
    updatePlan,
    deletePlan: deletePlanFn,
    refresh,
  };
}
