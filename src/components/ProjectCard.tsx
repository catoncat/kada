'use client';

import { Link } from '@tanstack/react-router';
import { Trash2, CheckCircle2, Clock, Sparkles, AlertCircle, Loader2, RefreshCw, MoreHorizontal, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectWithMeta } from '@/types/project';
import { Badge } from '@/components/ui/badge';
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from '@/components/ui/menu';

interface ProjectCardProps {
  project: ProjectWithMeta;
  onDelete?: () => void;
  onRename?: () => void;
  onRetry?: (taskId: string) => void;
}

const STATUS_CONFIG = {
  draft: {
    label: '草稿',
    icon: Clock,
    variant: 'outline',
  },
  configured: {
    label: '已配置',
    icon: CheckCircle2,
    variant: 'info',
  },
  generated: {
    label: '已生成',
    icon: Sparkles,
    variant: 'success',
  },
} as const;

function getTaskTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'plan-generation': '生成方案中...',
    'image-generation': '生成图片中...',
    'image-edit': '编辑图片中...',
    'asset-caption': '生成描述中...',
  };
  return labels[type] || '处理中...';
}

export function ProjectCard({ project, onDelete, onRename, onRetry }: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  return (
    <Link
      to="/"
      search={{ project: project.id }}
      className={cn(
        'group block rounded-2xl border bg-card p-5 text-card-foreground shadow-xs/5 transition-all',
        'hover:shadow-md hover:border-ring/24',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {/* 头部：标题 + 操作 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
            {project.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge
              className="rounded-full px-2"
              size="sm"
              variant={statusConfig.variant}
            >
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </Badge>
          </div>
        </div>

        {/* 操作菜单 */}
        {(onDelete || onRename) && (
          <Menu>
            <MenuTrigger
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className={cn(
                'rounded-lg p-2 text-muted-foreground transition opacity-0 group-hover:opacity-100',
                'hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <MoreHorizontal className="w-4 h-4" />
            </MenuTrigger>
            <MenuPopup>
              {onRename && (
                <MenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRename();
                  }}
                >
                  <Pencil className="w-4 h-4" />
                  重命名
                </MenuItem>
              )}
              {onRename && onDelete && <MenuSeparator />}
              {onDelete && (
                <MenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </MenuItem>
              )}
            </MenuPopup>
          </Menu>
        )}
      </div>

      {/* 资产摘要 */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {/* 场景 */}
        <div className="rounded-lg bg-muted/72 p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">场景</div>
          <div className={cn(
            'text-sm font-medium',
            project.selectedScene ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {project.selectedScene ? '已选' : '未选'}
          </div>
        </div>

        {/* 服装 */}
        <div className="rounded-lg bg-muted/72 p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">服装</div>
          <div className={cn(
            'text-sm font-medium',
            project.selectedOutfits?.length ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {project.selectedOutfits?.length || 0} 套
          </div>
        </div>

        {/* 道具 */}
        <div className="rounded-lg bg-muted/72 p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">道具</div>
          <div className={cn(
            'text-sm font-medium',
            project.selectedProps?.length ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {project.selectedProps?.length || 0} 个
          </div>
        </div>
      </div>

      {/* 方案和预览进度 */}
      {(project.planVersionCount || project.previewProgress) && (
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {project.planVersionCount && (
            <span>方案 v{project.currentPlanVersion}</span>
          )}
          {project.previewProgress && (
            <span className={cn(
              project.previewProgress.done === project.previewProgress.total
                ? 'text-success'
                : ''
            )}>
              预览图 {project.previewProgress.done}/{project.previewProgress.total}
            </span>
          )}
        </div>
      )}

      {/* 任务状态 */}
      {project.runningTask && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{getTaskTypeLabel(project.runningTask.type)}</span>
        </div>
      )}

      {/* 最后错误 */}
      {!project.runningTask && project.lastError && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-destructive">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {project.lastError.type}: {project.lastError.message}
            </span>
          </div>
          {onRetry && project.lastError.taskId && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRetry(project.lastError!.taskId!);
              }}
              className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
              title="重试"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* 底部时间 */}
      <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
        {project.updatedAt
          ? `更新于 ${new Date(project.updatedAt).toLocaleDateString('zh-CN')}`
          : project.createdAt
            ? `创建于 ${new Date(project.createdAt).toLocaleDateString('zh-CN')}`
            : ''}
      </div>
    </Link>
  );
}
