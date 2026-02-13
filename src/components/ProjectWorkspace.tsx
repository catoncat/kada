'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CustomerInfoForm } from '@/components/CustomerInfoForm';
import { GenerateButton } from '@/components/GenerateButton';
import { ModelConfigSection } from '@/components/ModelConfigSection';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { generatePlan, getProject, updateProject } from '@/lib/projects-api';
import { getImageUrl, getSceneAsset } from '@/lib/scene-assets-api';
import { fetchTasks, type Task } from '@/lib/tasks-api';
import type { ProjectModelConfig } from '@/types/model-asset';
import type { CustomerInfo } from '@/types/project';

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
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  });

  // 更新项目的 mutation
  const updateProjectMutation = useMutation({
    mutationFn: (data: {
      customer?: CustomerInfo;
      projectPrompt?: string | null;
      selectedModels?: string;
    }) => updateProject(projectId, data),
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
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">{project.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kada 咔哒 · 可控的分镜执行系统
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {project.status === 'generated' && project.generatedPlan ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link
                    to="/project/$id/result"
                    params={{ id: projectId }}
                    search={{}}
                  />
                }
              >
                查看方案
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
                分镜方案已生成
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
          <div className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <PhotoFrame
                  src={selectedSceneImageUrl}
                  alt={selectedScene?.name || '场景'}
                  className="h-20 flex-shrink-0 rounded-lg"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  }
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">场景</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {selectedScene ? '已选择' : '未选择'}
                    </span>
                  </div>

                  {selectedScene ? (
                    <div className="mt-1.5">
                      <p className="truncate text-sm font-medium">
                        {selectedScene.name}
                      </p>
                      {selectedScene.description && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {selectedScene.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      尚未选择场景，生成前建议先完成场景配置。
                    </p>
                  )}
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                render={
                  <Link to="/project/$id/scenes" params={{ id: projectId }} />
                }
              >
                配置场景
              </Button>
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
              项目提示词会直接参与后续 AI 生成上下文。
            </p>
          </div>

          {/* 客户信息区块 */}
          <CustomerInfoForm
            value={project.customer}
            onChange={handleCustomerChange}
          />

          {/* 模特配置区块 */}
          <ModelConfigSection
            customer={project.customer}
            selectedModels={project.selectedModels}
            onUpdate={(config: ProjectModelConfig) => {
              updateProjectMutation.mutate({
                selectedModels: JSON.stringify(config),
              });
            }}
          />

          {/* 生成结果入口已上移为固定提示，避免出现在页面最下面 */}
        </div>
      </div>
    </div>
  );
}
