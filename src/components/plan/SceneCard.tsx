/**
 * SceneCard - 分镜卡片组件
 * 单卡闭环：编辑分镜 -> 编辑最终提示词 -> 生成
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SceneCardImage } from './SceneCardImage';
import type { GeneratedScene, SceneTaskTrack } from './types';

export interface SceneCardProps {
  scene: GeneratedScene;
  sceneIndex: number;
  /** 当前分镜是否在生成中 */
  isGenerating?: boolean;
  /** 新生成（仅基于最终提示词） */
  onGeneratePreview?: (sceneIndex: number, visualPrompt: string) => void;
  /** 基于当前选中图生成 */
  onGenerateFromSelected?: (sceneIndex: number, visualPrompt: string) => void;
  /** 主动优化提示词 */
  onOptimizePrompt?: (
    sceneIndex: number,
    visualPrompt: string,
  ) => Promise<void> | void;
  /** 查看该分镜最近任务 */
  onViewRecentTasks?: (sceneIndex: number) => void;
  /** 更新分镜 */
  onUpdateScene?: (
    sceneIndex: number,
    patch: Partial<
      Pick<
        GeneratedScene,
        'location' | 'description' | 'shots' | 'lighting' | 'visualPrompt'
      >
    >,
  ) => Promise<void> | void;
  /** 最近任务轨道 */
  taskTrack?: SceneTaskTrack | null;
  /** 是否可基于选中图生成 */
  canGenerateFromSelected?: boolean;
}

function getTaskStatusLabel(track?: SceneTaskTrack | null): string {
  if (!track || track.status === 'idle') return '暂无任务';
  if (track.status === 'pending') return '排队中';
  if (track.status === 'running') return '生成中';
  if (track.status === 'completed') return '已完成';
  if (track.status === 'failed') return '失败';
  return track.status;
}

export function SceneCard({
  scene,
  sceneIndex,
  isGenerating = false,
  onGeneratePreview,
  onGenerateFromSelected,
  onOptimizePrompt,
  onViewRecentTasks,
  onUpdateScene,
  taskTrack,
  canGenerateFromSelected = false,
}: SceneCardProps) {
  const [draft, setDraft] = useState({
    location: scene.location || '',
    description: scene.description || '',
    shots: scene.shots || '',
    lighting: scene.lighting || '',
    visualPrompt: scene.visualPrompt || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    setDraft({
      location: scene.location || '',
      description: scene.description || '',
      shots: scene.shots || '',
      lighting: scene.lighting || '',
      visualPrompt: scene.visualPrompt || '',
    });
  }, [
    scene.location,
    scene.description,
    scene.shots,
    scene.lighting,
    scene.visualPrompt,
  ]);

  const hasDraftChanges =
    draft.location !== (scene.location || '') ||
    draft.description !== (scene.description || '') ||
    draft.shots !== (scene.shots || '') ||
    draft.lighting !== (scene.lighting || '') ||
    draft.visualPrompt !== (scene.visualPrompt || '');

  const taskStatusLabel = useMemo(
    () => getTaskStatusLabel(taskTrack),
    [taskTrack],
  );

  const generateDisabledReason = isGenerating
    ? '当前分镜正在生成，请稍后再试。'
    : !draft.visualPrompt.trim()
      ? '请先填写最终提示词。'
      : null;

  const generateFromSelectedDisabledReason = isGenerating
    ? '当前分镜正在生成，请稍后再试。'
    : !draft.visualPrompt.trim()
      ? '请先填写最终提示词。'
      : !canGenerateFromSelected
        ? '请先在历史生成中选中一张图片。'
        : null;

  const handleSave = useCallback(async () => {
    if (!onUpdateScene || !hasDraftChanges) return;
    setIsSaving(true);
    try {
      await onUpdateScene(sceneIndex, {
        location: draft.location,
        description: draft.description,
        shots: draft.shots,
        lighting: draft.lighting,
        visualPrompt: draft.visualPrompt,
      });
    } finally {
      setIsSaving(false);
    }
  }, [draft, hasDraftChanges, onUpdateScene, sceneIndex]);

  const handleOptimize = useCallback(async () => {
    if (!onOptimizePrompt) return;
    setIsOptimizing(true);
    try {
      await onOptimizePrompt(sceneIndex, draft.visualPrompt);
    } finally {
      setIsOptimizing(false);
    }
  }, [onOptimizePrompt, sceneIndex, draft.visualPrompt]);

  const handleGenerate = useCallback(() => {
    if (generateDisabledReason) return;
    onGeneratePreview?.(sceneIndex, draft.visualPrompt);
  }, [
    generateDisabledReason,
    onGeneratePreview,
    sceneIndex,
    draft.visualPrompt,
  ]);

  const handleGenerateFromSelected = useCallback(() => {
    if (generateFromSelectedDisabledReason) return;
    onGenerateFromSelected?.(sceneIndex, draft.visualPrompt);
  }, [
    generateFromSelectedDisabledReason,
    onGenerateFromSelected,
    sceneIndex,
    draft.visualPrompt,
  ]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-start">
        <SceneCardImage
          currentImage={scene.previewArtifactPath}
          sceneAssetImage={scene.sceneAssetImage}
          sceneName={scene.location || `分镜 ${sceneIndex + 1}`}
          isGenerating={isGenerating}
        />

        <div className="flex-1 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              分镜 {sceneIndex + 1}
              {scene.location ? ` · ${scene.location}` : ''}
            </h3>
            <Badge variant="outline">{taskStatusLabel}</Badge>
          </div>

          <div className="grid gap-3">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">分镜位置</div>
              <Input
                value={draft.location}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    location: event.target.value,
                  }))
                }
                placeholder="例如：场景中央，地垫前"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">分镜描述</div>
              <Textarea
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="描述动作、表情和互动"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">拍摄建议</div>
              <Textarea
                rows={2}
                value={draft.shots}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, shots: event.target.value }))
                }
                placeholder="镜头焦段、角度、景别"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">灯光布置</div>
              <Textarea
                rows={2}
                value={draft.lighting}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    lighting: event.target.value,
                  }))
                }
                placeholder="主光、辅光、轮廓光"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">
                最终提示词
              </div>
              <Textarea
                rows={5}
                value={draft.visualPrompt}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    visualPrompt: event.target.value,
                  }))
                }
                placeholder="用于最终生成的提示词"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasDraftChanges || isSaving}
            >
              {isSaving ? '保存中...' : '保存分镜'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleOptimize}
              disabled={
                !onOptimizePrompt || !draft.visualPrompt.trim() || isOptimizing
              }
            >
              {isOptimizing ? '优化中...' : '优化提示词'}
            </Button>

            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={Boolean(generateDisabledReason)}
            >
              新生成
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateFromSelected}
              disabled={Boolean(generateFromSelectedDisabledReason)}
            >
              基于当前选中图生成
            </Button>

            {taskTrack?.taskId ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onViewRecentTasks?.(sceneIndex)}
              >
                查看任务
              </Button>
            ) : null}
          </div>

          {generateDisabledReason ? (
            <div className="text-xs text-muted-foreground">
              新生成：{generateDisabledReason}
            </div>
          ) : null}
          {generateFromSelectedDisabledReason ? (
            <div className="text-xs text-muted-foreground">
              基于当前选中图生成：{generateFromSelectedDisabledReason}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
