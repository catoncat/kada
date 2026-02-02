'use client';

import { Link } from '@tanstack/react-router';
import { Trash2, CheckCircle2, Clock, Sparkles, AlertCircle, Loader2, MoreHorizontal, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectWithMeta } from '@/types/project';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from '@/components/ui/menu';

interface ProjectListViewProps {
  projects: ProjectWithMeta[];
  onDelete?: (id: string, title: string) => void;
  onRename?: (id: string, title: string) => void;
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
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectListView({ projects, onDelete, onRename }: ProjectListViewProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[280px]">项目名称</TableHead>
          <TableHead className="w-[100px]">状态</TableHead>
          <TableHead className="w-[140px]">资产</TableHead>
          <TableHead className="w-[100px]">方案</TableHead>
          <TableHead className="w-[100px]">预览图</TableHead>
          <TableHead className="w-[140px]">更新时间</TableHead>
          <TableHead className="w-[60px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <ProjectListRow
            key={project.id}
            project={project}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
      </TableBody>
    </Table>
  );
}

interface ProjectListRowProps {
  project: ProjectWithMeta;
  onDelete?: (id: string, title: string) => void;
  onRename?: (id: string, title: string) => void;
}

function ProjectListRow({ project, onDelete, onRename }: ProjectListRowProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  // 资产摘要
  const assetSummary = [
    project.selectedScene ? '场景已选' : null,
    project.selectedOutfits?.length ? `${project.selectedOutfits.length}套服装` : null,
    project.selectedProps?.length ? `${project.selectedProps.length}道具` : null,
  ]
    .filter(Boolean)
    .join('，') || '未配置';

  // 方案版本
  const planDisplay = project.planVersionCount
    ? `v${project.currentPlanVersion}`
    : '-';

  // 预览图进度
  const previewDisplay = project.previewProgress
    ? `${project.previewProgress.done}/${project.previewProgress.total}`
    : '-';

  return (
    <TableRow className="group">
      {/* 项目名称 */}
      <TableCell>
        <Link
          to="/"
          search={{ project: project.id }}
          className="block hover:text-primary transition-colors"
        >
          <div className="font-medium truncate max-w-[260px]">{project.title}</div>
          {/* 显示任务状态或错误 */}
          {project.runningTask && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{getTaskTypeLabel(project.runningTask.type)}</span>
            </div>
          )}
          {!project.runningTask && project.lastError && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-destructive">
              <AlertCircle className="w-3 h-3" />
              <span className="truncate max-w-[200px]">
                {project.lastError.type}: {project.lastError.message}
              </span>
            </div>
          )}
        </Link>
      </TableCell>

      {/* 状态 */}
      <TableCell>
        <Badge
          className="rounded-full px-2"
          size="sm"
          variant={statusConfig.variant}
        >
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </Badge>
      </TableCell>

      {/* 资产 */}
      <TableCell>
        <span className="text-sm text-muted-foreground">{assetSummary}</span>
      </TableCell>

      {/* 方案 */}
      <TableCell>
        <span className={cn(
          'text-sm',
          project.planVersionCount ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {planDisplay}
        </span>
      </TableCell>

      {/* 预览图 */}
      <TableCell>
        <span className={cn(
          'text-sm',
          project.previewProgress?.done === project.previewProgress?.total
            ? 'text-foreground'
            : 'text-muted-foreground'
        )}>
          {previewDisplay}
        </span>
      </TableCell>

      {/* 更新时间 */}
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {formatDate(project.updatedAt)}
        </span>
      </TableCell>

      {/* 操作 */}
      <TableCell>
        {(onDelete || onRename) && (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    'text-muted-foreground hover:text-foreground'
                  )}
                />
              }
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </MenuTrigger>
            <MenuPopup>
              {onRename && (
                <MenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRename(project.id, project.title);
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
                    onDelete(project.id, project.title);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </MenuItem>
              )}
            </MenuPopup>
          </Menu>
        )}
      </TableCell>
    </TableRow>
  );
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
