/**
 * SceneCard - 场景卡片组件
 * 支持规划/执行模式，并在执行模式下显示主动作状态机与任务轨道
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { resolveExecuteActionGuard } from '@/lib/scene-execution-state';
import { SceneCardContent } from './SceneCardContent';
import { SceneCardImage } from './SceneCardImage';
import { SceneEditDrawer } from './SceneEditDrawer';
import { ExecutionChecklistCard } from './ExecutionChecklistCard';
import { SceneTaskRail } from './SceneTaskRail';
import type {
  AcceptanceResult,
  ExecutionChecklistSnapshot,
  GeneratedScene,
  ResultMode,
  SceneExecutionState,
  SceneOwner,
  SceneTaskTrack,
} from './types';

export interface SceneCardProps {
  scene: GeneratedScene;
  sceneIndex: number;
  projectId: string;
  mode?: ResultMode;
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
  /** 请求确认清单 */
  onRequestChecklistConfirm?: (sceneIndex: number) => void;
  /** 请求一键修复 */
  onRequestFix?: (sceneIndex: number) => void;
  /** 更新场景分镜信息（规划模式） */
  onUpdateScene?: (
    sceneIndex: number,
    patch: Partial<
      Pick<GeneratedScene, 'description' | 'shots' | 'lighting' | 'visualPrompt'>
    >,
  ) => Promise<void> | void;
  /** 执行清单快照 */
  checklistSnapshot?: ExecutionChecklistSnapshot | null;
  /** 场景执行状态 */
  executionState?: SceneExecutionState;
  /** 验收结果 */
  acceptance?: AcceptanceResult | null;
  /** 最近任务轨道 */
  taskTrack?: SceneTaskTrack | null;
}

function getStateLabel(state: SceneExecutionState): string {
  switch (state) {
    case 'not_confirmed':
      return '未确认';
    case 'not_generated':
      return '未生成';
    case 'running':
      return '执行中';
    case 'failed':
      return '失败';
    case 'needs_info':
      return '待补充信息';
    case 'generated_pending_review':
      return '待验收';
    case 'passed':
      return '已通过';
    default:
      return '待处理';
  }
}

function getStateBadgeVariant(state: SceneExecutionState) {
  if (state === 'passed') return 'success' as const;
  if (state === 'failed') return 'destructive' as const;
  if (state === 'running') return 'info' as const;
  if (state === 'needs_info') return 'warning' as const;
  return 'outline' as const;
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
  mode = 'plan',
  autoOpenEdit = false,
  isGenerating = false,
  onGeneratePreview,
  onImageChange,
  onViewRecentTasks,
  onRequestChecklistConfirm,
  onRequestFix,
  onUpdateScene,
  checklistSnapshot,
  executionState = 'not_confirmed',
  acceptance,
  taskTrack,
}: SceneCardProps) {
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [draft, setDraft] = useState({
    description: scene.description || '',
    shots: scene.shots || '',
    lighting: scene.lighting || '',
    visualPrompt: scene.visualPrompt || '',
  });
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    if (autoOpenEdit) setEditDrawerOpen(true);
  }, [autoOpenEdit]);

  useEffect(() => {
    setDraft({
      description: scene.description || '',
      shots: scene.shots || '',
      lighting: scene.lighting || '',
      visualPrompt: scene.visualPrompt || '',
    });
  }, [scene.description, scene.lighting, scene.shots, scene.visualPrompt]);

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

  const hasDraftChanges =
    draft.description !== (scene.description || '') ||
    draft.shots !== (scene.shots || '') ||
    draft.lighting !== (scene.lighting || '') ||
    draft.visualPrompt !== (scene.visualPrompt || '');

  const handleSaveDraft = useCallback(async () => {
    if (!onUpdateScene || !hasDraftChanges) return;
    setIsSavingDraft(true);
    try {
      await onUpdateScene(sceneIndex, {
        description: draft.description,
        shots: draft.shots,
        lighting: draft.lighting,
        visualPrompt: draft.visualPrompt,
      });
    } finally {
      setIsSavingDraft(false);
    }
  }, [draft, hasDraftChanges, onUpdateScene, sceneIndex]);

  const executeActionGuard = useMemo(
    () =>
      resolveExecuteActionGuard({
        executionState,
        isGenerating,
        hasVisualPrompt: Boolean(scene.visualPrompt?.trim()),
      }),
    [executionState, isGenerating, scene.visualPrompt],
  );
  const shouldShowFixAction =
    (acceptance?.failCount || 0) > 0 ||
    (acceptance?.unknownCount || 0) > 0 ||
    executionState === 'failed';

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
              {mode === 'execute' ? (
                <Badge variant={getStateBadgeVariant(executionState)}>
                  {getStateLabel(executionState)}
                </Badge>
              ) : null}
            </div>

            <SceneCardContent
              scene={scene}
              sceneIndex={sceneIndex}
              showHeader={false}
            />

            {mode === 'execute' ? (
              <div className="mt-4 space-y-3">
                {checklistSnapshot ? (
                  <ExecutionChecklistCard snapshot={checklistSnapshot} />
                ) : null}

                {taskTrack ? (
                  <SceneTaskRail
                    track={taskTrack}
                    onViewTask={taskTrack.taskId ? handleViewRecentTasks : undefined}
                  />
                ) : null}

                {acceptance ? (
                  <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    验收：通过 {acceptance.passCount} / 失败 {acceptance.failCount} /
                    待补充 {acceptance.unknownCount}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={executeActionGuard.disabled}
                  >
                    执行本场景
                  </Button>
                  {executionState === 'not_confirmed' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRequestChecklistConfirm?.(sceneIndex)}
                    >
                      确认清单
                    </Button>
                  ) : null}
                  {shouldShowFixAction ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRequestFix?.(sceneIndex)}
                    >
                      一键修复
                    </Button>
                  ) : null}
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
                {executeActionGuard.reason ? (
                  <div className="text-xs text-muted-foreground">
                    {executeActionGuard.reason}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">内容描述</div>
                    <Textarea
                      rows={2}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
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
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">visualPrompt</div>
                    <Textarea
                      rows={3}
                      value={draft.visualPrompt}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          visualPrompt: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveDraft}
                    disabled={!hasDraftChanges || isSavingDraft}
                  >
                    {isSavingDraft ? '保存中...' : '保存分镜'}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleOpenEdit}>
                    精修
                  </Button>
                </div>
              </div>
            )}
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
        onImageChange={handleImageChange}
      />
    </>
  );
}
