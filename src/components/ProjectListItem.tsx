'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit2,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { ProjectWithMeta } from '@/types/project';

interface ProjectListItemProps {
  project: ProjectWithMeta;
  selected?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

const STATUS_CONFIG = {
  draft: {
    icon: Clock,
    label: '草稿',
    iconClassName: 'text-muted-foreground',
    badgeClassName: 'bg-muted text-muted-foreground',
  },
  configured: {
    icon: CheckCircle2,
    label: '已配置',
    iconClassName: 'text-info',
    badgeClassName: 'bg-info/10 text-info',
  },
  generated: {
    icon: Sparkles,
    label: '已生成',
    iconClassName: 'text-success',
    badgeClassName: 'bg-success/10 text-success',
  },
} as const;

function formatRelativeDate(date: Date | string | undefined | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return d.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}

export function ProjectListItem({
  project,
  selected,
  onSelect,
  onDoubleClick,
  onRename,
  onDelete,
}: ProjectListItemProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;
  const badgeText = project.lastError
    ? '异常'
    : project.runningTask
      ? '进行中'
      : statusConfig.label;
  const badgeClassName = project.lastError
    ? 'bg-destructive/10 text-destructive'
    : project.runningTask
      ? 'bg-primary/10 text-primary'
      : statusConfig.badgeClassName;
  const subline = project.runningTask
    ? '任务处理中...'
    : project.lastError
      ? `${project.lastError.type}: ${project.lastError.message}`
      : `更新于 ${formatRelativeDate(project.updatedAt)}`;
  const chips: string[] = [];
  if ((project.planVersionCount ?? 0) > 0) {
    chips.push(`方案 v${project.currentPlanVersion}`);
  }
  if (project.previewProgress) {
    chips.push(
      `预览 ${project.previewProgress.done}/${project.previewProgress.total}`,
    );
  }
  if (project.selectedScene) {
    chips.push('已选场景');
  }
  if ((project.customer?.people?.length ?? 0) > 0) {
    chips.push(`${project.customer?.people?.length ?? 0} 人`);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'mb-1 block w-full rounded-xl border px-3 py-2.5 text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected
            ? 'border-primary/30 bg-accent shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
            : 'border-transparent hover:border-border/70 hover:bg-accent/45',
        )}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/85',
              statusConfig.iconClassName,
            )}
          >
            {project.runningTask ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : project.lastError ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <StatusIcon className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="truncate text-sm font-medium">
                {project.title}
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  badgeClassName,
                )}
              >
                {badgeText}
              </span>
            </div>

            <div
              className={cn(
                'mt-1 truncate text-xs',
                project.lastError
                  ? 'text-destructive/85'
                  : 'text-muted-foreground',
              )}
            >
              {subline}
            </div>

            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuPopup>
        {onRename && (
          <ContextMenuItem onClick={onRename}>
            <Edit2 className="w-4 h-4" />
            重命名
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
              删除
            </ContextMenuItem>
          </>
        )}
      </ContextMenuPopup>
    </ContextMenu>
  );
}
