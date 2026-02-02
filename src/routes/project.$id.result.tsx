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
} from '@/components/plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTasksPolling } from '@/hooks/useTasks';
import { generatePlan, getProject } from '@/lib/projects-api';
import { createImageTask } from '@/lib/tasks-api';

interface ResultSearchParams {
  scene?: number;
  openEdit?: '1';
}

export const Route = createFileRoute('/project/$id/result')({
  component: ProjectResultPage,
  validateSearch: (search: Record<string, unknown>): ResultSearchParams => {
    const scene =
      typeof search.scene === 'string' ? Number.parseInt(search.scene, 10) : undefined;
    return {
      scene: typeof scene === 'number' && Number.isFinite(scene) ? scene : undefined,
      openEdit: search.openEdit === '1' ? '1' : undefined,
    };
  },
});

function ProjectResultPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { scene: sceneFromUrl, openEdit } = Route.useSearch();
  const queryClient = useQueryClient();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState<Set<number>>(
    new Set(),
  );
  const [batchTaskIds, setBatchTaskIds] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  // 获取项目数据
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
  });

  // 重新生成 mutation
  const regenerateMutation = useMutation({
    mutationFn: () => generatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  // 批量任务轮询
  useTasksPolling(batchTaskIds, {
    enabled: batchTaskIds.length > 0,
    onAllComplete: () => {
      setBatchTaskIds([]);
      setGeneratingScenes(new Set());
      queryClient.invalidateQueries({ queryKey: ['project', id] });
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

  // 生成单个场景预览图
  const handleGenerateScenePreview = useCallback(
    async (sceneIndex: number, visualPrompt: string) => {
      setGeneratingScenes((prev) => new Set(prev).add(sceneIndex));
      try {
        const task = await createImageTask(visualPrompt, {
          relatedId: id,
          relatedMeta: JSON.stringify({ sceneIndex }),
          owner: {
            type: 'planScene',
            id: id,
            slot: `scene:${sceneIndex}`,
          },
        });
        setBatchTaskIds((prev) => [...prev, task.id]);
      } catch (err) {
        console.error('Failed to create image task:', err);
        setGeneratingScenes((prev) => {
          const next = new Set(prev);
          next.delete(sceneIndex);
          return next;
        });
      }
    },
    [id],
  );

  // 批量生成所有场景预览图
  const handleBatchGeneratePreview = useCallback(
    async (scenes: GeneratedScene[]) => {
      const indices = scenes
        .map((scene, index) => ({ scene, index }))
        .filter(
          ({ scene }) =>
            !scene.sceneAssetImage &&
            !scene.previewArtifactPath &&
            scene.visualPrompt,
        );

      if (indices.length === 0) return;

      const newGenerating = new Set<number>();
      const taskIds: string[] = [];

      for (const { scene, index } of indices) {
        newGenerating.add(index);
        try {
          const task = await createImageTask(scene.visualPrompt, {
            relatedId: id,
            relatedMeta: JSON.stringify({ sceneIndex: index }),
            owner: {
              type: 'planScene',
              id: id,
              slot: `scene:${index}`,
            },
          });
          taskIds.push(task.id);
        } catch (err) {
          console.error(`Failed to create task for scene ${index}:`, err);
        }
      }

      setGeneratingScenes(newGenerating);
      setBatchTaskIds(taskIds);
    },
    [id],
  );

  const handleExportPPT = () => {
    // TODO: Phase 4 实现 PPT 导出
    alert('PPT 导出功能将在 Phase 4 实现');
  };

  // 刷新项目数据
  const handleRefreshProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['project', id] });
  }, [queryClient, id]);

  // 计算预览进度
  const previewProgress = useMemo(() => {
    const plan = project?.generatedPlan as GeneratedPlan | null;
    if (!plan?.scenes) return { done: 0, total: 0 };

    const total = plan.scenes.length;
    const done = plan.scenes.filter(
      (scene) => scene.sceneAssetImage || scene.previewArtifactPath,
    ).length;

    return { done, total };
  }, [project?.generatedPlan]);

  // Loading 状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Error 状态
  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Alert variant="error">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '项目不存在'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const plan = project.generatedPlan as GeneratedPlan | null;

  // 处理从任务列表跳转：滚动到指定场景并自动打开编辑抽屉
  useEffect(() => {
    if (!plan?.scenes?.length) return;
    if (typeof sceneFromUrl !== 'number' || Number.isNaN(sceneFromUrl)) return;
    if (sceneFromUrl < 0 || sceneFromUrl >= plan.scenes.length) return;

    const el = document.getElementById(`scene-${sceneFromUrl}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 清理 URL（保持页面状态不受影响）
    navigate({
      to: '/project/$id/result',
      params: { id },
      search: {},
      replace: true,
    });
  }, [sceneFromUrl, plan?.scenes?.length, navigate, id]);

  // 未生成预案
  if (!plan) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              search={{ project: id }}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              返回项目
            </Link>
            <h1 className="text-2xl font-semibold text-foreground">生成结果</h1>
          </div>
        </div>

        {/* 空状态 */}
        <div className="rounded-2xl border border-dashed border-border bg-card p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">
              尚未生成预案
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              请先完成项目配置，然后点击「生成预案」按钮
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header: 版本信息 + 操作 */}
      <PlanResultHeader
        project={project}
        plan={plan}
        previewProgress={previewProgress}
        isBatchGenerating={batchTaskIds.length > 0}
        isRegenerating={isRegenerating}
        onGeneratePreviews={() => handleBatchGeneratePreview(plan.scenes)}
        onOpenVersions={() => setShowVersions(true)}
        onRegenerate={handleRegenerate}
        onExportPPT={handleExportPPT}
      />

      {/* 场景列表标题 */}
      <div className="mt-8 mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          分镜场景 ({plan.scenes.length})
        </h2>
      </div>

      {/* 场景列表 */}
      <div className="space-y-6">
        {plan.scenes.map((scene, index) => (
          <div key={`${scene.location}-${index}`} id={`scene-${index}`}>
            <SceneCard
              scene={scene}
              sceneIndex={index}
              projectId={project.id}
              autoOpenEdit={openEdit === '1' && sceneFromUrl === index}
              isGenerating={generatingScenes.has(index)}
              onGeneratePreview={handleGenerateScenePreview}
              onImageChange={handleRefreshProject}
            />
          </div>
        ))}
      </div>

      {/* 版本抽屉 */}
      <PlanVersionsDrawer
        open={showVersions}
        onOpenChange={setShowVersions}
        projectId={project.id}
      />
    </div>
  );
}
