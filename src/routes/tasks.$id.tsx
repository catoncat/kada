'use client';

import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  History,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useReplayTask, useTaskDetail } from '@/hooks/useTasks';
import { apiUrl } from '@/lib/api-config';
import {
  getSourceLinkFromDeepLinkSearch,
  getTaskSourceLink,
  parseSceneIndexFromTask,
  parseTaskDeepLinkSearch,
  type TaskDeepLinkSearch,
  type TaskSourceLink,
} from '@/lib/task-recovery';
import {
  fetchTasks,
  isApiError,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type Task,
} from '@/lib/tasks-api';
import type { TaskPromptContext, TaskPromptOptimization } from '@/types/task-detail';

export const Route = createFileRoute('/tasks/$id')({
  component: TaskDeepLinkPage,
  validateSearch: (search: Record<string, unknown>): TaskDeepLinkSearch =>
    parseTaskDeepLinkSearch(search),
});

interface TaskReferenceSummary {
  totalCount: number;
  identity: string[];
  scene: string[];
  dropped: string[];
}

interface TaskPromptOptimizationSummary {
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

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getPromptOptimizationSummary(
  promptContext?: TaskPromptContext | null,
): TaskPromptOptimizationSummary | null {
  if (!promptContext || typeof promptContext !== 'object') return null;
  const raw = promptContext.promptOptimization as TaskPromptOptimization | undefined;
  if (!raw || typeof raw !== 'object') return null;

  const status =
    raw.status === 'optimized' || raw.status === 'fallback' || raw.status === 'skipped'
      ? raw.status
      : 'skipped';

  const summary: TaskPromptOptimizationSummary = {
    status,
    reason: toText(raw.reason),
    providerId: toText(raw.providerId),
    providerFormat: toText(raw.providerFormat),
    textModel: toText(raw.textModel),
    assumptions: toStringArray(raw.assumptions),
    conflicts: toStringArray(raw.conflicts),
    sourcePrompt: toText(raw.sourcePrompt),
    renderPrompt: toText(raw.renderPrompt),
  };

  if (
    !summary.reason &&
    !summary.providerId &&
    !summary.textModel &&
    summary.assumptions.length === 0 &&
    summary.conflicts.length === 0 &&
    !summary.sourcePrompt &&
    !summary.renderPrompt
  ) {
    return null;
  }

  return summary;
}

function getReferenceSummary(
  promptContext?: TaskPromptContext | null,
): TaskReferenceSummary | null {
  if (!promptContext || typeof promptContext !== 'object') return null;

  const identity = toStringArray(promptContext.referenceImagesByRole?.identity);
  const scene = toStringArray(promptContext.referenceImagesByRole?.scene);
  const dropped = toStringArray(promptContext.droppedReferenceImages);
  if (identity.length === 0 && scene.length === 0 && dropped.length === 0)
    return null;

  const totalCountRaw = promptContext.referenceImagesCount;
  const totalCount =
    typeof totalCountRaw === 'number' && Number.isFinite(totalCountRaw)
      ? totalCountRaw
      : identity.length + scene.length;

  return { totalCount, identity, scene, dropped };
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

function ReferenceImageList({
  items,
  keyPrefix,
}: {
  items: string[];
  keyPrefix: string;
}) {
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
}

function TaskDeepLinkPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { openDrawer } = useTaskQueue();

  const detailQuery = useTaskDetail(id, {
    refetchInterval: 1200,
  });

  const replayMutation = useReplayTask();

  const fallbackRelatedId = search.relatedId || search.projectId;

  const recentTasksQuery = useQuery({
    queryKey: ['tasks', 'same-source', fallbackRelatedId, search.sceneIndex],
    enabled: !!fallbackRelatedId,
    queryFn: async () => {
      const tasks = await fetchTasks({
        relatedId: fallbackRelatedId,
        limit: 50,
      });

      const filtered = tasks
        .filter((task) => task.id !== id)
        .filter((task) => {
          if (typeof search.sceneIndex !== 'number') return true;
          return parseSceneIndexFromTask(task) === search.sceneIndex;
        })
        .sort((a, b) => {
          const t1 = new Date(a.createdAt || 0).getTime();
          const t2 = new Date(b.createdAt || 0).getTime();
          return t2 - t1;
        });

      return filtered.slice(0, 10);
    },
  });

  const errorMessage =
    detailQuery.error instanceof Error ? detailQuery.error.message : null;
  const isNotFound =
    isApiError(detailQuery.error) && detailQuery.error.status === 404;
  const sourceLink = detailQuery.data
    ? getTaskSourceLink(detailQuery.data.task as Task, detailQuery.data)
    : getSourceLinkFromDeepLinkSearch(search);

  const handleBackToTaskList = () => {
    openDrawer();
    if (search.projectId || search.relatedId) {
      navigate({
        to: '/',
        search: {
          project: search.projectId || search.relatedId,
        },
      });
      return;
    }

    navigate({ to: '/' });
  };

  const handleReplay = async () => {
    const result = await replayMutation.mutateAsync({ taskId: id });
    navigate({
      to: '/tasks/$id',
      params: { id: result.task.id },
      search,
    });
  };

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载任务详情...
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>任务不存在或已删除</AlertTitle>
          <AlertDescription>
            当前深链无法直接打开任务详情，你可以使用下面的恢复动作继续排查。
          </AlertDescription>
        </Alert>

        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-medium">恢复动作</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleBackToTaskList}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              返回任务列表
            </Button>

            {sourceLink ? <SourceButton link={sourceLink} /> : null}
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-medium">同来源最近任务</h2>
          {!fallbackRelatedId ? (
            <p className="mt-2 text-xs text-muted-foreground">
              当前深链未提供来源信息，无法定位同来源任务。
            </p>
          ) : recentTasksQuery.isLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">
              正在查询最近任务...
            </p>
          ) : recentTasksQuery.data && recentTasksQuery.data.length > 0 ? (
            <div className="mt-2 space-y-2">
              {recentTasksQuery.data.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {TASK_TYPE_LABELS[task.type] || task.type}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {TASK_STATUS_LABELS[task.status]} ·{' '}
                      {new Date(task.createdAt || '').toLocaleString()}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link
                        to="/tasks/$id"
                        params={{ id: task.id }}
                        search={{
                          sourceType: search.sourceType,
                          projectId: search.projectId,
                          relatedId: search.relatedId,
                          sceneIndex: search.sceneIndex,
                        }}
                      />
                    }
                  >
                    查看
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              未找到同来源任务记录。
            </p>
          )}
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {errorMessage || '任务详情加载失败'}
          </AlertDescription>
        </Alert>

        <Button size="sm" variant="outline" onClick={handleBackToTaskList}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          返回任务列表
        </Button>
      </div>
    );
  }

  const detail = detailQuery.data;
  const referenceSummary = getReferenceSummary(detail.run?.promptContext);
  const optimizationSummary = getPromptOptimizationSummary(detail.run?.promptContext);
  const sourceComposedPrompt =
    optimizationSummary?.sourcePrompt &&
    optimizationSummary.sourcePrompt !== detail.run?.effectivePrompt
      ? optimizationSummary.sourcePrompt
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">任务 ID</p>
        <p className="text-sm font-medium">{detail.task.id}</p>

        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
          <p>类型：{TASK_TYPE_LABELS[detail.task.type] || detail.task.type}</p>
          <p>
            状态：
            {TASK_STATUS_LABELS[
              detail.task.status as keyof typeof TASK_STATUS_LABELS
            ] || detail.task.status}
          </p>
          <p>创建：{new Date(detail.task.createdAt || '').toLocaleString()}</p>
          <p>更新：{new Date(detail.task.updatedAt || '').toLocaleString()}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleBackToTaskList}>
            <History className="mr-1 h-3.5 w-3.5" />
            返回任务列表
          </Button>

          <Button
            size="sm"
            onClick={handleReplay}
            disabled={replayMutation.isPending}
          >
            {replayMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            按原参数再生成
          </Button>

          {sourceLink ? <SourceButton link={sourceLink} /> : null}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="text-sm font-medium">Prompt 复盘</h2>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
          {detail.run?.effectivePrompt ||
            JSON.stringify(detail.task.input, null, 2)}
        </pre>

        {sourceComposedPrompt && (
          <details className="mt-3 rounded-lg border bg-muted/40 p-3">
            <summary className="cursor-pointer text-xs font-medium">
              查看优化前 composed prompt
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
              {sourceComposedPrompt}
            </pre>
          </details>
        )}

        <div className="mt-3 rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium">Prompt 优化摘要</h3>
            <span className="text-2xs text-muted-foreground">
              {!optimizationSummary
                ? '暂无数据'
                : optimizationSummary.status === 'optimized'
                  ? '已优化'
                  : optimizationSummary.status === 'fallback'
                    ? '优化失败（已回退）'
                    : '已跳过'}
            </span>
          </div>

          {!optimizationSummary ? (
            <p className="text-xs text-muted-foreground">
              该任务未记录优化器摘要（可能为旧任务或未启用）。
            </p>
          ) : (
            <div className="space-y-2 text-2xs">
              <div className="grid gap-2 md:grid-cols-2">
                <div>provider: {optimizationSummary.providerId || '-'}</div>
                <div>model: {optimizationSummary.textModel || '-'}</div>
                <div>format: {optimizationSummary.providerFormat || '-'}</div>
              </div>
              {optimizationSummary.reason && (
                <div className="text-amber-700">
                  原因：{optimizationSummary.reason}
                </div>
              )}

              {(optimizationSummary.assumptions.length > 0 ||
                optimizationSummary.conflicts.length > 0) && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="font-medium text-muted-foreground">
                      assumptions
                    </div>
                    {optimizationSummary.assumptions.length === 0 ? (
                      <div className="text-muted-foreground">无</div>
                    ) : (
                      <div className="space-y-0.5">
                        {optimizationSummary.assumptions.map((item) => (
                          <div key={`assume-${item}`}>{item}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-muted-foreground">
                      conflicts
                    </div>
                    {optimizationSummary.conflicts.length === 0 ? (
                      <div className="text-muted-foreground">无</div>
                    ) : (
                      <div className="space-y-0.5">
                        {optimizationSummary.conflicts.map((item) => (
                          <div key={`conflict-${item}`}>{item}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium">参考图注入摘要</h3>
            <span className="text-2xs text-muted-foreground">
              {referenceSummary
                ? `总计 ${referenceSummary.totalCount} 张`
                : '暂无数据'}
            </span>
          </div>

          {!referenceSummary ? (
            <p className="text-xs text-muted-foreground">
              该任务未记录参考图摘要（可能未使用参考图）。
            </p>
          ) : (
            <div className="space-y-2 text-2xs">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="font-medium text-muted-foreground">
                    identity（{referenceSummary.identity.length}）
                  </div>
                  <ReferenceImageList
                    items={referenceSummary.identity}
                    keyPrefix="identity"
                  />
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">
                    scene（{referenceSummary.scene.length}）
                  </div>
                  <ReferenceImageList
                    items={referenceSummary.scene}
                    keyPrefix="scene"
                  />
                </div>
              </div>

              {referenceSummary.dropped.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                  已自动过滤 {referenceSummary.dropped.length} 张历史生成图：
                  <div className="mt-1">
                    <ReferenceImageList
                      items={referenceSummary.dropped}
                      keyPrefix="dropped"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceButton({ link }: { link: TaskSourceLink }) {
  if (link.to === '/project/$id/result') {
    return (
      <Button
        size="sm"
        variant="outline"
        render={
          <Link to={link.to} params={link.params} search={link.search || {}} />
        }
      >
        <ExternalLink className="mr-1 h-3.5 w-3.5" />
        {link.label || '跳转来源页面'}
      </Button>
    );
  }

  if (link.to === '/assets/scenes') {
    return (
      <Button size="sm" variant="outline" render={<Link to={link.to} />}>
        <ExternalLink className="mr-1 h-3.5 w-3.5" />
        {link.label || '跳转来源页面'}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      render={<Link to={link.to} search={link.search || {}} />}
    >
      <ExternalLink className="mr-1 h-3.5 w-3.5" />
      {link.label || '跳转来源页面'}
    </Button>
  );
}
