'use client';

import { Link } from '@tanstack/react-router';
import { Trash2, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';

interface ProjectCardProps {
  project: Project;
  onDelete?: () => void;
}

const STATUS_CONFIG = {
  draft: {
    label: '草稿',
    icon: Clock,
    color: 'text-[var(--ink-3)]',
    bg: 'bg-[var(--paper-2)]',
  },
  configured: {
    label: '已配置',
    icon: CheckCircle2,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  generated: {
    label: '已生成',
    icon: Sparkles,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
};

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  return (
    <Link
      to="/project/$id"
      params={{ id: project.id }}
      className="block rounded-2xl border border-[var(--line)] bg-white p-5 hover:shadow-md hover:border-[var(--ink-3)] transition-all group"
    >
      {/* 头部：标题 + 操作 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-[var(--ink)] truncate group-hover:text-[var(--primary)] transition-colors">
            {project.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              statusConfig.bg,
              statusConfig.color
            )}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </span>
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
            className="p-2 rounded-lg text-[var(--ink-3)] hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
            title="删除项目"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 资产摘要 */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {/* 场景 */}
        <div className="rounded-lg bg-[var(--paper-2)] p-3 text-center">
          <div className="text-xs text-[var(--ink-3)] mb-1">场景</div>
          <div className={cn(
            'text-sm font-medium',
            project.selectedScene ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
          )}>
            {project.selectedScene ? '已选' : '未选'}
          </div>
        </div>

        {/* 服装 */}
        <div className="rounded-lg bg-[var(--paper-2)] p-3 text-center">
          <div className="text-xs text-[var(--ink-3)] mb-1">服装</div>
          <div className={cn(
            'text-sm font-medium',
            project.selectedOutfits?.length ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
          )}>
            {project.selectedOutfits?.length || 0} 套
          </div>
        </div>

        {/* 道具 */}
        <div className="rounded-lg bg-[var(--paper-2)] p-3 text-center">
          <div className="text-xs text-[var(--ink-3)] mb-1">道具</div>
          <div className={cn(
            'text-sm font-medium',
            project.selectedProps?.length ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
          )}>
            {project.selectedProps?.length || 0} 个
          </div>
        </div>
      </div>

      {/* 底部时间 */}
      <div className="mt-4 pt-3 border-t border-[var(--line)] text-xs text-[var(--ink-3)]">
        {project.updatedAt
          ? `更新于 ${new Date(project.updatedAt).toLocaleDateString('zh-CN')}`
          : project.createdAt
            ? `创建于 ${new Date(project.createdAt).toLocaleDateString('zh-CN')}`
            : ''}
      </div>
    </Link>
  );
}
