/**
 * SceneCard - 场景卡片组件
 * 默认聚焦主流程：精修 -> 执行本场景 -> 查看任务
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SceneCardContent } from './SceneCardContent';
import { SceneCardImage } from './SceneCardImage';
import { SceneEditDrawer } from './SceneEditDrawer';
import type { GeneratedScene, SceneOwner, SceneTaskTrack } from './types';

export interface SceneCardProps {
  scene: GeneratedScene;
  sceneIndex: number;
  projectId: string;
  /** 初始自动打开编辑抽屉（用于历史深链兼容） */
  autoOpenEdit?: boolean;
  /** 当前场景是否在本地创建任务中 */
  isGenerating?: boolean;
  /** 生成预览图回调 */
  onGeneratePreview?: (sceneIndex: number, visualPrompt: string) => void;
  /** 图片变化回调（用于刷新数据） */
  onImageChange?: () => void;
  /** 查看该场景最近任务 */
  onViewRecentTasks?: (sceneIndex: number) => void;
  /** 更新场景分镜信息（规划模式） */
  onUpdateScene?: (
    sceneIndex: number,
    patch: Partial<Pick<GeneratedScene, 'visualPrompt'>>,
  ) => Promise<void> | void;
  /** 最近任务轨道 */
  taskTrack?: SceneTaskTrack | null;
}

function getTaskStatusLabel(track?: SceneTaskTrack | null): string {
  if (!track || track.status === 'idle') return '暂无任务';
  if (track.status === 'pending') return '排队中';
  if (track.status === 'running') return '执行中';
  if (track.status === 'completed') return '已完成';
  if (track.status === 'failed') return '失败';
  return track.status;
}

export function SceneCard({
  scene,
  sceneIndex,
  projectId,
  autoOpenEdit = false,
  isGenerating = false,
  onGeneratePreview,
  onImageChange,
  onViewRecentTasks,
  onUpdateScene,
  taskTrack,
}: SceneCardProps) {
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  useEffect(() => {
    if (autoOpenEdit) setEditDrawerOpen(true);
  }, [autoOpenEdit]);

  const owner: SceneOwner = {
    type: 'planScene',
    id: projectId,
    slot: `scene:${sceneIndex}`,
  };

  const handleGenerate = useCallback(() => {
    if (scene.visualPrompt) {
      onGeneratePreview?.(sceneIndex, scene.visualPrompt);
    }
  }, [sceneIndex, scene.visualPrompt, onGeneratePreview]);

  const handleOpenEdit = useCallback(() => {
    setEditDrawerOpen(true);
  }, []);

  const handleImageChange = useCallback(() => {
    onImageChange?.();
  }, [onImageChange]);

  const handleViewRecentTasks = useCallback(() => {
    onViewRecentTasks?.(sceneIndex);
  }, [onViewRecentTasks, sceneIndex]);

  const executeDisabledReason = isGenerating
    ? '当前场景正在生成，请等待完成后再执行。'
    : !scene.visualPrompt?.trim()
      ? '请先在精修中补全提示词。'
      : null;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start">
          <SceneCardImage
            currentImage={scene.previewArtifactPath}
            sceneAssetImage={scene.sceneAssetImage}
            defaultPrompt={scene.visualPrompt}
            sceneName={scene.location}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onOpenEdit={handleOpenEdit}
          />

          <div className="flex-1 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">
                场景 {sceneIndex + 1} · {scene.location}
              </h3>
              <Badge variant="outline">{getTaskStatusLabel(taskTrack)}</Badge>
            </div>

            <SceneCardContent
              scene={scene}
              sceneIndex={sceneIndex}
              showHeader={false}
            />

            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={Boolean(executeDisabledReason)}
                >
                  执行本场景
                </Button>
                <Button size="sm" variant="outline" onClick={handleOpenEdit}>
                  精修
                </Button>
                {taskTrack?.taskId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleViewRecentTasks}
                  >
                    查看任务
                  </Button>
                ) : null}
              </div>
              {executeDisabledReason ? (
                <div className="text-xs text-muted-foreground">
                  {executeDisabledReason}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <SceneEditDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        scene={scene}
        sceneIndex={sceneIndex}
        owner={owner}
        lockedAspectRatio="photo"
        referenceCount={scene.sceneAssetImage ? 1 : 0}
        recentTaskStatus={getTaskStatusLabel(taskTrack)}
        onPromptUpdate={(visualPrompt) => {
          if (!onUpdateScene) return;
          return onUpdateScene(sceneIndex, { visualPrompt });
        }}
        onImageChange={handleImageChange}
      />
    </>
  );
}
