'use client';

import { Search, LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectPopup,
  SelectItem,
} from '@/components/ui/select';
import { ToggleGroup, Toggle } from '@/components/ui/toggle-group';
import type { ProjectStatus } from '@/types/project';

export type ViewMode = 'card' | 'list';
export type SortBy = 'updatedAt' | 'createdAt' | 'title';
export type StatusFilter = 'all' | ProjectStatus;

interface ProjectListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  sortBy: SortBy;
  onSortChange: (value: SortBy) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'configured', label: '已配置' },
  { value: 'generated', label: '已生成' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'updatedAt', label: '更新时间' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'title', label: '名称' },
];

export function ProjectListToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}: ProjectListToolbarProps) {
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || '全部状态';
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || '更新时间';

  return (
    <div className="flex items-center gap-3 mb-6">
      {/* 搜索框 */}
      <div className="relative w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="搜索项目..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          size="sm"
        />
      </div>

      {/* 状态筛选 */}
      <Select
        value={statusFilter}
        onValueChange={(value) => onStatusChange(value as StatusFilter)}
      >
        <SelectTrigger size="sm" className="w-[100px]">
          <span className="truncate">{statusLabel}</span>
        </SelectTrigger>
        <SelectPopup>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      {/* 排序 */}
      <Select
        value={sortBy}
        onValueChange={(value) => onSortChange(value as SortBy)}
      >
        <SelectTrigger size="sm" className="w-[100px]">
          <span className="truncate">{sortLabel}</span>
        </SelectTrigger>
        <SelectPopup>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      {/* 视图切换 */}
      <ToggleGroup
        value={[viewMode]}
        onValueChange={(values) => {
          if (values.length > 0) {
            onViewModeChange(values[0] as ViewMode);
          }
        }}
        variant="outline"
        size="sm"
      >
        <Toggle value="card" aria-label="卡片视图">
          <LayoutGrid className="w-4 h-4" />
        </Toggle>
        <Toggle value="list" aria-label="列表视图">
          <List className="w-4 h-4" />
        </Toggle>
      </ToggleGroup>
    </div>
  );
}
