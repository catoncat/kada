'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type GeneratedPlan,
  type GeneratedScene,
  type SceneTaskTrack,
  PlanResultHeader,
  PlanVersionsDrawer,
  SceneCard,
} from '@/components/plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useProjectSceneTasks } from '@/hooks/useProjectSceneTasks';
import { useTasksPolling } from '@/hooks/useTasks';
import { generatePlan, getProject, updateProject } from '@/lib/projects-api';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  resolveResultPanel,
  type ResultSearchParams,
} from '@/lib/result-search-params';
import { createImageTask } from '@/lib/tasks-api';

const LOCKED_ASPECT_RATIO = 'photo';

function toIdleTrack(sceneIndex: number): SceneTaskTrack {
  return {
    sceneIndex,
    taskId: null,
    status: 'idle',
    createdAt: null,
    updatedAt: null,
    error: null,
  };
}

export const Route = createFileRoute('/project/$id/result')({
  component: ProjectResultPage,
  validateSearch: (search: Record<string, unknown>): ResultSearchParams =>
    parseResultSearchParams(search),
});

function ProjectResultPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openDrawer } = useTaskQueue();

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(
    new Set(),
  );
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [sceneTaskHint, setSceneTaskHint] = useState<string | null>(null);

  const resolvedPanel = resolveResultPanel(search);
  const sceneFromUrl = search.scene;

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
  });

  const plan = project?.generatedPlan as GeneratedPlan | null;

  const {
    latestTaskByScene,
    sceneTrackMap,
    refetch: refetchSceneTasks,
  } = useProjectSceneTasks(id);

  const regenerateMutation = useMutation({
    mutationFn: () => generatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  const updateSceneMutation = useMutation({
    mutationFn: (nextPlan: GeneratedPlan) =>
      updateProject(id, {
        generatedPlan: nextPlan,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  useTasksPolling(pendingTaskIds, {
    enabled: pendingTaskIds.length > 0,
    onAllComplete: () => {
      setPendingTaskIds([]);
      setGeneratingScenes(new Set());
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-tasks', id] });
    },
  });

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateMutation.mutateAsync();
    } catch (err) {
      alert(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  const enqueueSceneTask = useCallback(
    async (options: {
      sceneIndex: number;
      prompt: string;
      referenceImages?: string[];
    }) => {
      setGeneratingScenes((prev) => new Set(prev).add(options.sceneIndex));
      try {
        const task = await createImageTask(options.prompt, {
          relatedId: id,
          relatedMeta: JSON.stringify({ sceneIndex: options.sceneIndex }),
          referenceImages:
            options.referenceImages && options.referenceImages.length > 0
              ? options.referenceImages
              : undefined,
          owner: {
            type: 'planScene',
            id,
            slot: `scene:${options.sceneIndex}`,
          },
          options: {
            aspectRatio: LOCKED_ASPECT_RATIO,
          },
        });
        setPendingTaskIds((prev) => [...prev, task.id]);
        setSceneTaskHint(`场景 ${options.sceneIndex + 1} 已提交生成任务。`);
        await refetchSceneTasks();
      } catch (err) {
        console.error('Failed to create image task:', err);
        setSceneTaskHint(`场景 ${options.sceneIndex + 1} 任务创建失败，请重试。`);
        setGeneratingScenes((prev) => {
          const next = new Set(prev);
          next.delete(options.sceneIndex);
          return next;
        });
      }
    },
    [id, refetchSceneTasks],
  );

  const handleGenerateScenePreview = useCallback(
    async (sceneIndex: number, visualPrompt: string) => {
      const scene = plan?.scenes?.[sceneIndex];
      if (!scene || !visualPrompt.trim()) return;
      await enqueueSceneTask({
        sceneIndex,
        prompt: visualPrompt,
        referenceImages: [scene.sceneAssetImage].filter(Boolean) as string[],
      });
    },
    [enqueueSceneTask, plan?.scenes],
  );

  const handleViewRecentTasks = useCallback(
    (sceneIndex: number) => {
      const recentTask = latestTaskByScene.get(sceneIndex);
      if (recentTask) {
        navigate({
          to: '/project/$id/result',
          params: { id },
          search: {
            scene: sceneIndex,
            panel: 'task',
          },
        });
        setSceneTaskHint(`场景 ${sceneIndex + 1} 已打开任务中心。`);
        openDrawer();
        return;
      }

      setSceneTaskHint(`场景 ${sceneIndex + 1} 暂无任务，已打开任务中心。`);
      openDrawer();
    },
    [id, latestTaskByScene, navigate, openDrawer],
  );

  const handleExportPPT = () => {
    alert('PPT 导出功能将在后续版本实现');
  };

  const handleRefreshProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['project', id] });
    queryClient.invalidateQueries({ queryKey: ['project-tasks', id] });
  }, [id, queryClient]);

  const handleUpdateScene = useCallback(
    async (
      sceneIndex: number,
      patch: Partial<Pick<GeneratedScene, 'visualPrompt'>>,
    ) => {
      if (!plan?.scenes || !plan.scenes[sceneIndex]) return;
      const nextScenes = plan.scenes.map((scene, index) =>
        index === sceneIndex ? { ...scene, ...patch } : scene,
      );
      await updateSceneMutation.mutateAsync({
        ...plan,
        scenes: nextScenes,
      });
    },
    [plan, updateSceneMutation],
  );

  const previewProgress = useMemo(() => {
    if (!plan?.scenes) return { done: 0, total: 0 };
    const total = plan.scenes.length;
    const done = plan.scenes.filter((scene) => scene.previewArtifactPath).length;
    return { done, total };
  }, [plan?.scenes]);

  useEffect(() => {
    if (!plan?.scenes?.length) return;
    if (typeof sceneFromUrl !== 'number' || Number.isNaN(sceneFromUrl)) return;
    if (sceneFromUrl < 0 || sceneFromUrl >= plan.scenes.length) return;

    const el = document.getElementById(`scene-${sceneFromUrl}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plan?.scenes, sceneFromUrl]);

  useEffect(() => {
    if (search.openEdit !== '1') return;
    const cleaned = clearLegacyOpenEdit(search);
    navigate({
      to: '/project/$id/result',
      params: { id },
      search: cleaned,
      replace: true,
    });
  }, [id, navigate, search]);

  useEffect(() => {
    if (resolvedPanel !== 'task') return;
    openDrawer();
  }, [openDrawer, resolvedPanel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="error">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '项目不存在'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              search={{ project: id }}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              返回项目
            </Link>
            <h1 className="text-2xl font-semibold text-foreground">方案结果</h1>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-card p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">尚未生成方案</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              请先完成项目配置，然后点击「生成方案」按钮
            </p>
            <Button
              className="mt-6"
              render={<Link to="/" search={{ project: id }} />}
              variant="outline"
            >
              返回配置
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PlanResultHeader
        project={project}
        plan={plan}
        previewProgress={previewProgress}
        isRegenerating={isRegenerating}
        onOpenVersions={() => setShowVersions(true)}
        onRegenerate={handleRegenerate}
        onExportPPT={handleExportPPT}
        onOpenTaskCenter={openDrawer}
      />

      {sceneTaskHint ? (
        <Alert variant="info" className="mt-4">
          <AlertTitle>执行提示</AlertTitle>
          <AlertDescription>{sceneTaskHint}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 space-y-6">
        {plan.scenes.map((scene, index) => (
          <div key={`${scene.location}-${index}`} id={`scene-${index}`}>
            <SceneCard
              scene={scene}
              sceneIndex={index}
              projectId={project.id}
              autoOpenEdit={resolvedPanel === 'copy' && sceneFromUrl === index}
              isGenerating={generatingScenes.has(index)}
              onGeneratePreview={handleGenerateScenePreview}
              onImageChange={handleRefreshProject}
              onViewRecentTasks={handleViewRecentTasks}
              onUpdateScene={handleUpdateScene}
              taskTrack={sceneTrackMap.get(index) || toIdleTrack(index)}
            />
          </div>
        ))}
      </div>

      <PlanVersionsDrawer
        open={showVersions}
        onOpenChange={setShowVersions}
        projectId={project.id}
      />
    </div>
  );
}
