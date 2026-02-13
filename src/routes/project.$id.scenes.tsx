'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Check, ImageIcon, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { SceneListItem } from '@/components/assets/SceneListItem';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProject, updateProject } from '@/lib/projects-api';
import { getImageUrl, getSceneAssets } from '@/lib/scene-assets-api';
import type { SceneAsset } from '@/types/scene-asset';

export const Route = createFileRoute('/project/$id/scenes')({
  component: ProjectScenesPage,
});

function ProjectScenesPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [optimisticSelectedId, setOptimisticSelectedId] = useState<
    string | null | undefined
  >(undefined);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
  });

  const {
    data: scenesData,
    isLoading: scenesLoading,
    error: scenesError,
    refetch: refetchScenes,
  } = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
  });

  const updateMutation = useMutation({
    mutationFn: (sceneId: string | null) =>
      updateProject(id, {
        selectedScene: sceneId,
        status: sceneId ? 'configured' : 'draft',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', id] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setOptimisticSelectedId(undefined);
    },
    onError: (err) => {
      setOptimisticSelectedId(undefined);
      setSelectionError(err instanceof Error ? err.message : '更新场景失败');
    },
  });

  const scenes = scenesData?.data || [];

  const filteredScenes = useMemo(() => {
    if (!search.trim()) return scenes;
    const q = search.toLowerCase();
    return scenes.filter((scene) => {
      return (
        scene.name.toLowerCase().includes(q) ||
        scene.description?.toLowerCase().includes(q) ||
        scene.defaultLighting?.toLowerCase().includes(q) ||
        scene.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [scenes, search]);

  const selectedSceneId =
    optimisticSelectedId !== undefined
      ? optimisticSelectedId
      : (project?.selectedScene ?? null);

  const selectedScene =
    scenes.find((scene) => scene.id === selectedSceneId) || null;

  useEffect(() => {
    if (!selectionError) return;
    const timer = window.setTimeout(() => setSelectionError(null), 2500);
    return () => window.clearTimeout(timer);
  }, [selectionError]);

  const handleSelect = (scene: SceneAsset) => {
    if (updateMutation.isPending) return;
    const nextSelected = selectedSceneId === scene.id ? null : scene.id;
    setOptimisticSelectedId(nextSelected);
    setSelectionError(null);
    updateMutation.mutate(nextSelected);
  };

  const handleConfirm = () => {
    navigate({ to: '/', search: { project: id } });
  };

  const isLoading = projectLoading || scenesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Alert variant="error">
          <AlertTitle>项目加载失败</AlertTitle>
          <AlertDescription>
            {projectError instanceof Error ? projectError.message : '项目不存在'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[320px] min-h-0 shrink-0 flex-col border-r bg-background">
        <div className="border-b px-3 py-3">
          <Link
            to="/"
            search={{ project: id }}
            className="mb-2 inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回项目
          </Link>

          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-semibold text-foreground">场景配置</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">单选，用于当前项目</p>
            </div>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={updateMutation.isPending}
            >
              <Check className="h-4 w-4" />
              确定
            </Button>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索场景..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted/50 pl-8"
              size="sm"
            />
          </div>
        </div>

        <div className="mx-3 border-t" />

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
        >
          {scenesError && (
            <div className="px-3 py-3">
              <Alert variant="error">
                <AlertTitle>场景加载失败</AlertTitle>
                <AlertDescription className="mt-2">
                  <p>
                    {scenesError instanceof Error
                      ? scenesError.message
                      : '无法获取场景列表'}
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    onClick={() => refetchScenes()}
                  >
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {!scenesError && scenes.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              <p>没有可用场景</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                render={<Link to="/assets/scenes" />}
              >
                前往资产管理
              </Button>
            </div>
          )}

          {!scenesError && scenes.length > 0 && filteredScenes.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              没有匹配的场景
            </div>
          )}

          {!scenesError && filteredScenes.length > 0 && (
            <div className="px-2 py-1">
              {filteredScenes.map((scene) => (
                <SceneListItem
                  key={scene.id}
                  scene={scene}
                  selected={scene.id === selectedSceneId}
                  onSelect={() => handleSelect(scene)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 bg-[#F5F5F7] dark:bg-[#1C1C1E]">
        {selectionError && (
          <div className="mx-auto max-w-3xl px-6 pt-4">
            <Alert variant="error">
              <AlertTitle>保存失败</AlertTitle>
              <AlertDescription>{selectionError}</AlertDescription>
            </Alert>
          </div>
        )}

        {selectedScene ? (
          <div className="mx-auto max-w-3xl px-6 py-6">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
              <PhotoFrame
                src={selectedScene.primaryImage ? getImageUrl(selectedScene.primaryImage) : null}
                alt={selectedScene.name}
                className="max-h-[380px]"
                fallback={
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-10 w-10 text-muted-foreground opacity-60" />
                  </div>
                }
              />

              <div className="space-y-4 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selectedScene.name}</h2>
                  {selectedScene.description && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {selectedScene.description}
                    </p>
                  )}
                </div>

                <div className="grid gap-2 text-sm">
                  {selectedScene.defaultLighting && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">默认灯光：</span>
                      <span className="text-foreground">{selectedScene.defaultLighting}</span>
                    </div>
                  )}

                  {selectedScene.style && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground">风格：</span>
                      <span className="text-foreground">
                        {[
                          selectedScene.style.colorTone === 'warm'
                            ? '暖色调'
                            : selectedScene.style.colorTone === 'cool'
                              ? '冷色调'
                              : '中性',
                          selectedScene.style.lightingMood === 'soft'
                            ? '柔光'
                            : selectedScene.style.lightingMood === 'dramatic'
                              ? '戏剧性'
                              : '自然光',
                          selectedScene.style.era === 'modern'
                            ? '现代'
                            : selectedScene.style.era === 'vintage'
                              ? '复古'
                              : '经典',
                        ].join(' / ')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">类型：</span>
                    <span className="text-foreground">
                      {selectedScene.isOutdoor ? '户外场景' : '室内场景'}
                    </span>
                  </div>
                </div>

                {selectedScene.tags && selectedScene.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedScene.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link to="/assets/scenes" search={{}} />}
                  >
                    去资产页管理场景
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
            <ImageIcon className="mb-4 h-16 w-16 opacity-30" />
            <p className="text-sm">请选择一个场景</p>
            <p className="mt-1 text-xs opacity-70">未选择时项目将保持草稿状态</p>
          </div>
        )}
      </main>
    </div>
  );
}
