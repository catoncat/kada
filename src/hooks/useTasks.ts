/**
 * Tasks TanStack Query hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import {
  type CreateTaskInput,
  createImageTask,
  createTask,
  deleteTask,
  fetchTask,
  fetchTaskDetail,
  fetchTasks,
  fetchTasksBatch,
  type ImageGenerationTask,
  replayTask,
  type Task,
  type TaskStatus,
} from '@/lib/tasks-api';
import type { ReplayTaskResponse, TaskDetailView } from '@/types/task-detail';

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  detailViews: () => [...taskKeys.all, 'detail-view'] as const,
  detailView: (id: string) => [...taskKeys.detailViews(), id] as const,
};

/**
 * 获取单个任务
 */
export function useTask<TInput = unknown, TOutput = unknown>(
  id: string | null,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: taskKeys.detail(id || ''),
    queryFn: () => fetchTask<TInput, TOutput>(id!),
    enabled: !!id,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * 获取任务详情聚合视图
 */
export function useTaskDetail<TInput = unknown, TOutput = unknown>(
  id: string | null,
  options?: { refetchInterval?: number | false },
) {
  return useQuery<TaskDetailView<TInput, TOutput>>({
    queryKey: taskKeys.detailView(id || ''),
    queryFn: () => fetchTaskDetail<TInput, TOutput>(id!),
    enabled: !!id,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * 获取任务列表
 */
export function useTasks(options?: {
  status?: TaskStatus | TaskStatus[];
  type?: string;
  relatedId?: string;
  limit?: number;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: taskKeys.list(options || {}),
    queryFn: () => fetchTasks(options),
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * 创建任务
 */
export function useCreateTask<TInput = unknown>() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput<TInput>) => createTask<TInput>(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

/**
 * 删除任务
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

/**
 * 重放任务（按原参数创建新任务）
 */
export function useReplayTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      requestId,
    }: {
      taskId: string;
      requestId?: string;
    }) => replayTask(taskId, requestId),
    onSuccess: (result: ReplayTaskResponse, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({
        queryKey: taskKeys.detailView(variables.taskId),
      });
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(result.task.id),
      });
    },
  });
}

/**
 * 轮询多个任务状态的 hook
 * 用于批量图片生成等场景
 */
export function useTasksPolling(
  taskIds: string[],
  options?: {
    enabled?: boolean;
    intervalMs?: number;
    onTaskComplete?: (task: Task) => void;
    onAllComplete?: (tasks: Task[]) => void;
  },
) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef<Set<string>>(new Set());

  const {
    enabled = true,
    intervalMs = 1000,
    onTaskComplete,
    onAllComplete,
  } = options || {};

  const poll = useCallback(async () => {
    if (taskIds.length === 0) return;

    try {
      console.log('[useTasksPolling] Polling tasks:', taskIds);
      const tasks = await fetchTasksBatch(taskIds);
      console.log(
        '[useTasksPolling] Fetched tasks:',
        tasks.map((t) => ({ id: t.id, status: t.status })),
      );

      // 更新缓存
      for (const task of tasks) {
        queryClient.setQueryData(taskKeys.detail(task.id), task);

        // 检查新完成的任务
        if (
          (task.status === 'completed' || task.status === 'failed') &&
          !completedRef.current.has(task.id)
        ) {
          console.log(
            '[useTasksPolling] Task completed/failed:',
            task.id,
            task.status,
          );
          completedRef.current.add(task.id);
          onTaskComplete?.(task);
        }
      }

      // 检查是否全部完成
      const allDone = tasks.every(
        (t) => t.status === 'completed' || t.status === 'failed',
      );
      if (allDone && tasks.length > 0) {
        console.log('[useTasksPolling] All tasks done, calling onAllComplete');
        onAllComplete?.(tasks);
        // 停止轮询
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (error) {
      console.error('[useTasksPolling] 轮询任务状态失败:', error);
    }
  }, [taskIds, queryClient, onTaskComplete, onAllComplete]);

  useEffect(() => {
    if (!enabled || taskIds.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 立即执行一次
    poll();

    // 启动轮询
    intervalRef.current = setInterval(poll, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, taskIds.length, intervalMs, poll]);

  // 重置已完成集合
  useEffect(() => {
    completedRef.current = new Set();
  }, [taskIds.join(',')]);

  return {
    stop: () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
  };
}

/**
 * 图片生成任务 hook
 */
export function useImageGeneration() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: ({
      prompt,
      relatedId,
      relatedMeta,
      referenceImages,
      owner,
      parentArtifactId,
      editInstruction,
    }: {
      prompt: string;
      relatedId?: string;
      relatedMeta?: string;
      referenceImages?: string[];
      owner?: {
        type: 'asset' | 'projectPlanVersion' | 'planScene';
        id: string;
        slot?: string;
      };
      parentArtifactId?: string;
      editInstruction?: string;
    }) =>
      createImageTask(prompt, {
        relatedId,
        relatedMeta,
        referenceImages,
        owner,
        parentArtifactId,
        editInstruction,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  return {
    createTask: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

// 导出类型
export type { Task, TaskStatus, ImageGenerationTask };
