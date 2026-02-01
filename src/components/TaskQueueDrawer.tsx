'use client';

import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { TASK_TYPE_LABELS, TASK_STATUS_LABELS, Task, deleteTask, retryTask } from '@/lib/tasks-api';
import { X, Loader2, CheckCircle, XCircle, Clock, Trash2, RefreshCw, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

export function TaskQueueDrawer() {
  const { allTasks, isDrawerOpen, closeDrawer, refresh } = useTaskQueue();
  const queryClient = useQueryClient();

  const handleDelete = async (task: Task) => {
    if (task.status === 'running') {
      alert('无法删除正在运行的任务');
      return;
    }
    try {
      await deleteTask(task.id);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  const handleRetry = async (task: Task) => {
    try {
      await retryTask(task.id);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : '重试失败');
    }
  };

  const handleTaskClick = (task: Task) => {
    // 如果任务已完成且有关联 ID，刷新相关数据
    if (task.status === 'completed' && task.relatedId) {
      queryClient.invalidateQueries({ queryKey: ['project', task.relatedId] });
    }
  };

  if (!isDrawerOpen) return null;

  // 按状态分组：活跃任务在前，历史任务在后
  const activeTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'running');
  const historyTasks = allTasks.filter(t => t.status === 'completed' || t.status === 'failed');

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={closeDrawer}
      />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">任务队列</h2>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-1.5 rounded-lg hover:bg-[var(--paper-2)] transition"
          >
            <X className="w-5 h-5 text-[var(--ink-2)]" />
          </button>
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-y-auto">
          {allTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <ListTodo className="w-12 h-12 text-[var(--ink-3)] mb-3" />
              <p className="text-[var(--ink-2)]">暂无任务记录</p>
            </div>
          ) : (
            <div>
              {/* 活跃任务 */}
              {activeTasks.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-blue-50 text-xs font-medium text-blue-600">
                    进行中 ({activeTasks.length})
                  </div>
                  <div className="divide-y divide-[var(--line)]">
                    {activeTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onDelete={() => handleDelete(task)}
                        onRetry={() => handleRetry(task)}
                        onClick={() => handleTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 历史任务 */}
              {historyTasks.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-[var(--paper-2)] text-xs font-medium text-[var(--ink-2)]">
                    历史记录 ({historyTasks.length})
                  </div>
                  <div className="divide-y divide-[var(--line)]">
                    {historyTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onDelete={() => handleDelete(task)}
                        onRetry={() => handleRetry(task)}
                        onClick={() => handleTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface TaskItemProps {
  task: Task;
  onDelete: () => void;
  onRetry: () => void;
  onClick: () => void;
}

function TaskItem({ task, onDelete, onRetry, onClick }: TaskItemProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const typeLabel = TASK_TYPE_LABELS[task.type] || task.type;
  const statusLabel = TASK_STATUS_LABELS[task.status];

  const StatusIcon = {
    pending: Clock,
    running: Loader2,
    completed: CheckCircle,
    failed: XCircle,
  }[task.status];

  const statusColor = {
    pending: 'text-yellow-500',
    running: 'text-blue-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
  }[task.status];

  const handleRetryClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="px-4 py-3 hover:bg-[var(--paper-2)] transition">
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        <div className={cn('mt-0.5', statusColor)}>
          <StatusIcon className={cn('w-5 h-5', task.status === 'running' && 'animate-spin')} />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">{typeLabel}</span>
            <span className={cn('text-xs', statusColor)}>{statusLabel}</span>
          </div>

          {task.relatedMeta && (
            <p className="mt-0.5 text-xs text-[var(--ink-2)] truncate">
              {task.relatedMeta}
            </p>
          )}

          {task.error && (
            <p className="mt-1 text-xs text-red-500 line-clamp-2">
              {task.error}
            </p>
          )}

          {/* 关联链接 */}
          {task.status === 'completed' && task.relatedId && task.type === 'plan-generation' && (
            <Link
              to="/project/$id/result"
              params={{ id: task.relatedId }}
              onClick={onClick}
              className="mt-1 inline-block text-xs text-[var(--primary)] hover:underline"
            >
              查看结果 →
            </Link>
          )}

          {/* 时间 */}
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {new Date(task.createdAt || '').toLocaleTimeString()}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          {/* 重试按钮（仅失败任务） */}
          {task.status === 'failed' && (
            <button
              type="button"
              onClick={handleRetryClick}
              disabled={isRetrying}
              className="p-1 rounded hover:bg-blue-50 text-[var(--ink-3)] hover:text-blue-500 transition disabled:opacity-50"
              title="重试"
            >
              <RefreshCw className={cn('w-4 h-4', isRetrying && 'animate-spin')} />
            </button>
          )}

          {/* 删除按钮 */}
          {task.status !== 'running' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded hover:bg-red-50 text-[var(--ink-3)] hover:text-red-500 transition"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 任务队列指示器（始终显示在导航栏） */
export function TaskQueueIndicator() {
  const { activeCount, allTasks, toggleDrawer } = useTaskQueue();

  const hasActiveTasks = activeCount > 0;

  return (
    <button
      type="button"
      onClick={toggleDrawer}
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm font-medium',
        hasActiveTasks
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
          : 'bg-[var(--paper-2)] text-[var(--ink-2)] hover:bg-[var(--paper)]'
      )}
    >
      {hasActiveTasks ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{activeCount} 个任务</span>
        </>
      ) : (
        <>
          <ListTodo className="w-4 h-4" />
          <span>任务</span>
          {allTasks.length > 0 && (
            <span className="text-xs text-[var(--ink-3)]">({allTasks.length})</span>
          )}
        </>
      )}
    </button>
  );
}
