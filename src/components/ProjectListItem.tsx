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
    className: 'text-muted-foreground',
  },
  configured: {
    icon: CheckCircle2,
    className: 'text-info',
  },
  generated: {
    icon: Sparkles,
    className: 'text-success',
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

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'w-full text-left px-2.5 py-2 rounded-md transition-colors mb-0.5',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'bg-accent',
        )}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
      >
        <div className="flex items-center gap-2.5">
          {/* 状态图标 */}
          <div className={cn('shrink-0', statusConfig.className)}>
            {project.runningTask ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : project.lastError ? (
              <AlertCircle className="w-4 h-4 text-destructive" />
            ) : (
              <StatusIcon className="w-4 h-4" />
            )}
          </div>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{project.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {project.runningTask ? (
                '处理中...'
              ) : project.lastError ? (
                <span className="text-destructive">有错误</span>
              ) : (
                <>
                  {formatRelativeDate(project.updatedAt)}
                  {(project.planVersionCount ?? 0) > 0 && (
                    <span className="ml-1.5">
                      · v{project.currentPlanVersion}
                    </span>
                  )}
                </>
              )}
            </div>
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
