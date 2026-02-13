import { Clock3, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SceneTaskTrack } from './types';

const STATUS_LABEL: Record<SceneTaskTrack['status'], string> = {
  idle: '暂无任务',
  pending: '排队中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
};

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export function SceneTaskRail({
  track,
  onViewTask,
}: {
  track: SceneTaskTrack;
  onViewTask?: (taskId: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {track.status === 'running' || track.status === 'pending' ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : track.status === 'failed' ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Clock3 className="h-4 w-4 text-muted-foreground" />
          )}
          最近一次任务轨道
        </div>
        <span className="text-xs text-muted-foreground">
          {STATUS_LABEL[track.status]}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div>创建时间：{formatTime(track.createdAt)}</div>
        <div>更新时间：{formatTime(track.updatedAt)}</div>
        {track.error ? (
          <div className="line-clamp-1 text-destructive">
            失败摘要：{track.error}
          </div>
        ) : null}
      </div>

      {track.taskId && onViewTask ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => onViewTask(track.taskId!)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          查看任务
        </Button>
      ) : null}
    </div>
  );
}
