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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
          <h1 className="text-2xl font-semibold text-foreground">项目列表</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理你的拍摄项目，配置资产并生成预案
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          新建项目
        </Button>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <Alert variant="error">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      )}

      {/* 空状态 */}
      {!isLoading && !error && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-5">
              <FolderKanban className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium text-foreground">还没有项目</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              创建你的第一个拍摄项目，选择场景、服装和道具资产，然后生成专业的拍摄预案
            </p>
            <Button className="mt-8" onClick={handleCreate}>
              <Plus className="w-4 h-4" />
              新建项目
            </Button>
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
            <h2 className="text-lg font-semibold text-foreground mb-4">新建项目</h2>

            <div className="mb-6">
              <label
                className="block text-sm font-medium text-foreground mb-2"
                htmlFor="project-title"
              >
                项目名称
              </label>
              <Input
                id="project-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：婚纱客户A、电商产品拍摄"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={() => setIsCreateOpen(false)}
                disabled={createMutation.isPending}
                variant="outline"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !newTitle.trim()}
              >
                {createMutation.isPending ? '创建中...' : '创建'}
              </Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
