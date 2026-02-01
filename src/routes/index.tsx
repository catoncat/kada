'use client';

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderKanban, Loader2 } from 'lucide-react';
import { ProjectCard } from '@/components/ProjectCard';
import { getProjects, createProject, deleteProject } from '@/lib/projects-api';
import {
  Dialog,
  DialogPopup,
} from '@/components/ui/dialog';

export const Route = createFileRoute('/')(
  {
    component: ProjectListPage,
  }
);

function ProjectListPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // 获取项目列表
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  // 创建项目
  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateOpen(false);
      setNewTitle('');
    },
  });

  // 删除项目
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const handleCreate = () => {
    setNewTitle('');
    setIsCreateOpen(true);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createMutation.mutateAsync({ title: newTitle.trim() });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定要删除项目「${title}」吗？此操作无法撤销。`)) {
      return;
    }
    deleteMutation.mutate(id);
  };

  const projects = data?.data || [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">项目列表</h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            管理你的拍摄项目，配置资产并生成预案
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          加载失败：{error instanceof Error ? error.message : '未知错误'}
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && !error && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-[var(--paper-2)] flex items-center justify-center mb-5">
              <FolderKanban className="w-10 h-10 text-[var(--ink-3)]" />
            </div>
            <h3 className="text-xl font-medium text-[var(--ink)]">还没有项目</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)] max-w-md">
              创建你的第一个拍摄项目，选择场景、服装和道具资产，然后生成专业的拍摄预案
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" />
              新建项目
            </button>
          </div>
        </div>
      )}

      {/* 项目列表 */}
      {!isLoading && !error && projects.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => handleDelete(project.id, project.title)}
            />
          ))}
        </div>
      )}

      {/* 新建项目对话框 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogPopup
          className="w-full max-w-md p-6"
          showCloseButton={false}
        >
          <form onSubmit={handleSubmitCreate}>
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">新建项目</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--ink)] mb-2">
                项目名称
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：婚纱客户A、电商产品拍摄"
                className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                disabled={createMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)] transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !newTitle.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
