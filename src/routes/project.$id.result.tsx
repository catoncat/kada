'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type GeneratedPlan,
  type GeneratedScene,
  PlanResultHeader,
  PlanVersionsDrawer,
  SceneCard,
  type SceneTaskTrack,
} from '@/components/plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useArtifacts } from '@/hooks/useArtifacts';
import { useProjectSceneTasks } from '@/hooks/useProjectSceneTasks';
import { useTasksPolling } from '@/hooks/useTasks';
import { generatePlan, getProject, updateProject } from '@/lib/projects-api';
import { previewImagePrompt } from '@/lib/prompts-api';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  type ResultSearchParams,
  resolveResultPanel,
} from '@/lib/result-search-params';
import { type GenerationArtifact } from '@/lib/artifacts-api';
import { createImageTask } from '@/lib/tasks-api';

const LOCKED_ASPECT_RATIO = 'photo';

function resolveSceneIdentity(
  scene: GeneratedScene,
  sceneIndex: number,
): {
  sceneId: string | null;
  sceneKey: string;
} {
  const sceneId =
    typeof scene.id === 'string' && scene.id.trim() ? scene.id.trim() : null;
  const sceneKey = sceneId || String(sceneIndex);
  return { sceneId, sceneKey };
}

function normalizeSlotValue(ownerSlot?: string | null): string | null {
  if (!ownerSlot || !ownerSlot.startsWith('scene:')) return null;
  const raw = ownerSlot.slice('scene:'.length).trim();
  return raw || null;
}

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
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(
    new Set(),
  );
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [sceneTaskHint, setSceneTaskHint] = useState<string | null>(null);
  const [optimizeUndoByScene, setOptimizeUndoByScene] = useState<
    Record<string, string>
  >({});

  const resolvedPanel = resolveResultPanel(search);
  const sceneFromUrl = search.scene;
  const sceneIdFromUrl = search.sceneId;

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
  const {
    data: artifactsData,
    isLoading: isArtifactsLoading,
    error: artifactsError,
  } = useArtifacts({
    ownerType: 'planScene',
    ownerId: id,
  });

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
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
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
      sceneId?: string | null;
      prompt: string;
      referenceImages?: string[];
      parentArtifactId?: string;
    }) => {
      const sceneKey = options.sceneId || String(options.sceneIndex);
      setGeneratingScenes((prev) => new Set(prev).add(sceneKey));
      try {
        const task = await createImageTask(options.prompt, {
          relatedId: id,
          relatedMeta: JSON.stringify({
            sceneIndex: options.sceneIndex,
            sceneId: options.sceneId || null,
          }),
          referenceImages:
            options.referenceImages && options.referenceImages.length > 0
              ? options.referenceImages
              : undefined,
          parentArtifactId: options.parentArtifactId,
          owner: {
            type: 'planScene',
            id,
            slot: options.sceneId
              ? `scene:${options.sceneId}`
              : `scene:${options.sceneIndex}`,
          },
          options: {
            aspectRatio: LOCKED_ASPECT_RATIO,
          },
        });
        setPendingTaskIds((prev) => [...prev, task.id]);
        setSceneTaskHint(`分镜 ${options.sceneIndex + 1} 已提交生成任务。`);
        await refetchSceneTasks();
      } catch (err) {
        console.error('Failed to create image task:', err);
        setSceneTaskHint(
          `分镜 ${options.sceneIndex + 1} 任务创建失败，请重试。`,
        );
        setGeneratingScenes((prev) => {
          const next = new Set(prev);
          next.delete(sceneKey);
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
      const { sceneId } = resolveSceneIdentity(scene, sceneIndex);
      await enqueueSceneTask({
        sceneIndex,
        sceneId,
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
        setSceneTaskHint(`分镜 ${sceneIndex + 1} 已打开任务中心。`);
        openDrawer();
        return;
      }

      setSceneTaskHint(`分镜 ${sceneIndex + 1} 暂无任务，已打开任务中心。`);
      openDrawer();
    },
    [id, latestTaskByScene, navigate, openDrawer],
  );

  const handleExportPPT = () => {
    alert('PPT 导出功能将在后续版本实现');
  };

  const handleUpdateScene = useCallback(
    async (
      sceneIndex: number,
      patch: Partial<
        Pick<
          GeneratedScene,
          | 'location'
          | 'description'
          | 'shots'
          | 'lighting'
          | 'visualPrompt'
          | 'selectedArtifactId'
        >
      >,
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

  const handleOptimizePrompt = useCallback(
    async (sceneIndex: number, visualPrompt: string) => {
      const scene = plan?.scenes?.[sceneIndex];
      const sourcePrompt = visualPrompt.trim();
      if (!scene || !sourcePrompt) return;
      const { sceneId, sceneKey } = resolveSceneIdentity(scene, sceneIndex);

      try {
        const preview = await previewImagePrompt(
          {
            prompt: sourcePrompt,
            owner: {
              type: 'planScene',
              id,
              slot: sceneId ? `scene:${sceneId}` : `scene:${sceneIndex}`,
            },
            referenceImages: scene.sceneAssetImage
              ? [scene.sceneAssetImage]
              : undefined,
            includeCurrentImageAsReference: false,
          },
          { forceRefresh: true },
        );

        const optimizedPrompt = (
          preview.renderPrompt ||
          preview.effectivePrompt ||
          ''
        ).trim();
        if (!optimizedPrompt || optimizedPrompt === sourcePrompt) {
          setSceneTaskHint(`分镜 ${sceneIndex + 1} 优化后无变化。`);
          return;
        }

        setOptimizeUndoByScene((prev) => ({
          ...prev,
          [sceneKey]: sourcePrompt,
        }));
        await handleUpdateScene(sceneIndex, { visualPrompt: optimizedPrompt });
        setSceneTaskHint(`分镜 ${sceneIndex + 1} 已应用优化提示词。`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '未知错误，请稍后重试';
        setSceneTaskHint(`分镜 ${sceneIndex + 1} 优化失败：${message}`);
      }
    },
    [handleUpdateScene, id, plan?.scenes],
  );

  const handleUndoOptimize = useCallback(
    async (sceneIndex: number) => {
      const scene = plan?.scenes?.[sceneIndex];
      if (!scene) return;
      const { sceneKey } = resolveSceneIdentity(scene, sceneIndex);
      const previousPrompt = optimizeUndoByScene[sceneKey];
      if (!previousPrompt) return;

      await handleUpdateScene(sceneIndex, { visualPrompt: previousPrompt });
      setOptimizeUndoByScene((prev) => {
        const next = { ...prev };
        delete next[sceneKey];
        return next;
      });
      setSceneTaskHint(`分镜 ${sceneIndex + 1} 已撤销最近一次优化。`);
    },
    [handleUpdateScene, optimizeUndoByScene, plan?.scenes],
  );

  const historyArtifactsByScene = useMemo(() => {
    const slotMap = new Map<string, GenerationArtifact[]>();
    const allArtifacts = artifactsData?.artifacts || [];
    for (const artifact of allArtifacts) {
      const slotValue = normalizeSlotValue(artifact.ownerSlot);
      if (!slotValue) continue;
      if (!slotMap.has(slotValue)) {
        slotMap.set(slotValue, []);
      }
      slotMap.get(slotValue)?.push(artifact);
    }

    const sceneHistoryMap = new Map<string, GenerationArtifact[]>();
    if (!plan?.scenes) return sceneHistoryMap;

    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex += 1) {
      const scene = plan.scenes[sceneIndex];
      const { sceneId, sceneKey } = resolveSceneIdentity(scene, sceneIndex);
      const slotCandidates = [String(sceneIndex)];
      if (sceneId) slotCandidates.unshift(sceneId);

      const merged = slotCandidates.flatMap((slot) => slotMap.get(slot) || []);
      const dedupedById = new Map<string, GenerationArtifact>();
      for (const artifact of merged) {
        if (!artifact.id || dedupedById.has(artifact.id)) continue;
        dedupedById.set(artifact.id, artifact);
      }

      const history = [...dedupedById.values()].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

      sceneHistoryMap.set(sceneKey, history);
    }
    return sceneHistoryMap;
  }, [artifactsData?.artifacts, plan?.scenes]);

  const handleSelectHistoryArtifact = useCallback(
    async (sceneIndex: number, artifactId: string) => {
      const scene = plan?.scenes?.[sceneIndex];
      if (!scene) return;
      await handleUpdateScene(sceneIndex, { selectedArtifactId: artifactId });
      setSceneTaskHint(`分镜 ${sceneIndex + 1} 已切换当前选中图。`);
    },
    [handleUpdateScene, plan?.scenes],
  );

  const handleGenerateFromSelected = useCallback(
    async (sceneIndex: number, visualPrompt: string) => {
      const scene = plan?.scenes?.[sceneIndex];
      if (!scene || !visualPrompt.trim()) return;
      const { sceneId, sceneKey } = resolveSceneIdentity(scene, sceneIndex);
      const historyArtifacts = historyArtifactsByScene.get(sceneKey) || [];
      const selectedArtifact =
        historyArtifacts.find((item) => item.id === scene.selectedArtifactId) ||
        historyArtifacts[0];

      if (!selectedArtifact?.filePath) {
        setSceneTaskHint(`分镜 ${sceneIndex + 1} 缺少可用历史图，无法基于选中图生成。`);
        return;
      }

      const referenceImages = [
        scene.sceneAssetImage,
        selectedArtifact.filePath.startsWith('/')
          ? selectedArtifact.filePath
          : `/${selectedArtifact.filePath}`,
      ].filter(Boolean) as string[];

      await enqueueSceneTask({
        sceneIndex,
        sceneId,
        prompt: visualPrompt,
        referenceImages,
        parentArtifactId: selectedArtifact.id,
      });
    },
    [enqueueSceneTask, historyArtifactsByScene, plan?.scenes],
  );

  const previewProgress = useMemo(() => {
    if (!plan?.scenes) return { done: 0, total: 0 };
    const total = plan.scenes.length;
    const done = plan.scenes.filter(
      (scene) => scene.previewArtifactPath,
    ).length;
    return { done, total };
  }, [plan?.scenes]);

  useEffect(() => {
    if (!plan?.scenes?.length) return;

    let targetElement: HTMLElement | null = null;
    if (sceneIdFromUrl) {
      targetElement =
        document.getElementById(`scene-${sceneIdFromUrl}`) || null;
    } else if (
      typeof sceneFromUrl === 'number' &&
      !Number.isNaN(sceneFromUrl)
    ) {
      const scene = plan.scenes[sceneFromUrl];
      if (scene) {
        const { sceneKey } = resolveSceneIdentity(scene, sceneFromUrl);
        targetElement = document.getElementById(`scene-${sceneKey}`) || null;
      }
    }

    targetElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plan?.scenes, sceneFromUrl, sceneIdFromUrl]);

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
            <h3 className="text-lg font-medium text-foreground">
              尚未生成方案
            </h3>
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
          <AlertTitle>生成提示</AlertTitle>
          <AlertDescription>{sceneTaskHint}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 space-y-6">
        {plan.scenes.map((scene, index) => {
          const { sceneKey } = resolveSceneIdentity(scene, index);
          const historyArtifacts = historyArtifactsByScene.get(sceneKey) || [];
          const selectedHistoryArtifactId =
            scene.selectedArtifactId || historyArtifacts[0]?.id || null;
          return (
            <div key={`scene-${sceneKey}`} id={`scene-${sceneKey}`}>
              <SceneCard
                scene={scene}
                sceneIndex={index}
                isGenerating={generatingScenes.has(sceneKey)}
                onGeneratePreview={handleGenerateScenePreview}
                onGenerateFromSelected={handleGenerateFromSelected}
                onOptimizePrompt={handleOptimizePrompt}
                onUndoOptimize={handleUndoOptimize}
                onViewRecentTasks={handleViewRecentTasks}
                onUpdateScene={handleUpdateScene}
                onSelectHistoryArtifact={handleSelectHistoryArtifact}
                taskTrack={sceneTrackMap.get(index) || toIdleTrack(index)}
                canUndoOptimize={Boolean(optimizeUndoByScene[sceneKey])}
                historyArtifacts={historyArtifacts.map((artifact) => ({
                  id: artifact.id,
                  filePath: artifact.filePath || '',
                  createdAt: artifact.createdAt,
                }))}
                selectedHistoryArtifactId={selectedHistoryArtifactId}
                canGenerateFromSelected={historyArtifacts.length > 0}
                isHistoryLoading={isArtifactsLoading}
                historyError={
                  artifactsError instanceof Error
                    ? artifactsError.message
                    : null
                }
              />
            </div>
          );
        })}
      </div>

      <PlanVersionsDrawer
        open={showVersions}
        onOpenChange={setShowVersions}
        projectId={project.id}
      />
    </div>
  );
}
