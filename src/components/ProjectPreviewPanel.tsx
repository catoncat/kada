'use client';

import { Link } from '@tanstack/react-router';
import {
  ExternalLink,
  Pencil,
  Trash2,
  Sparkles,
  Clock,
  CheckCircle2,
  MapPin,
  Shirt,
  Package,
  Loader2,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectWithMeta } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProjectPreviewPanelProps {
  project: ProjectWithMeta | null;
  onRename?: () => void;
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

function formatDate(date: Date | string | undefined | null): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTaskTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'plan-generation': '生成方案中...',
    'image-generation': '生成图片中...',
    'image-edit': '编辑图片中...',
    'asset-caption': '生成描述中...',
  };
  return labels[type] || '处理中...';
}

export function ProjectPreviewPanel({
  project,
  onRename,
  onDelete,
}: ProjectPreviewPanelProps) {
  // 空状态
  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-sm">选择一个项目查看详情</p>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="p-6 border-b">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold truncate">{project.title}</h2>
            <div className="mt-2 flex items-center gap-2">
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
        </div>

        {/* 任务状态 */}
        {project.runningTask && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{getTaskTypeLabel(project.runningTask.type)}</span>
          </div>
        )}

        {/* 错误状态 */}
        {!project.runningTask && project.lastError && (
          <div className="mt-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {project.lastError.type}: {project.lastError.message}
            </span>
          </div>
        )}
      </div>

      {/* 内容区 - 可滚动 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 资产概览 */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            资产配置
          </h3>
          <div className="space-y-2">
            <AssetItem
              icon={MapPin}
              label="场景"
              value={project.selectedScene ? '已选择' : '未配置'}
              configured={!!project.selectedScene}
            />
            <AssetItem
              icon={Shirt}
              label="服装"
              value={
                project.selectedOutfits?.length
                  ? `${project.selectedOutfits.length} 套`
                  : '未配置'
              }
              configured={!!project.selectedOutfits?.length}
            />
            <AssetItem
              icon={Package}
              label="道具"
              value={
                project.selectedProps?.length
                  ? `${project.selectedProps.length} 个`
                  : '未配置'
              }
              configured={!!project.selectedProps?.length}
            />
          </div>
        </section>

        {/* 方案信息 */}
        {(project.planVersionCount ?? 0) > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              方案信息
            </h3>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">当前版本</span>
                <span className="font-medium">v{project.currentPlanVersion}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">总版本数</span>
                <span>{project.planVersionCount}</span>
              </div>
              {project.previewProgress && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">预览图</span>
                  <span
                    className={cn(
                      project.previewProgress.done ===
                        project.previewProgress.total
                        ? 'text-success'
                        : ''
                    )}
                  >
                    {project.previewProgress.done}/{project.previewProgress.total}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 时间信息 */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            时间信息
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">创建时间</span>
              <span>{formatDate(project.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">更新时间</span>
              <span>{formatDate(project.updatedAt)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* 底部操作栏 */}
      <div className="p-4 border-t bg-muted/30 space-y-3">
        <Button
          className="w-full"
          render={<Link to="/" search={{ project: project.id }} />}
        >
          <ExternalLink className="w-4 h-4" />
          打开项目
        </Button>
        <div className="flex gap-2">
          {onRename && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={onRename}
            >
              <Pencil className="w-4 h-4" />
              重命名
            </Button>
          )}
          {onDelete && (
            <Button
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="w-4 h-4" />
              删除
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetItem({
  icon: Icon,
  label,
  value,
  configured,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  configured: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          configured ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div
          className={cn(
            'text-xs',
            configured ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
