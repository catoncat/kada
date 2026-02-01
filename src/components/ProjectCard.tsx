'use client';

import { Link } from '@tanstack/react-router';
import { Trash2, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';
import { Badge } from '@/components/ui/badge';

interface ProjectCardProps {
  project: Project;
  onDelete?: () => void;
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

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  return (
    <Link
      to="/project/$id"
      params={{ id: project.id }}
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

        {/* 删除按钮 */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className={cn(
              'rounded-lg p-2 text-muted-foreground transition opacity-0 group-hover:opacity-100',
              'hover:bg-destructive/10 hover:text-destructive',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            title="删除项目"
          >
            <Trash2 className="w-4 h-4" />
          </button>
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
