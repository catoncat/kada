'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Sparkles,
  Users,
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
import { cn } from '@/lib/utils';
import type { ProjectModelConfig } from '@/types/model-asset';
import type { CustomerInfo } from '@/types/project';

interface ProjectWorkspaceProps {
  projectId: string | null;
}

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  // 空状态
  if (!projectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
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
  const { onTaskComplete, refresh: refreshTasks } = useTaskQueue();
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
  const handleGenerate = async () => {
    if (!project?.selectedScene) {
      alert('请先选择场景');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generatePlan(projectId, {
        mode: 'execute',
      });
      setActiveTaskId(result.taskId);
      refreshTasks();
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
      <div className="flex h-full items-center justify-center p-8">
        <Alert variant="error" className="max-w-md">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '项目不存在'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasScene = Boolean(project.selectedScene);
  const peopleCount = project.customer?.people?.length ?? 0;
  const hasPeople = peopleCount > 0;
  const hasPrompt = Boolean(project.projectPrompt?.trim());
  const readyCount = [hasScene, hasPeople, hasPrompt].filter(Boolean).length;
  const isGenerated =
    project.status === 'generated' && Boolean(project.generatedPlan);
  const statusBadge = isGenerating
    ? {
        label: '处理中',
        className: 'bg-primary/10 text-primary',
      }
    : project.status === 'generated'
      ? {
          label: '已生成',
          className: 'bg-success/10 text-success',
        }
      : project.status === 'configured'
        ? {
            label: '已配置',
            className: 'bg-info/10 text-info',
          }
        : {
            label: '草稿',
            className: 'bg-muted text-muted-foreground',
          };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F5F5F7] dark:bg-[#1C1C1E]">
      <header className="shrink-0 border-b border-border/60 bg-background/90 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                statusBadge.className,
              )}
            >
              {statusBadge.label}
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold">
              {project.title}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              项目就绪度 {readyCount}/3 · 配置完整后可一键生成分镜方案
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {isGenerated ? (
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
              disabled={!hasScene}
              isGenerating={isGenerating}
              onGenerate={handleGenerate}
            />
          </div>
        </div>
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <section className="rounded-2xl border border-border/70 bg-card/95 px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">执行概览</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  建议先完成场景、人物和项目提示词，再启动生成任务。
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/85 px-3 py-1.5 text-sm font-medium">
                就绪 {readyCount}/3
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-border/70 bg-background/80 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ImageIcon className="h-3.5 w-3.5" />
                    场景
                  </div>
                  {hasScene ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-2 text-sm font-medium">
                  {hasScene ? selectedScene?.name || '已配置场景' : '未配置'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasScene ? '可直接用于生成分镜。' : '请选择至少 1 个场景。'}
                </p>
              </article>

              <article className="rounded-xl border border-border/70 bg-background/80 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    拍摄人物
                  </div>
                  {hasPeople ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-2 text-sm font-medium">
                  {hasPeople ? `已配置 ${peopleCount} 人` : '未配置'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  人物信息将影响模特映射和人物出图一致性。
                </p>
              </article>

              <article className="rounded-xl border border-border/70 bg-background/80 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    项目提示词
                  </div>
                  {hasPrompt ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-2 text-sm font-medium">
                  {hasPrompt ? '已填写' : '空白'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  提示词会拼接到所有 AI 能力请求中。
                </p>
              </article>
            </div>
          </section>

          {isGenerated ? (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
              <div className="inline-flex min-w-0 items-center gap-2 text-sm text-success-foreground">
                <Sparkles className="h-4 w-4 text-success" />
                分镜方案已生成，可继续调整配置后再次生成新版本。
              </div>
              <Link
                to="/project/$id/result"
                params={{ id: projectId }}
                search={{}}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-success hover:underline"
              >
                打开方案
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </section>
          ) : null}

          <section className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <PhotoFrame
                  src={selectedSceneImageUrl}
                  alt={selectedScene?.name || '场景'}
                  className="h-20 flex-shrink-0 rounded-lg"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  }
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">场景配置</h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        hasScene
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {hasScene ? '已就绪' : '未配置'}
                    </span>
                  </div>

                  {selectedScene ? (
                    <div className="mt-1.5">
                      <p className="truncate text-sm font-medium">
                        {selectedScene.name}
                      </p>
                      {selectedScene.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {selectedScene.description}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      尚未选择场景，建议先完成此步骤再生成方案。
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
          </section>

          <section className="rounded-xl border border-border/70 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">项目提示词</h3>
              <span className="text-xs text-muted-foreground">
                参与所有 AI 能力的上下文拼接
              </span>
            </div>

            <Textarea
              className="mt-3 min-h-[120px] resize-y bg-background/90"
              rows={5}
              placeholder="例如：品牌调性、镜头语言偏好、必须出现/避免的元素、风格约束等（可为空）"
              value={projectPromptDraft}
              onChange={(e) => {
                const v = e.target.value;
                setProjectPromptDraft(v);
                saveProjectPrompt(v);
              }}
            />

            <p className="mt-2 text-xs text-muted-foreground">
              自动保存已开启，停止输入后会在约 600ms 内同步。
            </p>
          </section>

          <CustomerInfoForm
            value={project.customer}
            onChange={handleCustomerChange}
          />

          <ModelConfigSection
            customer={project.customer}
            selectedModels={project.selectedModels}
            onUpdate={(config: ProjectModelConfig) => {
              updateProjectMutation.mutate({
                selectedModels: JSON.stringify(config),
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
