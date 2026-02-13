'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  ListTodo,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PhotoFrame } from '@/components/PhotoFrame';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useReplayTask, useTaskDetail } from '@/hooks/useTasks';
import { apiUrl } from '@/lib/api-config';
import { openSettingsWindow } from '@/lib/open-settings-window';
import {
  buildTaskDeepLinkSearch,
  getTaskSourceLink,
  type TaskSourceLink,
} from '@/lib/task-recovery';
import {
  deleteTask,
  isApiError,
  retryTask,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type Task,
} from '@/lib/tasks-api';
import { cn } from '@/lib/utils';
import type {
  TaskDetailArtifact,
  TaskDetailView,
  TaskPromptContext,
  TaskPromptOptimization,
  TaskPromptReferenceByRole,
} from '@/types/task-detail';

type TaskFilter = 'all' | 'active' | 'history';

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
} as const;

const STATUS_COLOR = {
  pending: 'text-yellow-500',
  running: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDraftPrompt(task: Task): string | null {
  if (!isRecord(task.input)) return null;

  const directPrompt = safeString(task.input.prompt);
  if (directPrompt) return directPrompt;

  const customPrompt = safeString(task.input.customPrompt);
  if (customPrompt) return customPrompt;

  return null;
}

function getEffectivePrompt(
  task: Task,
  detail?: TaskDetailView | null,
): string | null {
  const fromRun = safeString(detail?.run?.effectivePrompt);
  if (fromRun) return fromRun;

  if (isRecord(task.output)) {
    const fromOutput = safeString(task.output.effectivePrompt);
    if (fromOutput) return fromOutput;
  }

  return null;
}

function buildReplayPayload(
  task: Task,
  detail?: TaskDetailView | null,
): string {
  const sourceLink = getTaskSourceLink(task, detail);
  return JSON.stringify(
    {
      task: {
        id: task.id,
        type: task.type,
        status: task.status,
        createdAt: task.createdAt,
        relatedId: task.relatedId,
        relatedMeta: task.relatedMeta,
      },
      prompts: {
        draft: getDraftPrompt(task),
        effective: getEffectivePrompt(task, detail),
      },
      run: detail?.run || null,
      artifacts: detail?.artifacts || [],
      timeline: detail?.timeline || [],
      recoveryContext: detail?.recoveryContext || null,
      sourceLink: sourceLink || null,
      missingFields: detail?.missingFields || [],
      error: {
        taskError: task.error || null,
        runError: detail?.run?.error || null,
      },
    },
    null,
    2,
  );
}

function extractRunErrorMessage(detail?: TaskDetailView | null): string | null {
  if (!detail?.run?.error) return null;
  const message = safeString(detail.run.error.message);
  if (message) return message;
  return JSON.stringify(detail.run.error);
}

function getActionErrorMessage(error: Error | null): string | null {
  if (!error) return null;
  if (isApiError(error)) return error.message;
  return error.message || '操作失败';
}

function shouldSuggestProviderSettings(error: Error | null): boolean {
  if (!error || !isApiError(error)) return false;
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.code === 'TEXT_CAPABILITY_UNAVAILABLE' ||
    error.code === 'IMAGE_CAPABILITY_UNAVAILABLE'
  );
}

function getArtifactPreviewUrl(artifact: TaskDetailArtifact): string | null {
  const filePath = safeString(artifact.filePath);
  if (!filePath) return null;

  if (
    filePath.startsWith('data:') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://')
  ) {
    return filePath;
  }

  const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return apiUrl(normalized);
}

function getReferencePreviewUrl(pathValue: string): string {
  if (
    pathValue.startsWith('data:') ||
    pathValue.startsWith('http://') ||
    pathValue.startsWith('https://')
  ) {
    return pathValue;
  }
  const normalized = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return apiUrl(normalized);
}

function getImageParams(
  task: Task,
  detail?: TaskDetailView | null,
): {
  owner: { type: string | null; id: string | null; slot: string | null };
  referenceImages: string[];
  editInstruction: string | null;
  parentArtifactId: string | null;
} {
  let owner: { type: string | null; id: string | null; slot: string | null } = {
    type: null,
    id: null,
    slot: null,
  };

  let referenceImages: string[] = [];
  let editInstruction: string | null = null;
  let parentArtifactId: string | null = null;

  if (isRecord(task.input)) {
    if (isRecord(task.input.owner)) {
      owner = {
        type: safeString(task.input.owner.type),
        id: safeString(task.input.owner.id),
        slot: safeString(task.input.owner.slot),
      };
    }

    if (Array.isArray(task.input.referenceImages)) {
      referenceImages = task.input.referenceImages
        .filter(
          (img): img is string =>
            typeof img === 'string' && img.trim().length > 0,
        )
        .map((img) => img.trim());
    }

    editInstruction = safeString(task.input.editInstruction);
    parentArtifactId = safeString(task.input.parentArtifactId);

  }

  if (detail?.artifacts?.length) {
    const fromArtifacts = detail.artifacts
      .flatMap((artifact) => artifact.referenceImages)
      .filter(
        (img): img is string =>
          typeof img === 'string' && img.trim().length > 0,
      )
      .map((img) => img.trim());

    if (fromArtifacts.length > 0) {
      referenceImages = Array.from(new Set(fromArtifacts));
    }

    const latestArtifact = detail.artifacts[0];
    if (!editInstruction)
      editInstruction = safeString(latestArtifact.editInstruction);
    if (!parentArtifactId)
      parentArtifactId = safeString(latestArtifact.parentArtifactId);
  }

  return {
    owner,
    referenceImages,
    editInstruction,
    parentArtifactId,
  };
}

interface ReferenceSummaryView {
  totalCount: number;
  byRole: TaskPromptReferenceByRole;
  dropped: string[];
  order: string[];
}

interface PromptOptimizationView {
  status: 'optimized' | 'fallback' | 'skipped';
  reason: string | null;
  providerId: string | null;
  providerFormat: string | null;
  textModel: string | null;
  assumptions: string[];
  conflicts: string[];
  sourcePrompt: string | null;
  renderPrompt: string | null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePromptOptimization(
  value: TaskPromptOptimization | undefined,
): PromptOptimizationView | null {
  if (!value || typeof value !== 'object') return null;

  const status =
    value.status === 'optimized' ||
    value.status === 'fallback' ||
    value.status === 'skipped'
      ? value.status
      : 'skipped';

  const sourcePrompt = safeString(value.sourcePrompt);
  const renderPrompt = safeString(value.renderPrompt);
  const assumptions = toStringArray(value.assumptions);
  const conflicts = toStringArray(value.conflicts);

  if (
    !sourcePrompt &&
    !renderPrompt &&
    assumptions.length === 0 &&
    conflicts.length === 0 &&
    !safeString(value.providerId) &&
    !safeString(value.textModel) &&
    !safeString(value.reason)
  ) {
    return null;
  }

  return {
    status,
    reason: safeString(value.reason),
    providerId: safeString(value.providerId),
    providerFormat: safeString(value.providerFormat),
    textModel: safeString(value.textModel),
    assumptions,
    conflicts,
    sourcePrompt,
    renderPrompt,
  };
}

function getReferenceSummary(
  promptContext?: TaskPromptContext | null,
): ReferenceSummaryView | null {
  if (!promptContext || typeof promptContext !== 'object') return null;
  const rawByRole = promptContext.referenceImagesByRole;
  const identity = toStringArray(rawByRole?.identity);
  const scene = toStringArray(rawByRole?.scene);
  const dropped = toStringArray(promptContext.droppedReferenceImages);
  const order = [...identity, ...scene];
  const totalCountRaw = promptContext.referenceImagesCount;
  const totalCount =
    typeof totalCountRaw === 'number' && Number.isFinite(totalCountRaw)
      ? totalCountRaw
      : order.length;

  if (identity.length === 0 && scene.length === 0 && dropped.length === 0) {
    return null;
  }

  return {
    totalCount,
    byRole: { identity, scene },
    dropped,
    order,
  };
}

function formatTime(value: string | undefined | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator?.clipboard?.writeText) {
    throw new Error('当前环境不支持剪贴板写入');
  }
  await navigator.clipboard.writeText(text);
}

export function TaskQueueDrawer() {
  const { allTasks, isDrawerOpen, closeDrawer, refresh } = useTaskQueue();
  const queryClient = useQueryClient();
  const replayMutation = useReplayTask();

  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    kind: 'success' | 'info';
    message: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const activeTasks = useMemo(
    () =>
      allTasks.filter((t) => t.status === 'pending' || t.status === 'running'),
    [allTasks],
  );
  const historyTasks = useMemo(
    () =>
      allTasks.filter((t) => t.status === 'completed' || t.status === 'failed'),
    [allTasks],
  );

  const selectedTask = useMemo(
    () => allTasks.find((t) => t.id === selectedTaskId) || null,
    [allTasks, selectedTaskId],
  );

  const detailQuery = useTaskDetail(selectedTaskId, {
    refetchInterval:
      selectedTask &&
      (selectedTask.status === 'pending' || selectedTask.status === 'running')
        ? 1000
        : false,
  });

  useEffect(() => {
    if (!isDrawerOpen) {
      if (restoreFocusRef.current) {
        restoreFocusRef.current.focus();
        restoreFocusRef.current = null;
      }
      return;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const id = window.setTimeout(() => {
      titleRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(id);
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDrawer, isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    if (selectedTaskId && allTasks.some((t) => t.id === selectedTaskId)) {
      return;
    }

    const next = activeTasks[0] || historyTasks[0] || null;
    setActionError(null);
    setActionNotice(null);
    setSelectedTaskId(next?.id || null);
  }, [allTasks, activeTasks, historyTasks, isDrawerOpen, selectedTaskId]);

  const filteredTasks = useMemo(() => {
    if (filter === 'active') return activeTasks;
    if (filter === 'history') return historyTasks;
    return allTasks;
  }, [allTasks, activeTasks, filter, historyTasks]);

  const handleDelete = (task: Task) => {
    setActionError(null);
    setActionNotice(null);
    if (task.status === 'running') {
      setActionError(new Error('无法删除正在运行的任务'));
      return;
    }

    setDeleteTarget(task);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setIsDeletingTask(true);
    try {
      await deleteTask(deleteTarget.id);
      await refresh();
      setActionNotice({ kind: 'info', message: '任务已删除。' });
      if (selectedTaskId === deleteTarget.id) {
        setSelectedTaskId(null);
      }
      setDeleteTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error('删除失败'));
    } finally {
      setIsDeletingTask(false);
    }
  };

  const handleRetry = async (task: Task) => {
    setActionError(null);
    setActionNotice(null);
    try {
      await retryTask(task.id);
      await refresh();
      setActionNotice({
        kind: 'success',
        message: '已提交重试，任务已回到等待队列。',
      });
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error('重试失败'));
    }
  };

  const handleReplay = async (task: Task) => {
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await replayMutation.mutateAsync({ taskId: task.id });
      await refresh();
      setSelectedTaskId(result.task.id);
      setActionNotice(
        result.deduped
          ? {
              kind: 'info',
              message: `已命中去重，复用任务 ${result.task.id}。`,
            }
          : {
              kind: 'success',
              message: `已创建新任务 ${result.task.id}，等待执行。`,
            },
      );
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error('重放失败'));
    }
  };

  const handleCopyReplayInfo = async (
    task: Task,
    detail?: TaskDetailView | null,
  ) => {
    setActionError(null);
    setActionNotice(null);
    try {
      await copyToClipboard(buildReplayPayload(task, detail));
      setActionNotice({
        kind: 'success',
        message: '已复制复盘信息，可用于排查或复现。',
      });
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error('复制失败'));
    }
  };

  const handleTaskJumpPrepare = (task: Task) => {
    if (task.status === 'completed' && task.relatedId) {
      queryClient.invalidateQueries({ queryKey: ['project', task.relatedId] });
    }
  };

  if (!isDrawerOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close task drawer"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={closeDrawer}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-replay-center-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[1160px] flex-col border-l bg-popover text-popover-foreground shadow-lg/10"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2
              id="task-replay-center-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-base font-semibold outline-none"
            >
              任务复盘中心
            </h2>
            <p className="text-xs text-muted-foreground">
              共 {allTasks.length} 条，进行中 {activeTasks.length} 条
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="关闭任务复盘中心"
            className="rounded-lg p-1.5 transition hover:bg-accent/60"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="min-h-0 flex-1 md:flex">
          <aside className="flex w-full flex-col border-b md:w-[360px] md:shrink-0 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              {(['all', 'active', 'history'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition',
                    filter === item
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                  )}
                  onClick={() => setFilter(item)}
                >
                  {item === 'all'
                    ? '全部'
                    : item === 'active'
                      ? '进行中'
                      : '历史'}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredTasks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                  <ListTodo className="h-10 w-10 text-muted-foreground/70" />
                  {allTasks.length === 0 ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        还没有任务记录。先生成一次预案或参考图。
                      </p>
                      <Link
                        to="/"
                        onClick={closeDrawer}
                        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                      >
                        去项目页
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        没有匹配的任务，试试放宽筛选条件。
                      </p>
                      <button
                        type="button"
                        className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                        onClick={() => setFilter('all')}
                      >
                        清空筛选
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredTasks.map((task) => {
                    const StatusIcon = STATUS_ICON[task.status];
                    const statusColor = STATUS_COLOR[task.status];
                    const isSelected = task.id === selectedTaskId;
                    const promptPreview =
                      getEffectivePrompt(task, undefined) ||
                      getDraftPrompt(task);

                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setActionNotice(null);
                          setSelectedTaskId(task.id);
                        }}
                        className={cn(
                          'w-full px-3 py-3 text-left transition hover:bg-accent/60',
                          isSelected && 'bg-accent/70',
                        )}
                        aria-label={`${TASK_TYPE_LABELS[task.type] || task.type}，状态 ${TASK_STATUS_LABELS[task.status]}`}
                      >
                        <div className="flex items-start gap-2">
                          <StatusIcon
                            aria-hidden="true"
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0',
                              statusColor,
                              task.status === 'running' && 'animate-spin',
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {TASK_TYPE_LABELS[task.type] || task.type}
                              </span>
                              <span className={cn('text-xs', statusColor)}>
                                {TASK_STATUS_LABELS[task.status]}
                              </span>
                              <span className="sr-only">
                                状态：{TASK_STATUS_LABELS[task.status]}
                              </span>
                            </div>

                            {task.relatedMeta && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {task.relatedMeta}
                              </p>
                            )}

                            {promptPreview && (
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                {promptPreview}
                              </p>
                            )}

                            <p className="mt-1 text-xs text-muted-foreground/70">
                              {formatTime(task.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="min-h-0 flex-1 overflow-y-auto p-4">
            {!selectedTask ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <ListTodo className="h-12 w-12 text-muted-foreground/70" />
                <p className="text-sm text-muted-foreground">
                  {allTasks.length === 0
                    ? '当前暂无可复盘任务。'
                    : '选择左侧任务查看完整复盘信息。'}
                </p>
              </div>
            ) : (
              <TaskDetailPane
                task={selectedTask}
                detail={detailQuery.data}
                isLoading={detailQuery.isLoading}
                loadError={
                  detailQuery.error instanceof Error ? detailQuery.error : null
                }
                actionError={actionError}
                actionNotice={actionNotice}
                onDelete={handleDelete}
                onRetry={handleRetry}
                onReplay={handleReplay}
                onCopyReplay={handleCopyReplayInfo}
                onJumpPrepare={handleTaskJumpPrepare}
                isReplaying={replayMutation.isPending}
                isDeletingTask={isDeletingTask}
              />
            )}
          </section>
        </div>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除任务记录</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法在任务中心查看该记录，是否继续删除？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={isDeletingTask}
              onClick={handleDeleteConfirm}
            >
              {isDeletingTask ? '删除中...' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

interface TaskDetailPaneProps {
  task: Task;
  detail?: TaskDetailView;
  isLoading: boolean;
  loadError: Error | null;
  actionError: Error | null;
  actionNotice: { kind: 'success' | 'info'; message: string } | null;
  onDelete: (task: Task) => void;
  onRetry: (task: Task) => Promise<void>;
  onReplay: (task: Task) => Promise<void>;
  onCopyReplay: (task: Task, detail?: TaskDetailView | null) => Promise<void>;
  onJumpPrepare: (task: Task) => void;
  isReplaying: boolean;
  isDeletingTask: boolean;
}

function TaskDetailPane({
  task,
  detail,
  isLoading,
  loadError,
  actionError,
  actionNotice,
  onDelete,
  onRetry,
  onReplay,
  onCopyReplay,
  onJumpPrepare,
  isReplaying,
  isDeletingTask,
}: TaskDetailPaneProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [copyState, setCopyState] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const sourceLink = getTaskSourceLink(task, detail);
  const draftPrompt = getDraftPrompt(task);
  const effectivePrompt = getEffectivePrompt(task, detail);
  const imageParams = getImageParams(task, detail);
  const referenceSummary = getReferenceSummary(detail?.run?.promptContext);
  const promptOptimization = normalizePromptOptimization(
    detail?.run?.promptContext?.promptOptimization,
  );
  const sourceComposedPrompt =
    promptOptimization?.sourcePrompt &&
    promptOptimization.sourcePrompt !== effectivePrompt
      ? promptOptimization.sourcePrompt
      : null;
  const runError = extractRunErrorMessage(detail);
  const actionErrorMessage = getActionErrorMessage(actionError);
  const showProviderSetupAction = shouldSuggestProviderSettings(actionError);

  const runStatusLabel =
    detail?.run?.status === 'succeeded'
      ? '成功'
      : detail?.run?.status === 'failed'
        ? '失败'
        : detail?.run?.status === 'running'
          ? '执行中'
          : detail?.run?.status || '-';

  const handleCopyText = async (label: string, content: string | null) => {
    if (!content) return;
    try {
      await copyToClipboard(content);
      setCopyState({ kind: 'success', message: `${label}已复制` });
      window.setTimeout(() => setCopyState(null), 1200);
    } catch {
      setCopyState({ kind: 'error', message: '复制失败' });
      window.setTimeout(() => setCopyState(null), 1200);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {TASK_TYPE_LABELS[task.type] || task.type}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              任务 ID: <code>{task.id}</code>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              状态: {TASK_STATUS_LABELS[task.status]}
              {detail?.run ? ` / Run: ${runStatusLabel}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              创建时间: {formatTime(task.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onCopyReplay(task, detail || null)}
              aria-label="复制任务复盘信息"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" />
              复制复盘信息
            </button>

            <Link
              to="/tasks/$id"
              params={{ id: task.id }}
              search={buildTaskDeepLinkSearch(task, detail)}
              aria-label="打开任务详情页"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开详情页
            </Link>

            {sourceLink && (
              <SourceLinkButton
                link={sourceLink}
                onClick={() => onJumpPrepare(task)}
              />
            )}

            <button
              type="button"
              onClick={() => onReplay(task)}
              disabled={isReplaying}
              aria-label="按原参数再生成"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs disabled:opacity-60',
                task.status === 'failed'
                  ? 'border hover:bg-accent'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {isReplaying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              按原参数再生成
            </button>

            {task.status === 'failed' && (
              <button
                type="button"
                onClick={async () => {
                  setIsRetrying(true);
                  try {
                    await onRetry(task);
                  } finally {
                    setIsRetrying(false);
                  }
                }}
                disabled={isRetrying}
                aria-label="重试当前任务"
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {isRetrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                重试任务
              </button>
            )}

            {task.status !== 'running' && (
              <button
                type="button"
                onClick={() => onDelete(task)}
                disabled={isDeletingTask}
                aria-label="删除当前任务"
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {isDeletingTask ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                删除任务
              </button>
            )}
          </div>
        </div>

        {actionNotice && (
          <div
            className={cn(
              'mt-3 rounded-md border px-3 py-2 text-xs',
              actionNotice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-blue-200 bg-blue-50 text-blue-700',
            )}
          >
            {actionNotice.message}
          </div>
        )}

        {actionErrorMessage && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p>{actionErrorMessage}</p>
            {showProviderSetupAction && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openSettingsWindow()}
                  className="inline-flex items-center rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                >
                  去设置 Provider
                </button>
              </div>
            )}
          </div>
        )}

        {copyState && (
          <div
            className={cn(
              'mt-3 rounded-md border px-3 py-2 text-xs',
              copyState.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {copyState.message}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Prompt 复盘</h3>
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {loadError && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            详情加载失败：{loadError.message}
          </div>
        )}

        <div className="space-y-3">
          <PromptBlock
            label="Draft Prompt（用户输入）"
            content={draftPrompt}
            onCopy={() => handleCopyText('Draft Prompt', draftPrompt)}
          />
          <PromptBlock
            label="Effective Prompt（服务端实际执行）"
            content={effectivePrompt}
            onCopy={() => handleCopyText('Effective Prompt', effectivePrompt)}
          />
          <PromptBlock
            label="Composed Prompt（优化前）"
            content={sourceComposedPrompt}
            onCopy={() =>
              handleCopyText('Composed Prompt', sourceComposedPrompt)
            }
          />
          <PromptOptimizationBlock summary={promptOptimization} />
          <ReferenceSummaryBlock summary={referenceSummary} />
        </div>
      </div>

      {task.type === 'image-generation' && (
        <div className="rounded-xl border p-3">
          <h3 className="mb-2 text-sm font-medium">图片参数（文+图场景）</h3>

          <div className="grid gap-2 text-xs md:grid-cols-2">
            <KV label="owner.type" value={imageParams.owner.type} />
            <KV label="owner.id" value={imageParams.owner.id} />
            <KV label="owner.slot" value={imageParams.owner.slot} />
            <KV label="parentArtifactId" value={imageParams.parentArtifactId} />
            <KV label="editInstruction" value={imageParams.editInstruction} />
            <KV
              label="referenceImages"
              value={String(imageParams.referenceImages.length)}
            />
          </div>

          <div className="mt-3 space-y-2">
            {imageParams.referenceImages.length === 0 ? (
              <p className="text-xs text-muted-foreground">未携带参考图</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {imageParams.referenceImages.map((img, idx) => {
                  const preview = getReferencePreviewUrl(img);

                  return (
                    <a
                      key={`${task.id}-${img}`}
                      href={preview}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`查看参考图 ${idx + 1}`}
                      className="group rounded-md border bg-muted p-1"
                    >
                      <PhotoFrame
                        src={preview}
                        alt={`${task.id}-reference-${idx + 1}`}
                        className="rounded"
                      />
                      <p className="mt-1 truncate text-2xs text-muted-foreground group-hover:text-foreground">
                        {img}
                      </p>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      <div className="rounded-xl border p-3">
        <h3 className="mb-2 text-sm font-medium">执行结果与时间线</h3>

        <div className="space-y-2 text-xs">
          <KV label="Run ID" value={detail?.run?.id || '-'} />
          <KV label="Run 状态" value={runStatusLabel} />
          <KV label="Run 绑定 taskId" value={detail?.run?.taskId || '-'} />
          <KV
            label="Artifact 数量"
            value={String(detail?.artifacts?.length || 0)}
          />
        </div>

        {(task.error || runError) && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p className="font-medium">错误信息</p>
            {task.error && <p className="mt-1">Task: {task.error}</p>}
            {runError && <p className="mt-1">Run: {runError}</p>}
          </div>
        )}

        {detail?.artifacts && detail.artifacts.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {detail.artifacts.map((artifact) => {
              const url = getArtifactPreviewUrl(artifact);
              return (
                <div key={artifact.id} className="rounded-md border p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate text-xs font-medium">
                      {artifact.id}
                    </p>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        打开
                      </a>
                    )}
                  </div>

                  {url ? (
                    <PhotoFrame
                      src={url}
                      alt={artifact.id}
                      className="mb-2 rounded border"
                    />
                  ) : (
                    <div className="mb-2 flex aspect-[3/2] items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                      <ImageIcon className="mr-1 h-3.5 w-3.5" /> 无预览
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>filePath: {artifact.filePath || '-'}</p>
                    <p>mime: {artifact.mimeType || '-'}</p>
                    <p>createdAt: {formatTime(artifact.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {detail?.timeline && detail.timeline.length > 0 ? (
          <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
            {detail.timeline.map((item, idx) => (
              <li
                key={`${item.status}-${item.at}-${idx}`}
                className="flex items-center justify-between rounded bg-muted px-2 py-1"
              >
                <span>{item.status}</span>
                <span>{formatTime(item.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">暂无时间线数据</p>
        )}
      </div>

      {!!detail?.missingFields?.length && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          该任务来自旧版本，缺少字段：{detail.missingFields.join(', ')}。
        </div>
      )}
    </div>
  );
}

function PromptBlock({
  label,
  content,
  onCopy,
}: {
  label: string;
  content: string | null;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`复制${label}`}
          disabled={!content}
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
        >
          <Copy className="h-3 w-3" />
          复制
        </button>
      </div>
      {content ? (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
          {content}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">暂无内容</p>
      )}
    </div>
  );
}

function PromptOptimizationBlock({
  summary,
}: {
  summary: PromptOptimizationView | null;
}) {
  if (!summary) {
    return (
      <div className="rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
        Prompt 优化摘要：暂无数据（可能为旧任务或未启用优化器）。
      </div>
    );
  }

  const statusText =
    summary.status === 'optimized'
      ? '已优化'
      : summary.status === 'fallback'
        ? '优化失败（已回退）'
        : '已跳过';

  return (
    <div className="rounded-lg border bg-muted/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">Prompt 优化摘要</div>
        <div className="text-2xs text-muted-foreground">{statusText}</div>
      </div>

      <div className="grid gap-1 text-2xs text-muted-foreground md:grid-cols-2">
        <div>provider: {summary.providerId || '-'}</div>
        <div>model: {summary.textModel || '-'}</div>
        <div>format: {summary.providerFormat || '-'}</div>
      </div>

      {summary.reason && (
        <div className="text-2xs text-amber-700">原因：{summary.reason}</div>
      )}

      {(summary.assumptions.length > 0 || summary.conflicts.length > 0) && (
        <div className="grid gap-2 text-2xs md:grid-cols-2">
          <div>
            <div className="font-medium text-muted-foreground">assumptions</div>
            {summary.assumptions.length === 0 ? (
              <div className="text-muted-foreground">无</div>
            ) : (
              <div className="space-y-0.5">
                {summary.assumptions.map((item) => (
                  <div key={`opt-assume-${item}`}>{item}</div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="font-medium text-muted-foreground">conflicts</div>
            {summary.conflicts.length === 0 ? (
              <div className="text-muted-foreground">无</div>
            ) : (
              <div className="space-y-0.5">
                {summary.conflicts.map((item) => (
                  <div key={`opt-conflict-${item}`}>{item}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferenceSummaryBlock({
  summary,
}: {
  summary: ReferenceSummaryView | null;
}) {
  if (!summary) {
    return (
      <div className="rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
        参考图注入摘要：暂无数据（可能是旧任务或未使用参考图）。
      </div>
    );
  }

  const renderImageList = (items: string[], keyPrefix: string) => {
    if (items.length === 0) {
      return <div className="text-muted-foreground">无</div>;
    }
    return (
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((item, index) => {
          const preview = getReferencePreviewUrl(item);
          return (
            <a
              key={`${keyPrefix}-${item}`}
              href={preview}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2 rounded border bg-background px-1.5 py-1 hover:bg-muted/30"
            >
              <PhotoFrame
                src={preview}
                alt={`${keyPrefix}-${index + 1}`}
                className="h-10 w-10 rounded border"
              />
              <div className="min-w-0 text-2xs">
                <div className="truncate text-muted-foreground">
                  {index + 1}. {item}
                </div>
                {item.includes('.scene-noface.') ? (
                  <div className="text-emerald-600">场景去脸缓存</div>
                ) : null}
              </div>
            </a>
          );
        })}
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">参考图注入摘要</div>
        <div className="text-2xs text-muted-foreground">
          总计 {summary.totalCount} 张
        </div>
      </div>

      <div className="grid gap-2 text-2xs md:grid-cols-2">
        <div>
          <div className="font-medium text-muted-foreground">
            identity（{summary.byRole.identity.length}）
          </div>
          {renderImageList(summary.byRole.identity, 'ref-identity')}
        </div>

        <div>
          <div className="font-medium text-muted-foreground">
            scene（{summary.byRole.scene.length}）
          </div>
          {renderImageList(summary.byRole.scene, 'ref-scene')}
        </div>
      </div>

      {summary.order.length > 0 && (
        <div>
          <div className="text-2xs font-medium text-muted-foreground">
            注入顺序
          </div>
          <div className="mt-1">{renderImageList(summary.order, 'ref-order')}</div>
        </div>
      )}

      {summary.dropped.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-2xs text-amber-700">
          已自动过滤 {summary.dropped.length} 张历史生成图：
          <div className="mt-1">{renderImageList(summary.dropped, 'ref-dropped')}</div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded bg-muted px-2 py-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-xs">{value || '-'}</p>
    </div>
  );
}

function SourceLinkButton({
  link,
  onClick,
}: {
  link: TaskSourceLink;
  onClick: () => void;
}) {
  if (link.to === '/project/$id/result') {
    return (
      <Link
        to={link.to}
        params={link.params}
        search={link.search || {}}
        onClick={onClick}
        aria-label="跳转到任务来源页面"
        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        跳转来源
      </Link>
    );
  }

  if (link.to === '/assets/scenes') {
    return (
      <Link
        to={link.to}
        onClick={onClick}
        aria-label="跳转到任务来源页面"
        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        跳转来源
      </Link>
    );
  }

  return (
    <Link
      to={link.to}
      search={link.search || {}}
      onClick={onClick}
      aria-label="跳转到任务来源页面"
      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      跳转来源
    </Link>
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
      aria-label={
        hasActiveTasks
          ? `任务中心，当前有 ${activeCount} 个进行中任务`
          : '打开任务复盘中心'
      }
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-sm font-medium',
        hasActiveTasks
          ? 'bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
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
            <span className="text-xs text-[var(--ink-3)]">
              ({allTasks.length})
            </span>
          )}
        </>
      )}
    </button>
  );
}
