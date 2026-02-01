'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { fetchAllTasks, fetchTask, Task, TaskStatus } from '@/lib/tasks-api';

interface TaskQueueContextValue {
  /** 所有任务列表（包括历史） */
  allTasks: Task[];
  /** 活跃任务数量 */
  activeCount: number;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 手动刷新任务列表 */
  refresh: () => Promise<void>;
  /** 检查特定任务的状态 */
  checkTask: (taskId: string) => Promise<Task | null>;
  /** 任务完成时的回调订阅 */
  onTaskComplete: (taskId: string, callback: (task: Task) => void) => () => void;
  /** 抽屉是否打开 */
  isDrawerOpen: boolean;
  /** 打开抽屉 */
  openDrawer: () => void;
  /** 关闭抽屉 */
  closeDrawer: () => void;
  /** 切换抽屉 */
  toggleDrawer: () => void;
}

const TaskQueueContext = createContext<TaskQueueContextValue | null>(null);

export function useTaskQueue() {
  const context = useContext(TaskQueueContext);
  if (!context) {
    throw new Error('useTaskQueue must be used within TaskQueueProvider');
  }
  return context;
}

interface TaskQueueProviderProps {
  children: React.ReactNode;
  /** 轮询间隔（毫秒） */
  pollInterval?: number;
}

export function TaskQueueProvider({ children, pollInterval = 2000 }: TaskQueueProviderProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 任务完成回调
  const callbacksRef = useRef<Map<string, Set<(task: Task) => void>>>(new Map());

  // 上一次的任务状态（用于检测状态变化）
  const prevTasksRef = useRef<Map<string, TaskStatus>>(new Map());

  // 计算活跃任务数量
  const activeCount = allTasks.filter(t => t.status === 'pending' || t.status === 'running').length;

  const refresh = useCallback(async () => {
    try {
      const tasks = await fetchAllTasks(50);

      // 检查是否有任务状态变化
      const prevTasks = prevTasksRef.current;

      for (const task of tasks) {
        const prevStatus = prevTasks.get(task.id);
        // 任务从 pending/running 变为 completed/failed
        if (
          prevStatus &&
          (prevStatus === 'pending' || prevStatus === 'running') &&
          (task.status === 'completed' || task.status === 'failed')
        ) {
          // 触发回调
          const callbacks = callbacksRef.current.get(task.id);
          if (callbacks) {
            callbacks.forEach(cb => cb(task));
          }
        }
      }

      // 更新上一次状态
      prevTasksRef.current = new Map(tasks.map(t => [t.id, t.status]));

      setAllTasks(tasks);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkTask = useCallback(async (taskId: string): Promise<Task | null> => {
    try {
      const task = await fetchTask(taskId);
      return task;
    } catch {
      return null;
    }
  }, []);

  const onTaskComplete = useCallback((taskId: string, callback: (task: Task) => void) => {
    if (!callbacksRef.current.has(taskId)) {
      callbacksRef.current.set(taskId, new Set());
    }
    callbacksRef.current.get(taskId)!.add(callback);

    // 返回取消订阅函数
    return () => {
      const callbacks = callbacksRef.current.get(taskId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          callbacksRef.current.delete(taskId);
        }
      }
    };
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen(prev => !prev), []);

  // 初始加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 轮询
  useEffect(() => {
    if (activeCount === 0 && !isLoading) {
      // 没有活跃任务时，降低轮询频率
      const interval = setInterval(refresh, pollInterval * 5);
      return () => clearInterval(interval);
    }

    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [activeCount, isLoading, pollInterval, refresh]);

  const value: TaskQueueContextValue = {
    allTasks,
    activeCount,
    isLoading,
    refresh,
    checkTask,
    onTaskComplete,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };

  return (
    <TaskQueueContext.Provider value={value}>
      {children}
    </TaskQueueContext.Provider>
  );
}
