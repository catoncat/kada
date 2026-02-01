'use client';

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ImageIcon, Loader2 } from 'lucide-react';
import { getProject, updateProject } from '@/lib/projects-api';
import { getSceneAssets, getImageUrl } from '@/lib/scene-assets-api';
import { SceneCard } from '@/components/assets/SceneCard';
import type { SceneAsset } from '@/types/scene-asset';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/project/$id/scenes')({
  component: ProjectScenesPage,
});

function ProjectScenesPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 获取项目数据
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
  });

  // 获取场景资产列表
  const { data: scenesData, isLoading: scenesLoading } = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
  });

  // 更新项目
  const updateMutation = useMutation({
    mutationFn: (sceneId: string | null) => updateProject(id, {
      selectedScene: sceneId,
      status: sceneId ? 'configured' : 'draft',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const handleSelect = (scene: SceneAsset) => {
    // 如果已选中则取消选择，否则选择
    const newValue = project?.selectedScene === scene.id ? null : scene.id;
    updateMutation.mutate(newValue);
  };

  const handleConfirm = () => {
    navigate({ to: '/project/$id', params: { id } });
  };

  const isLoading = projectLoading || scenesLoading;
  const scenes = scenesData?.data || [];
  const selectedScene = scenes.find((s) => s.id === project?.selectedScene);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/project/$id"
            params={{ id }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            返回项目
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">场景配置</h1>
        </div>
        <Button onClick={handleConfirm}>
          <Check className="w-4 h-4" />
          确定
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        选择一个场景用于此项目的拍摄（单选）
      </p>

      {/* 场景选择网格 - 空状态 */}
      {scenes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">没有可用的场景</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              请先在「资产管理」中创建场景资产
            </p>
            <Button
              className="mt-6"
              render={<Link to="/assets/scenes" />}
              variant="outline"
            >
              前往资产管理
            </Button>
          </div>
        </div>
      )}

      {/* 场景选择网格 */}
      {scenes.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              selectable
              selected={project?.selectedScene === scene.id}
              onSelect={() => handleSelect(scene)}
            />
          ))}
        </div>
      )}

      {/* 已选场景预览区域 */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">已选场景预览</h3>
        {selectedScene ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex flex-col md:flex-row">
              {/* 大图预览 */}
              <div className="md:w-1/2 aspect-[4/3] bg-muted">
                {selectedScene.primaryImage ? (
                  <img
                    src={getImageUrl(selectedScene.primaryImage)}
                    alt={selectedScene.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-muted-foreground opacity-50" />
                  </div>
                )}
              </div>

              {/* 详情信息 */}
              <div className="md:w-1/2 p-6">
                <h4 className="text-xl font-semibold text-foreground">{selectedScene.name}</h4>

                {selectedScene.description && (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {selectedScene.description}
                  </p>
                )}

                {/* 标签 */}
                {selectedScene.tags && selectedScene.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedScene.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 属性 */}
                <div className="mt-6 grid gap-3">
                  {selectedScene.defaultLighting && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">默认灯光：</span>
                      <span className="text-foreground">{selectedScene.defaultLighting}</span>
                    </div>
                  )}
                  {selectedScene.style && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">风格：</span>
                      <span className="text-foreground">
                        {[
                          selectedScene.style.colorTone === 'warm' ? '暖色调' :
                            selectedScene.style.colorTone === 'cool' ? '冷色调' : '中性',
                          selectedScene.style.lightingMood === 'soft' ? '柔光' :
                            selectedScene.style.lightingMood === 'dramatic' ? '戏剧性' : '自然光',
                          selectedScene.style.era === 'modern' ? '现代' :
                            selectedScene.style.era === 'vintage' ? '复古' : '经典',
                        ].join(' / ')}
                      </span>
                    </div>
                  )}
                  {selectedScene.isOutdoor && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">类型：</span>
                      <span className="text-success-foreground">户外场景</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/60 p-8 text-center text-muted-foreground text-sm">
            点击上方场景卡片进行选择
          </div>
        )}
      </div>
    </div>
  );
}
