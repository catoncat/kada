'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type GeneratedPlan,
  type GeneratedScene,
  type ResultMode,
  type SceneTaskTrack,
  PlanResultHeader,
  PlanVersionsDrawer,
  ResultModeSwitch,
  ReviewBoard,
  SceneCard,
} from '@/components/plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTaskQueue } from '@/contexts/TaskQueueContext';
import { useProjectSceneTasks } from '@/hooks/useProjectSceneTasks';
import { useTasksPolling } from '@/hooks/useTasks';
import {
  buildAcceptanceFixTemplate,
  evaluateSceneAcceptance,
  extractIdentityBindings,
} from '@/lib/acceptance-rules';
import {
  confirmExecutionChecklist,
  getExecutionChecklistSnapshot,
  isChecklistConfirmed,
} from '@/lib/execution-checklist';
import { generatePlan, getProject, updateProject } from '@/lib/projects-api';
import {
  clearLegacyOpenEdit,
  parseResultSearchParams,
  resolveResultMode,
  type ResultSearchParams,
} from '@/lib/result-search-params';
import { resolveSceneExecutionState } from '@/lib/scene-execution-state';
import { createImageTask } from '@/lib/tasks-api';
import type { TaskPromptContext, TaskPromptReferencePlan } from '@/types/task-detail';

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

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getManualPassStorageKey(
  projectId: string,
  sceneIndex: number,
  planFingerprint: string,
): string {
  return `spv2:scene-pass:${projectId}:${sceneIndex}:${planFingerprint}`;
}

function readManualPass(
  projectId: string,
  sceneIndex: number,
  planFingerprint: string,
): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.localStorage.getItem(
      getManualPassStorageKey(projectId, sceneIndex, planFingerprint),
    ) === '1'
  );
}

function writeManualPass(
  projectId: string,
  sceneIndex: number,
  planFingerprint: string,
  value: boolean,
): void {
  if (typeof window === 'undefined') return;
  const key = getManualPassStorageKey(projectId, sceneIndex, planFingerprint);
  if (value) {
    window.localStorage.setItem(key, '1');
    return;
  }
  window.localStorage.removeItem(key);
}

function getReferenceImagesFromPromptContext(
  promptContext?: TaskPromptContext | null,
): string[] {
  if (!promptContext || typeof promptContext !== 'object') return [];
  const plan = promptContext.referencePlan as
    | TaskPromptReferencePlan
    | undefined;
  const byRole = plan?.byRole || promptContext.referenceImagesByRole;
  return Array.from(
    new Set([
      ...toStringArray(byRole?.scene),
      ...toStringArray(byRole?.identity),
      ...toStringArray(plan?.identitySourceImages),
    ]),
  );
}

function getFallbackIdentityBindingsFromProject(
  selectedModelsRaw: string | null | undefined,
): Array<{ index: number; image: string }> {
  if (!selectedModelsRaw) return [];
  try {
    const parsed = JSON.parse(selectedModelsRaw) as {
      personModelMap?: Record<string, string>;
    };
    const values = Object.values(parsed.personModelMap || {})
      .map((item) => item.trim())
      .filter(Boolean);
    return values.map((modelId, index) => ({
      index: index + 1,
      image: `model:${modelId}`,
    }));
  } catch {
    return [];
  }
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
  const [batchTaskIds, setBatchTaskIds] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [sceneTaskHint, setSceneTaskHint] = useState<string | null>(null);
  const [pendingBatchSceneIndices, setPendingBatchSceneIndices] = useState<
    number[]
  >([]);
  const [fixPanelSceneIndex, setFixPanelSceneIndex] = useState<number | null>(
    null,
  );
  const [isFixing, setIsFixing] = useState(false);
  const [checklistVersion, setChecklistVersion] = useState(0);
  const [manualPassVersion, setManualPassVersion] = useState(0);

  const resolvedMode = resolveResultMode(search);
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
    detailByScene,
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

  useTasksPolling(batchTaskIds, {
    enabled: batchTaskIds.length > 0,
    onAllComplete: () => {
      setBatchTaskIds([]);
      setGeneratingScenes(new Set());
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-tasks', id] });
    },
  });

  const expectedPeopleCount = Math.max(project?.customer?.people?.length || 1, 1);

  const checklistMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getExecutionChecklistSnapshot>>();
    if (!plan?.scenes) return map;
    const fallbackIdentityBindings = getFallbackIdentityBindingsFromProject(
      project?.selectedModels,
    );
    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex += 1) {
      const scene = plan.scenes[sceneIndex];
      const promptContext =
        detailByScene.get(sceneIndex)?.run?.promptContext ||
        detailByScene.get(sceneIndex)?.artifacts?.[0]?.promptContext ||
        null;
      const identityBindings = extractIdentityBindings(
        promptContext as TaskPromptContext | null,
      );
      map.set(
        sceneIndex,
        getExecutionChecklistSnapshot({
          projectId: id,
          sceneIndex,
          scene,
          expectedPeopleCount,
          identityBindings:
            identityBindings.length > 0
              ? identityBindings
              : fallbackIdentityBindings,
          lockedAspectRatio: LOCKED_ASPECT_RATIO,
        }),
      );
    }
    return map;
  }, [
    detailByScene,
    expectedPeopleCount,
    id,
    plan?.scenes,
    checklistVersion,
    project?.selectedModels,
  ]);

  const acceptanceMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof evaluateSceneAcceptance>>();
    if (!plan?.scenes) return map;
    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex += 1) {
      map.set(
        sceneIndex,
        evaluateSceneAcceptance({
          scene: plan.scenes[sceneIndex],
          expectedPeopleCount,
          lockedAspectRatio: LOCKED_ASPECT_RATIO,
          latestTask: latestTaskByScene.get(sceneIndex) || null,
          latestTaskDetail: detailByScene.get(sceneIndex) || null,
        }),
      );
    }
    return map;
  }, [detailByScene, expectedPeopleCount, latestTaskByScene, plan?.scenes]);

  const manualPassedMap = useMemo(() => {
    const map = new Map<number, boolean>();
    if (!plan?.scenes) return map;
    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex += 1) {
      const checklist = checklistMap.get(sceneIndex);
      if (!checklist) continue;
      map.set(
        sceneIndex,
        readManualPass(id, sceneIndex, checklist.planFingerprint),
      );
    }
    return map;
  }, [id, checklistMap, manualPassVersion, plan?.scenes]);

  const executionStateMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof resolveSceneExecutionState>>();
    if (!plan?.scenes) return map;
    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex += 1) {
      const scene = plan.scenes[sceneIndex];
      const checklist = checklistMap.get(sceneIndex);
      map.set(
        sceneIndex,
        resolveSceneExecutionState({
          checklistConfirmed: isChecklistConfirmed(checklist),
          hasPreviewImage: Boolean(scene.previewArtifactPath),
          latestTrack: sceneTrackMap.get(sceneIndex) || toIdleTrack(sceneIndex),
          acceptance: acceptanceMap.get(sceneIndex) || null,
          manualPassed: Boolean(manualPassedMap.get(sceneIndex)),
        }),
      );
    }
    return map;
  }, [acceptanceMap, checklistMap, manualPassedMap, plan?.scenes, sceneTrackMap]);

  const handleSwitchMode = useCallback(
    (nextMode: ResultMode) => {
      navigate({
        to: '/project/$id/result',
        params: { id },
        search: {
          scene: sceneFromUrl,
          mode: nextMode,
        },
      });
    },
    [id, navigate, sceneFromUrl],
  );

  const handleOpenEditFromReview = useCallback(
    (sceneIndex: number) => {
      navigate({
        to: '/project/$id/result',
        params: { id },
        search: {
          scene: sceneIndex,
          mode: 'execute',
        },
      });
    },
    [id, navigate],
  );

  const handleViewRecentTasks = useCallback(
    (sceneIndex: number) => {
      const recentTask = latestTaskByScene.get(sceneIndex);
      if (recentTask) {
        setSceneTaskHint(null);
        navigate({
          to: '/tasks/$id',
          params: { id: recentTask.id },
          search: {
            sourceType: 'projectResult',
            projectId: id,
            relatedId: id,
            sceneIndex,
            mode: 'execute',
          },
        });
        return;
      }

      setSceneTaskHint(`场景 ${sceneIndex + 1} 暂无历史任务，已打开任务中心。`);
      openDrawer();
    },
    [id, latestTaskByScene, navigate, openDrawer],
  );

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
      editInstruction?: string;
      taskOptions?: Record<string, unknown>;
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
          editInstruction: options.editInstruction,
          options: options.taskOptions,
        });
        setBatchTaskIds((prev) => [...prev, task.id]);
        setSceneTaskHint(`场景 ${options.sceneIndex + 1} 已入队执行。`);
        await refetchSceneTasks();
      } catch (err) {
        console.error('Failed to create image task:', err);
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
      if (!scene) return;
      const referenceImages = [scene.sceneAssetImage].filter(Boolean) as string[];
      await enqueueSceneTask({
        sceneIndex,
        prompt: visualPrompt,
        referenceImages,
      });
    },
    [enqueueSceneTask, plan?.scenes],
  );

  const handleBatchGeneratePreview = useCallback(
    async (scenes: GeneratedScene[]) => {
      const candidates = scenes
        .map((scene, index) => ({ scene, index }))
        .filter(
          ({ scene }) => !scene.previewArtifactPath && Boolean(scene.visualPrompt),
        );

      if (candidates.length === 0) return;

      const unconfirmed = candidates.filter(
        ({ index }) => !isChecklistConfirmed(checklistMap.get(index)),
      );
      if (unconfirmed.length > 0) {
        setSceneTaskHint(
          `批量执行前需逐场景确认清单（剩余 ${unconfirmed.length} 个未确认）。`,
        );
        setPendingBatchSceneIndices(unconfirmed.map((item) => item.index));
        return;
      }
      setPendingBatchSceneIndices([]);

      for (const item of candidates) {
        // 串行创建任务，保持执行顺序可追溯
        // eslint-disable-next-line no-await-in-loop
        await enqueueSceneTask({
          sceneIndex: item.index,
          prompt: item.scene.visualPrompt,
          referenceImages: [item.scene.sceneAssetImage].filter(
            Boolean,
          ) as string[],
        });
      }
    },
    [checklistMap, enqueueSceneTask],
  );

  const handleExportPPT = () => {
    alert('PPT 导出功能将在 Phase 4 实现');
  };

  const handleRefreshProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['project', id] });
    queryClient.invalidateQueries({ queryKey: ['project-tasks', id] });
  }, [id, queryClient]);

  const handleUpdateScene = useCallback(
    async (
      sceneIndex: number,
      patch: Partial<
        Pick<GeneratedScene, 'description' | 'shots' | 'lighting' | 'visualPrompt'>
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

  const handleConfirmChecklistForScene = useCallback((sceneIndex: number) => {
    const snapshot = checklistMap.get(sceneIndex);
    if (!snapshot) return;
    if (!snapshot.allPassed) {
      setSceneTaskHint(`场景 ${sceneIndex + 1} 清单尚未满足，请先补充缺失信息。`);
      setPendingBatchSceneIndices((prev) =>
        Array.from(new Set([...prev, sceneIndex])),
      );
      return;
    }
    confirmExecutionChecklist(snapshot);
    setChecklistVersion((prev) => prev + 1);
    setPendingBatchSceneIndices((prev) =>
      prev.filter((index) => index !== sceneIndex),
    );
    setSceneTaskHint(`场景 ${sceneIndex + 1} 清单已确认，可直接执行。`);
  }, [checklistMap]);

  const handleConfirmFix = useCallback(async () => {
    if (fixPanelSceneIndex === null || !plan?.scenes) return;
    const scene = plan.scenes[fixPanelSceneIndex];
    const acceptance = acceptanceMap.get(fixPanelSceneIndex);
    if (!scene || !acceptance) return;

    setIsFixing(true);
    try {
      const latestDetail = detailByScene.get(fixPanelSceneIndex) || null;
      const latestPrompt =
        safeString(latestDetail?.run?.effectivePrompt) || scene.visualPrompt;
      const referencesFromPromptContext = getReferenceImagesFromPromptContext(
        (latestDetail?.run?.promptContext as TaskPromptContext | null) || null,
      );
      const referenceImages = Array.from(
        new Set([
          ...(scene.sceneAssetImage ? [scene.sceneAssetImage] : []),
          ...referencesFromPromptContext,
        ]),
      );
      const fixTemplate = buildAcceptanceFixTemplate({
        acceptance,
        lockedAspectRatio: LOCKED_ASPECT_RATIO,
      });

      await enqueueSceneTask({
        sceneIndex: fixPanelSceneIndex,
        prompt: latestPrompt,
        referenceImages,
        editInstruction: fixTemplate.editInstruction,
        taskOptions: fixTemplate.options,
      });
      setFixPanelSceneIndex(null);
    } finally {
      setIsFixing(false);
    }
  }, [acceptanceMap, detailByScene, enqueueSceneTask, fixPanelSceneIndex, plan?.scenes]);

  const handleConfirmPendingBatch = useCallback(() => {
    if (!plan?.scenes || pendingBatchSceneIndices.length === 0) return;
    let confirmedCount = 0;
    const unresolved: number[] = [];
    for (const sceneIndex of pendingBatchSceneIndices) {
      const snapshot = checklistMap.get(sceneIndex);
      if (!snapshot || !snapshot.allPassed) {
        unresolved.push(sceneIndex);
        continue;
      }
      confirmExecutionChecklist(snapshot);
      confirmedCount += 1;
    }

    if (confirmedCount > 0) {
      setChecklistVersion((prev) => prev + 1);
    }

    setPendingBatchSceneIndices(unresolved);
    if (unresolved.length > 0) {
      setSceneTaskHint(`仍有 ${unresolved.length} 个场景未满足清单，需先补充信息。`);
      return;
    }

    setSceneTaskHint('批量执行清单已确认，可继续执行。');
  }, [checklistMap, pendingBatchSceneIndices, plan?.scenes]);

  const handleMarkScenePassed = useCallback(
    (sceneIndex: number) => {
      const acceptance = acceptanceMap.get(sceneIndex);
      const checklist = checklistMap.get(sceneIndex);
      if (!acceptance || !checklist) return;
      if (acceptance.failCount > 0 || acceptance.unknownCount > 0) {
        alert('存在未通过或待补充项，暂不可标记通过。');
        return;
      }

      writeManualPass(id, sceneIndex, checklist.planFingerprint, true);
      setManualPassVersion((prev) => prev + 1);
    },
    [acceptanceMap, checklistMap, id],
  );

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

  const fixPanelAcceptance =
    fixPanelSceneIndex !== null ? acceptanceMap.get(fixPanelSceneIndex) : null;
  const fixPanelTemplate = fixPanelAcceptance
    ? buildAcceptanceFixTemplate({
        acceptance: fixPanelAcceptance,
        lockedAspectRatio: LOCKED_ASPECT_RATIO,
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PlanResultHeader
        project={project}
        plan={plan}
        mode={resolvedMode}
        previewProgress={previewProgress}
        isBatchGenerating={batchTaskIds.length > 0}
        isRegenerating={isRegenerating}
        onGeneratePreviews={() => handleBatchGeneratePreview(plan.scenes)}
        onOpenVersions={() => setShowVersions(true)}
        onRegenerate={handleRegenerate}
        onExportPPT={handleExportPPT}
        onOpenTaskCenter={openDrawer}
      />

      <div className="mt-5">
        <ResultModeSwitch value={resolvedMode} onValueChange={handleSwitchMode} />
      </div>

      {sceneTaskHint ? (
        <Alert variant="info" className="mt-4">
          <AlertTitle>执行提示</AlertTitle>
          <AlertDescription>{sceneTaskHint}</AlertDescription>
        </Alert>
      ) : null}

      {resolvedMode === 'plan' ? (
        <Alert variant="info" className="mt-4">
          <AlertTitle>导演助理 AI</AlertTitle>
          <AlertDescription>聚焦分镜编辑与表达优化，不直接触发执行任务。</AlertDescription>
        </Alert>
      ) : null}

      {resolvedMode === 'execute' ? (
        <Alert variant="info" className="mt-4">
          <AlertTitle>执行监理 AI</AlertTitle>
          <AlertDescription>按清单约束执行，异常会给出可确认的一键修复建议。</AlertDescription>
        </Alert>
      ) : null}

      {resolvedMode === 'execute' && pendingBatchSceneIndices.length > 0 ? (
        <Alert variant="warning" className="mt-4">
          <AlertTitle>批量执行门禁</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>以下场景尚未通过执行清单确认：</p>
              <div className="flex flex-wrap gap-2">
                {pendingBatchSceneIndices.map((sceneIndex) => (
                  <Button
                    key={`pending-scene-${sceneIndex}`}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const el = document.getElementById(`scene-${sceneIndex}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    场景 {sceneIndex + 1}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleConfirmPendingBatch}>
                  批量确认可通过项
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingBatchSceneIndices([])}
                >
                  稍后处理
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {fixPanelSceneIndex !== null && fixPanelAcceptance ? (
        <Alert variant="warning" className="mt-4">
          <AlertTitle>场景 {fixPanelSceneIndex + 1} 修复建议</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>
                发现 {fixPanelAcceptance.failCount + fixPanelAcceptance.unknownCount}{' '}
                项未通过，已预填修复策略：
              </p>
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                {fixPanelTemplate?.editInstruction || '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                画幅锁定：{fixPanelTemplate?.options.aspectRatio || LOCKED_ASPECT_RATIO}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleConfirmFix} disabled={isFixing}>
                  {isFixing ? '创建中...' : '确认并创建修复任务'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFixPanelSceneIndex(null)}
                  disabled={isFixing}
                >
                  暂不修复
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {resolvedMode === 'review' ? (
        <div className="mt-6">
          <ReviewBoard
            scenes={plan.scenes}
            acceptanceMap={acceptanceMap}
            sceneTrackMap={sceneTrackMap}
            manualPassedMap={manualPassedMap}
            onFixScene={setFixPanelSceneIndex}
            onOpenEditScene={handleOpenEditFromReview}
            onViewSceneTask={handleViewRecentTasks}
            onMarkScenePassed={handleMarkScenePassed}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {plan.scenes.map((scene, index) => (
            <div key={`${scene.location}-${index}`} id={`scene-${index}`}>
              <SceneCard
                mode={resolvedMode}
                scene={scene}
                sceneIndex={index}
                projectId={project.id}
                autoOpenEdit={search.openEdit === '1' && sceneFromUrl === index}
                isGenerating={generatingScenes.has(index)}
                onGeneratePreview={handleGenerateScenePreview}
                onImageChange={handleRefreshProject}
                onViewRecentTasks={handleViewRecentTasks}
                onRequestChecklistConfirm={handleConfirmChecklistForScene}
                onRequestFix={setFixPanelSceneIndex}
                onUpdateScene={handleUpdateScene}
                checklistSnapshot={checklistMap.get(index) || null}
                executionState={executionStateMap.get(index)}
                acceptance={acceptanceMap.get(index) || null}
                taskTrack={sceneTrackMap.get(index) || toIdleTrack(index)}
              />
            </div>
          ))}
        </div>
      )}

      <PlanVersionsDrawer
        open={showVersions}
        onOpenChange={setShowVersions}
        projectId={project.id}
      />
    </div>
  );
}
