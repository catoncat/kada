'use client';

import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ImageIcon, Shirt, Package, Settings2, Sparkles, Loader2 } from 'lucide-react';
import { getProject, generatePlan, updateProject } from '@/lib/projects-api';
import { getSceneAsset, getImageUrl } from '@/lib/scene-assets-api';
import { fetchTasks, Task } from '@/lib/tasks-api';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { CustomerInfoForm } from '@/components/CustomerInfoForm';
import { GenerateButton } from '@/components/GenerateButton';
import type { CustomerInfo } from '@/types/project';

export const Route = createFileRoute('/projects/$id')({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { onTaskComplete, openDrawer, refresh: refreshTasks } = useTaskQueue();
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // 获取项目数据
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
  });

  // 获取已选场景详情
  const { data: selectedScene } = useQuery({
    queryKey: ['sceneAsset', project?.selectedScene],
    queryFn: () => getSceneAsset(project!.selectedScene!),
    enabled: !!project?.selectedScene,
  });

  // 更新项目的 mutation
  const updateProjectMutation = useMutation({
    mutationFn: (data: { customer?: CustomerInfo }) => updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  // 检查是否有进行中的生成任务
  useEffect(() => {
    async function checkActiveTask() {
      try {
        const tasks = await fetchTasks({
          relatedId: id,
          type: 'plan-generation',
          status: ['pending', 'running'],
        });
        if (tasks.length > 0) {
          setActiveTaskId(tasks[0].id);
          setIsGenerating(true);
        }
      } catch {
        // 忽略错误
      }
    }
    checkActiveTask();
  }, [id]);

  // 监听任务完成
  useEffect(() => {
    if (!activeTaskId) return;

    const unsubscribe = onTaskComplete(activeTaskId, (task: Task) => {
      setIsGenerating(false);
      setActiveTaskId(null);
      if (task.status === 'completed') {
        // 刷新项目数据
        queryClient.invalidateQueries({ queryKey: ['project', id] });
      } else if (task.status === 'failed') {
        alert(`生成失败: ${task.error || '未知错误'}`);
      }
    });

    return unsubscribe;
  }, [activeTaskId, id, onTaskComplete, queryClient]);

  // 生成预案（支持 customPrompt）
  const handleGenerate = async (customPrompt?: string) => {
    if (!project?.selectedScene) {
      alert('请先选择场景');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generatePlan(id, {
        mode: 'execute',
        customPrompt,
      });
      setActiveTaskId(result.taskId);
      // 刷新任务队列
      refreshTasks();
      // 打开任务抽屉让用户看到进度
      openDrawer();
    } catch (err) {
      setIsGenerating(false);
      alert(err instanceof Error ? err.message : '创建任务失败');
    }
  };

  // 客户信息变更
  const handleCustomerChange = (customer: CustomerInfo | undefined) => {
    updateProjectMutation.mutate({ customer });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error instanceof Error ? error.message : '项目不存在'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">{project.title}</h1>
        </div>
        <GenerateButton
          projectId={id}
          disabled={!project.selectedScene}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
        />
      </div>

      {/* 配置区块 */}
      <div className="grid gap-4">
        {/* 场景配置区块 */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* 场景缩略图 */}
              <div className="w-24 h-24 rounded-xl bg-[var(--paper-2)] flex-shrink-0 overflow-hidden">
                {selectedScene?.primaryImage ? (
                  <img
                    src={getImageUrl(selectedScene.primaryImage)}
                    alt={selectedScene.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-[var(--ink-3)]" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[var(--ink-3)]" />
                  <h3 className="text-lg font-medium text-[var(--ink)]">场景</h3>
                </div>
                {selectedScene ? (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-[var(--ink)]">{selectedScene.name}</p>
                    {selectedScene.description && (
                      <p className="mt-1 text-sm text-[var(--ink-2)] line-clamp-2">
                        {selectedScene.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--ink-3)]">尚未选择场景</p>
                )}
              </div>
            </div>

            <Link
              to="/project/$id/scenes"
              params={{ id }}
              className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline flex-shrink-0"
            >
              配置
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* 客户信息配置区块 */}
        <CustomerInfoForm
          value={project.customer}
          onChange={handleCustomerChange}
        />

        {/* 服装配置区块 */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 opacity-60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--paper-2)] flex items-center justify-center">
                <Shirt className="w-6 h-6 text-[var(--ink-3)]" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--ink)]">服装</h3>
                <p className="mt-1 text-sm text-[var(--ink-3)]">
                  {project.selectedOutfits?.length
                    ? `已选 ${project.selectedOutfits.length} 套`
                    : '待开发'}
                </p>
              </div>
            </div>
            <span className="text-sm text-[var(--ink-3)]">配置 →</span>
          </div>
        </div>

        {/* 道具配置区块 */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 opacity-60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--paper-2)] flex items-center justify-center">
                <Package className="w-6 h-6 text-[var(--ink-3)]" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--ink)]">道具</h3>
                <p className="mt-1 text-sm text-[var(--ink-3)]">
                  {project.selectedProps?.length
                    ? `已选 ${project.selectedProps.length} 个`
                    : '待开发'}
                </p>
              </div>
            </div>
            <span className="text-sm text-[var(--ink-3)]">配置 →</span>
          </div>
        </div>

        {/* 拍摄参数配置区块 */}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 opacity-60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--paper-2)] flex items-center justify-center">
                <Settings2 className="w-6 h-6 text-[var(--ink-3)]" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--ink)]">拍摄参数</h3>
                <p className="mt-1 text-sm text-[var(--ink-3)]">
                  {project.params ? '已配置' : '待开发'}
                </p>
              </div>
            </div>
            <span className="text-sm text-[var(--ink-3)]">配置 →</span>
          </div>
        </div>
      </div>

      {/* 生成结果入口 */}
      {project.status === 'generated' && project.generatedPlan && (
        <div className="mt-6">
          <Link
            to="/project/$id/result"
            params={{ id }}
            className="block rounded-2xl border border-green-200 bg-green-50 p-6 hover:bg-green-100 transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">已生成预案，点击查看</span>
              </div>
              <span className="text-green-600">→</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
