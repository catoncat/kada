import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { SceneTaskTrack } from '@/components/plan/types';
import { parseSceneIndexFromTask } from '@/lib/task-recovery';
import { fetchTaskDetail, fetchTasks, type Task } from '@/lib/tasks-api';
import type { TaskDetailView } from '@/types/task-detail';

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortByCreatedDesc(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => toTimestamp(b.createdAt || null) - toTimestamp(a.createdAt || null),
  );
}

export function useProjectSceneTasks(projectId: string) {
  const tasksQuery = useQuery({
    queryKey: ['project-tasks', projectId],
    enabled: Boolean(projectId),
    queryFn: () => fetchTasks({ relatedId: projectId, limit: 200 }),
    refetchInterval: (query) => {
      const tasks = query.state.data as Task[] | undefined;
      if (!tasks || tasks.length === 0) return 5000;
      const hasActive = tasks.some(
        (item) => item.status === 'pending' || item.status === 'running',
      );
      return hasActive ? 1200 : 5000;
    },
  });

  const latestTaskByScene = useMemo(() => {
    const map = new Map<number, Task>();
    for (const task of sortByCreatedDesc(tasksQuery.data || [])) {
      if (task.type !== 'image-generation' && task.type !== 'plan-generation')
        continue;
      const sceneIndex = parseSceneIndexFromTask(task);
      if (sceneIndex === null) continue;
      if (!map.has(sceneIndex)) {
        map.set(sceneIndex, task);
      }
    }
    return map;
  }, [tasksQuery.data]);

  const sceneEntries = useMemo(
    () =>
      [...latestTaskByScene.entries()]
        .map(([sceneIndex, task]) => ({ sceneIndex, task }))
        .sort((a, b) => a.sceneIndex - b.sceneIndex),
    [latestTaskByScene],
  );

  const detailQueries = useQueries({
    queries: sceneEntries.map(({ task }) => ({
      queryKey: ['tasks', 'detail-view', task.id],
      queryFn: () => fetchTaskDetail(task.id),
      refetchInterval:
        task.status === 'pending' || task.status === 'running' ? 1200 : false,
      staleTime: 1000,
    })),
  });

  const detailByScene = useMemo(() => {
    const map = new Map<number, TaskDetailView>();
    for (let index = 0; index < sceneEntries.length; index += 1) {
      const entry = sceneEntries[index];
      const detail = detailQueries[index]?.data;
      if (detail) {
        map.set(entry.sceneIndex, detail);
      }
    }
    return map;
  }, [sceneEntries, detailQueries]);

  const sceneTrackMap = useMemo(() => {
    const map = new Map<number, SceneTaskTrack>();
    for (const [sceneIndex, task] of latestTaskByScene.entries()) {
      map.set(sceneIndex, {
        sceneIndex,
        taskId: task.id,
        status: task.status,
        createdAt: task.createdAt || null,
        updatedAt: task.updatedAt || null,
        error: task.error || null,
      });
    }
    return map;
  }, [latestTaskByScene]);

  const isDetailsLoading = detailQueries.some((query) => query.isLoading);
  const isDetailsFetching = detailQueries.some((query) => query.isFetching);

  return {
    projectTasks: tasksQuery.data || [],
    latestTaskByScene,
    detailByScene,
    sceneTrackMap,
    isLoading: tasksQuery.isLoading || isDetailsLoading,
    isFetching: tasksQuery.isFetching || isDetailsFetching,
    refetch: tasksQuery.refetch,
  };
}
