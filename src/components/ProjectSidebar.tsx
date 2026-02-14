'use client';

import { Plus } from 'lucide-react';
import { ProjectListItem } from '@/components/ProjectListItem';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ProjectWithMeta } from '@/types/project';

export type StatusFilter = 'all' | 'draft' | 'configured' | 'generated';
export type SortBy = 'updatedAt' | 'createdAt' | 'title';

interface ProjectSidebarProps {
  projects: ProjectWithMeta[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onOpenProject: (id: string) => void;
  onCreateProject: () => void;
  onRenameProject?: (project: ProjectWithMeta) => void;
  onDeleteProject?: (project: ProjectWithMeta) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  sortBy: SortBy;
  onSortChange: (value: SortBy) => void;
  // 统计数据
  counts: {
    all: number;
    draft: number;
    configured: number;
    generated: number;
  };
  isLoading?: boolean;
  isEmpty?: boolean;
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'configured', label: '已配置' },
  { value: 'generated', label: '已生成' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'updatedAt', label: '更新时间' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'title', label: '名称' },
];

export function ProjectSidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  counts,
  isLoading,
  isEmpty,
}: ProjectSidebarProps) {
  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.label || '更新时间';

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-background">
      <div className="border-b border-border/60 p-3">
        <Button onClick={onCreateProject} className="w-full" size="sm">
          <Plus className="w-4 h-4" />
          新建项目
        </Button>
      </div>

      <div className="px-3 pb-2 pt-3">
        <div className="grid grid-cols-2 gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onStatusChange(tab.value)}
              className={cn(
                'flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                'hover:border-border hover:bg-accent/45',
                statusFilter === tab.value
                  ? 'border-primary/30 bg-accent text-accent-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  : 'border-transparent text-foreground',
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  statusFilter === tab.value
                    ? 'text-accent-foreground/90'
                    : 'text-muted-foreground',
                )}
              >
                {counts[tab.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-3 border-t" />

      <div className="px-3 py-2">
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortBy)}>
          <SelectTrigger
            size="sm"
            className="w-full border-0 bg-transparent shadow-none"
          >
            <span className="text-xs text-muted-foreground">
              排序：{sortLabel}
            </span>
          </SelectTrigger>
          <SelectPopup>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        onWheel={(e) => e.stopPropagation()}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && isEmpty && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            还没有项目
          </div>
        )}

        {!isLoading && !isEmpty && projects.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            当前筛选下暂无项目
          </div>
        )}

        {!isLoading && projects.length > 0 && (
          <div className="px-2 pb-2">
            {projects.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                selected={project.id === selectedProjectId}
                onSelect={() => onSelectProject(project.id)}
                onDoubleClick={() => onOpenProject(project.id)}
                onRename={
                  onRenameProject ? () => onRenameProject(project) : undefined
                }
                onDelete={
                  onDeleteProject ? () => onDeleteProject(project) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
