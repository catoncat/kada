'use client';

import { Plus, Search } from 'lucide-react';
import { ProjectListItem } from '@/components/ProjectListItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  // 筛选状态
  search: string;
  onSearchChange: (value: string) => void;
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
  search,
  onSearchChange,
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
    <aside className="w-[280px] shrink-0 border-r flex min-h-0 flex-col bg-sidebar">
      {/* 新建按钮 */}
      <div className="p-3">
        <Button onClick={onCreateProject} className="w-full" size="sm">
          <Plus className="w-4 h-4" />
          新建项目
        </Button>
      </div>

      {/* 搜索框 */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="搜索项目..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 bg-sidebar-accent/50"
            size="sm"
          />
        </div>
      </div>

      {/* 状态筛选标签 */}
      <div className="px-3 pb-2">
        <div className="flex flex-col gap-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onStatusChange(tab.value)}
              className={cn(
                'flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                'hover:bg-sidebar-accent',
                statusFilter === tab.value
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground',
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  statusFilter === tab.value
                    ? 'text-sidebar-accent-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {counts[tab.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="mx-3 border-t" />

      {/* 排序选择 */}
      <div className="px-3 py-2">
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortBy)}>
          <SelectTrigger
            size="sm"
            className="w-full bg-transparent border-0 shadow-none"
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

      {/* 项目列表 */}
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
            没有匹配的项目
          </div>
        )}

        {!isLoading && projects.length > 0 && (
          <div className="px-2">
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
