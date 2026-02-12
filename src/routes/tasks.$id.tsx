'use client';

import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft, ExternalLink, History, Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useReplayTask, useTaskDetail } from '@/hooks/useTasks';
import {
  fetchTasks,
  isApiError,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type Task,
} from '@/lib/tasks-api';
import {
  getTaskSourceLink,
  getSourceLinkFromDeepLinkSearch,
  parseSceneIndexFromTask,
  parseTaskDeepLinkSearch,
  type TaskDeepLinkSearch,
  type TaskSourceLink,
} from '@/lib/task-recovery';

export const Route = createFileRoute('/tasks/$id')({
  component: TaskDeepLinkPage,
  validateSearch: (search: Record<string, unknown>): TaskDeepLinkSearch =>
    parseTaskDeepLinkSearch(search),
});

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
      const tasks = await fetchTasks({ relatedId: fallbackRelatedId, limit: 50 });

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

  const errorMessage = detailQuery.error instanceof Error ? detailQuery.error.message : null;
  const isNotFound = isApiError(detailQuery.error) && detailQuery.error.status === 404;
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

            {sourceLink ? (
              <SourceButton link={sourceLink} />
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-medium">同来源最近任务</h2>
          {!fallbackRelatedId ? (
            <p className="mt-2 text-xs text-muted-foreground">
              当前深链未提供来源信息，无法定位同来源任务。
            </p>
          ) : recentTasksQuery.isLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">正在查询最近任务...</p>
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
                      {TASK_STATUS_LABELS[task.status]} · {new Date(task.createdAt || '').toLocaleString()}
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

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">任务 ID</p>
        <p className="text-sm font-medium">{detail.task.id}</p>

        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
          <p>类型：{TASK_TYPE_LABELS[detail.task.type] || detail.task.type}</p>
          <p>状态：{TASK_STATUS_LABELS[detail.task.status as keyof typeof TASK_STATUS_LABELS] || detail.task.status}</p>
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
          {detail.run?.effectivePrompt || JSON.stringify(detail.task.input, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function SourceButton({
  link,
}: {
  link: TaskSourceLink;
}) {
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
