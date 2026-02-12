'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ProjectSidebar,
  type SortBy,
  type StatusFilter,
} from '@/components/ProjectSidebar';
import { ProjectWorkspace } from '@/components/ProjectWorkspace';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  createProject,
  deleteProject,
  getProjects,
  updateProject,
} from '@/lib/projects-api';
import type { ProjectWithMeta } from '@/types/project';

// Search params 类型
interface IndexSearchParams {
  action?: 'create';
  project?: string;
}

export const Route = createFileRoute('/')({
  component: ProjectListPage,
  validateSearch: (search: Record<string, unknown>): IndexSearchParams => ({
    action: search.action === 'create' ? 'create' : undefined,
    project: typeof search.project === 'string' ? search.project : undefined,
  }),
});

function ProjectListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { action, project: projectFromUrl } = Route.useSearch();

  // 选中的项目
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectFromUrl || null,
  );

  // 对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [projectToRename, setProjectToRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  // 筛选状态
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');

  // 处理 action=create 参数
  useEffect(() => {
    if (action === 'create') {
      setIsCreateOpen(true);
      navigate({ to: '/', search: {}, replace: true });
    }
  }, [action, navigate]);

  // 同步 URL 中的 project 参数
  useEffect(() => {
    if (projectFromUrl !== selectedProjectId) {
      setSelectedProjectId(projectFromUrl || null);
    }
  }, [projectFromUrl, selectedProjectId]);

  // 获取项目列表
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  // 创建项目
  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateOpen(false);
      setNewTitle('');
      setSelectedProjectId(newProject.id);
      navigate({ to: '/', search: { project: newProject.id }, replace: true });
    },
  });

  // 删除项目
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteDialogOpen(false);
      if (projectToDelete?.id === selectedProjectId) {
        setSelectedProjectId(null);
        navigate({ to: '/', search: {}, replace: true });
      }
      setProjectToDelete(null);
    },
  });

  // 重命名项目
  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateProject(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({
        queryKey: ['project', projectToRename?.id],
      });
      setRenameDialogOpen(false);
      setProjectToRename(null);
      setRenameTitle('');
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

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    navigate({ to: '/', search: { project: id }, replace: true });
  };

  const handleOpenProject = (id: string) => {
    // 旧的 /project/$id 详情页已移除：双击等同于选中并在右侧打开详情
    setSelectedProjectId(id);
    navigate({ to: '/', search: { project: id }, replace: true });
  };

  const handleSubmitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTitle.trim() || !projectToRename) return;
    renameMutation.mutate({
      id: projectToRename.id,
      title: renameTitle.trim(),
    });
  };

  // 原始项目列表
  const projects = (data?.data || []) as ProjectWithMeta[];

  // 计算各状态的数量
  const counts = useMemo(() => {
    return {
      all: projects.length,
      draft: projects.filter((p) => p.status === 'draft').length,
      configured: projects.filter((p) => p.status === 'configured').length,
      generated: projects.filter((p) => p.status === 'generated').length,
    };
  }, [projects]);

  // 过滤和排序项目
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // 搜索过滤
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(searchLower),
      );
    }

    // 状态过滤
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    // 排序
    result.sort((a, b) => {
      switch (sortBy) {
        case 'updatedAt': {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        }
        case 'createdAt': {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        }
        case 'title':
          return a.title.localeCompare(b.title, 'zh-CN');
        default:
          return 0;
      }
    });

    return result;
  }, [projects, search, statusFilter, sortBy]);

  // 如果有筛选结果但当前选中项不在列表中，自动选中第一个
  useEffect(() => {
    if (
      filteredProjects.length > 0 &&
      selectedProjectId &&
      !filteredProjects.find((p) => p.id === selectedProjectId)
    ) {
      // 当前选中项被过滤掉了，不自动切换，保持显示
    }
  }, [filteredProjects, selectedProjectId]);

  return (
    <div className="h-full min-h-0 flex bg-background overflow-hidden">
      {/* 左侧边栏 */}
      <ProjectSidebar
        projects={filteredProjects}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onOpenProject={handleOpenProject}
        onCreateProject={handleCreate}
        onRenameProject={(project) => {
          setProjectToRename({ id: project.id, title: project.title });
          setRenameTitle(project.title);
          setRenameDialogOpen(true);
        }}
        onDeleteProject={(project) => {
          setProjectToDelete({ id: project.id, title: project.title });
          setDeleteDialogOpen(true);
        }}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        counts={counts}
        isLoading={isLoading}
        isEmpty={!isLoading && !error && projects.length === 0}
      />

      {/* 右侧工作区 */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <ProjectWorkspace projectId={selectedProjectId} />
      </main>

      {/* 新建项目对话框 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogPopup className="w-full max-w-md p-6" showCloseButton={false}>
          <form onSubmit={handleSubmitCreate}>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              新建项目
            </h2>

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
                type="button"
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

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除项目「{projectToDelete?.title}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (projectToDelete) {
                  deleteMutation.mutate(projectToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* 重命名对话框 */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogPopup className="w-full max-w-md p-6" showCloseButton={false}>
          <form onSubmit={handleSubmitRename}>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              重命名项目
            </h2>

            <div className="mb-6">
              <label
                className="block text-sm font-medium text-foreground mb-2"
                htmlFor="rename-title"
              >
                项目名称
              </label>
              <Input
                id="rename-title"
                type="text"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                placeholder="输入新的项目名称"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                onClick={() => setRenameDialogOpen(false)}
                disabled={renameMutation.isPending}
                variant="outline"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={renameMutation.isPending || !renameTitle.trim()}
              >
                {renameMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
