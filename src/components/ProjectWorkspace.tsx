'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  ImageIcon,
  Shirt,
  Package,
  Settings2,
  Sparkles,
  Loader2,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { getProject, generatePlan, updateProject } from '@/lib/projects-api';
import { getSceneAsset, getImageUrl } from '@/lib/scene-assets-api';
import { fetchTasks, type Task } from '@/lib/tasks-api';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { GenerateButton } from '@/components/GenerateButton';
import { CustomerInfoForm } from '@/components/CustomerInfoForm';
import { ModelConfigSection } from '@/components/ModelConfigSection';
import { PhotoFrame } from '@/components/PhotoFrame';
import type { CustomerInfo } from '@/types/project';
import type { ProjectModelConfig } from '@/types/model-asset';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

interface ProjectWorkspaceProps {
  projectId: string | null;
}

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  // 空状态
  if (!projectId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-sm">选择一个项目开始工作</p>
        <p className="text-xs mt-1 opacity-60">或点击「新建项目」创建</p>
      </div>
    );
  }

  return <ProjectWorkspaceContent projectId={projectId} />;
}

function ProjectWorkspaceContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { onTaskComplete, openDrawer, refresh: refreshTasks } = useTaskQueue();
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [projectPromptDraft, setProjectPromptDraft] = useState('');

  // 获取项目数据
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  });

  // 更新项目的 mutation
  const updateProjectMutation = useMutation({
    mutationFn: (data: { customer?: CustomerInfo; projectPrompt?: string | null; selectedModels?: string }) =>
      updateProject(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  // 处理客户信息变更
  const handleCustomerChange = (customer: CustomerInfo | undefined) => {
    updateProjectMutation.mutate({ customer });
  };

  // 同步项目提示词（用于所有 AI 能力的上下文拼接）
  useEffect(() => {
    setProjectPromptDraft(project?.projectPrompt || '');
  }, [project?.projectPrompt]);

  const saveProjectPrompt = useDebouncedCallback((value: string) => {
    const next = value.trim();
    updateProjectMutation.mutate({ projectPrompt: next ? value : null });
  }, 600);

  // 获取已选场景详情
  const { data: selectedScene } = useQuery({
    queryKey: ['sceneAsset', project?.selectedScene],
    queryFn: () => getSceneAsset(project!.selectedScene!),
    enabled: !!project?.selectedScene,
  });
  const selectedSceneImageUrl = selectedScene?.primaryImage
    ? getImageUrl(selectedScene.primaryImage)
    : null;

  // 检查是否有进行中的生成任务
  useEffect(() => {
    async function checkActiveTask() {
      try {
        const tasks = await fetchTasks({
          relatedId: projectId,
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
  }, [projectId]);

  // 监听任务完成
  useEffect(() => {
    if (!activeTaskId) return;

    const unsubscribe = onTaskComplete(activeTaskId, (task: Task) => {
      setIsGenerating(false);
      setActiveTaskId(null);
      if (task.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      } else if (task.status === 'failed') {
        alert(`生成失败: ${task.error || '未知错误'}`);
      }
    });

    return unsubscribe;
  }, [activeTaskId, projectId, onTaskComplete, queryClient]);

  // 生成预案
  const handleGenerate = async (customPrompt?: string) => {
    if (!project?.selectedScene) {
      alert('请先选择场景');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generatePlan(projectId, {
        mode: 'execute',
        customPrompt,
      });
      setActiveTaskId(result.taskId);
      refreshTasks();
      openDrawer();
    } catch (err) {
      setIsGenerating(false);
      alert(err instanceof Error ? err.message : '创建任务失败');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Alert variant="error" className="max-w-md">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '项目不存在'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* 顶部标题栏 */}
      <header className="shrink-0 px-6 py-4 border-b bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-xl font-semibold truncate">{project.title}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {project.status === 'generated' && project.generatedPlan ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link to="/project/$id/result" params={{ id: projectId }} search={{}} />}
              >
                查看预案
              </Button>
            ) : null}
            <GenerateButton
              projectId={projectId}
              disabled={!project.selectedScene}
              isGenerating={isGenerating}
              onGenerate={handleGenerate}
            />
          </div>
        </div>
      </header>

      {/* 成功提示：固定在标题栏下方，避免出现在页面最底部 */}
      {project.status === 'generated' && project.generatedPlan ? (
        <div className="shrink-0 border-b bg-success/4 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="w-4 h-4 text-success" />
              <span className="text-sm font-medium text-success-foreground truncate">
                预案已生成
              </span>
            </div>
            <Link
              to="/project/$id/result"
              params={{ id: projectId }}
              search={{}}
              className="inline-flex items-center gap-1 text-sm text-success hover:underline shrink-0"
            >
              查看
              <span>→</span>
            </Link>
          </div>
        </div>
      ) : null}

      {/* 内容区域 */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 场景配置区块 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                {/* 场景缩略图 */}
                <PhotoFrame
                  src={selectedSceneImageUrl}
                  alt={selectedScene?.name || '场景'}
                  className="h-20 rounded-lg flex-shrink-0"
                  fallback={
                    <div className="h-full w-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  }
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-medium">场景</h3>
                  </div>
                  {selectedScene ? (
                    <div className="mt-1.5">
                      <p className="text-sm font-medium">{selectedScene.name}</p>
                      {selectedScene.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                          {selectedScene.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      尚未选择场景
                    </p>
                  )}
                </div>
              </div>

              <Link
                to="/project/$id/scenes"
                params={{ id: projectId }}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline flex-shrink-0"
              >
                配置
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* 项目提示词区块 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-medium">项目提示词</h3>
              <span className="text-xs text-muted-foreground">
                （参与所有 AI 能力的上下文拼接）
              </span>
            </div>

            <Textarea
              className="mt-3 resize-none"
              rows={4}
              placeholder="例如：品牌调性、镜头语言偏好、必须出现/避免的元素、风格约束等（可为空）"
              value={projectPromptDraft}
              onChange={(e) => {
                const v = e.target.value;
                setProjectPromptDraft(v);
                saveProjectPrompt(v);
              }}
            />

            <p className="mt-2 text-xs text-muted-foreground">
              规则可在「设置 → 提示词编排」中调整。
            </p>
          </div>

          {/* 客户信息区块 */}
          <CustomerInfoForm
            value={project.customer}
            onChange={handleCustomerChange}
          />

          {/* 模特配置区块 */}
          <ModelConfigSection
            projectId={projectId}
            customer={project.customer}
            selectedModels={project.selectedModels}
            onUpdate={(config: ProjectModelConfig) => {
              updateProjectMutation.mutate({
                selectedModels: JSON.stringify(config),
              });
            }}
          />

          {/* 服装配置区块 */}
          <div className="rounded-xl border border-border bg-card p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Shirt className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">服装</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.selectedOutfits?.length
                      ? `已选 ${project.selectedOutfits.length} 套`
                      : '待开发'}
                  </p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">配置 →</span>
            </div>
          </div>

          {/* 道具配置区块 */}
          <div className="rounded-xl border border-border bg-card p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Package className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">道具</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.selectedProps?.length
                      ? `已选 ${project.selectedProps.length} 个`
                      : '待开发'}
                  </p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">配置 →</span>
            </div>
          </div>

          {/* 拍摄参数配置区块 */}
          <div className="rounded-xl border border-border bg-card p-5 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">拍摄参数</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.params ? '已配置' : '待开发'}
                  </p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">配置 →</span>
            </div>
          </div>

          {/* 生成结果入口已上移为固定提示，避免出现在页面最下面 */}
        </div>
      </div>
    </div>
  );
}
