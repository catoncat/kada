/**
 * Image Studio Lite
 * 通用图片生成/编辑组件（单提示词主流程）
 */

import {
  Check,
  History,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PhotoFrame } from '@/components/PhotoFrame';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  type GenerationArtifact,
  useArtifacts,
  useDeleteArtifact,
  useSetCurrentArtifact,
} from '@/hooks/useArtifacts';
import type { PhotoOrientation } from '@/hooks/usePhotoOrientation';
import { useImageGeneration, useTasksPolling } from '@/hooks/useTasks';
import { apiUrl } from '@/lib/api-config';
import { type ArtifactOwnerType, getArtifactUrl } from '@/lib/artifacts-api';
import type { PromptOptimizationMeta } from '@/lib/prompts-api';
import { cn } from '@/lib/utils';

export interface ImageStudioLiteProps {
  /** Owner 信息（用于查询和归属 artifacts） */
  owner: {
    type: ArtifactOwnerType;
    id: string;
    slot?: string;
  };
  /** 当前图片路径（如已有图片） */
  currentImagePath?: string | null;
  /** 参考图（用于文+图生图 / 风格一致性） */
  referenceImages?: string[];
  /** 是否把 currentImagePath 也作为参考图参与生成（默认 true） */
  includeCurrentImageAsReference?: boolean;
  /** 默认提示词 */
  defaultPrompt?: string;
  /** 生成前同步提示词（例如写回场景 visualPrompt） */
  onPromptSubmit?: (prompt: string) => Promise<void> | void;
  /** 图片变更回调 */
  onImageChange?: (filePath: string | null, artifactId: string | null) => void;
  /** 是否只读（不显示编辑按钮） */
  readonly?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 图片显示比例 */
  aspectRatio?:
    | 'photo'
    | 'landscape'
    | 'portrait'
    | 'square'
    | '4/3'
    | '16/9'
    | 'auto';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePromptOptimizationMeta(
  value: unknown,
): PromptOptimizationMeta | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const status =
    raw.status === 'optimized' ||
    raw.status === 'fallback' ||
    raw.status === 'skipped'
      ? raw.status
      : 'skipped';

  return {
    status,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    providerId: typeof raw.providerId === 'string' ? raw.providerId : null,
    providerFormat:
      typeof raw.providerFormat === 'string' ? raw.providerFormat : null,
    textModel: typeof raw.textModel === 'string' ? raw.textModel : null,
    assumptions: toStringArray(raw.assumptions),
    conflicts: toStringArray(raw.conflicts),
    negativePrompt:
      typeof raw.negativePrompt === 'string' ? raw.negativePrompt : null,
  };
}

function getOptimizationStatusText(
  meta: PromptOptimizationMeta | null,
): string {
  if (!meta) return '未生成';
  if (meta.status === 'optimized') return '已自动优化';
  if (meta.status === 'fallback') return '优化失败（已回退）';
  return '未执行优化';
}

export function ImageStudioLite({
  owner,
  currentImagePath,
  referenceImages,
  includeCurrentImageAsReference = true,
  defaultPrompt = '',
  onPromptSubmit,
  onImageChange,
  readonly = false,
  className,
  aspectRatio = 'photo',
}: ImageStudioLiteProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [effectivePromptRuntime, setEffectivePromptRuntime] = useState('');
  const [sourcePromptRuntime, setSourcePromptRuntime] = useState('');
  const [promptOptimizationRuntime, setPromptOptimizationRuntime] =
    useState<PromptOptimizationMeta | null>(null);
  const [lastRunState, setLastRunState] = useState<
    'idle' | 'completed' | 'failed'
  >('idle');
  const [lastRunError, setLastRunError] = useState<string | null>(null);

  const {
    data: artifactsData,
    isLoading: isLoadingArtifacts,
    refetch: refetchArtifacts,
  } = useArtifacts(
    { ownerType: owner.type, ownerId: owner.id, slot: owner.slot },
    { enabled: showHistory || pendingTaskIds.length > 0 },
  );

  const setCurrentMutation = useSetCurrentArtifact();
  const deleteMutation = useDeleteArtifact();
  const { createTask } = useImageGeneration();
  const ownerKey = `${owner.type}:${owner.id}:${owner.slot || ''}`;
  const currentArtifact =
    artifactsData?.artifacts.find(
      (a) => a.id === artifactsData.currentArtifactId,
    ) || artifactsData?.artifacts[0];
  const displayPath = currentArtifact?.filePath || currentImagePath;

  useTasksPolling(pendingTaskIds, {
    enabled: pendingTaskIds.length > 0,
    onAllComplete: (tasks) => {
      setPendingTaskIds([]);
      setIsGenerating(false);

      let latestArtifactId: string | null = null;
      let latestFilePath: string | null = null;
      let latestEffectivePrompt = '';
      let latestSourcePrompt = '';
      let latestOptimization: PromptOptimizationMeta | null = null;

      for (let i = tasks.length - 1; i >= 0; i--) {
        const task = tasks[i];
        if (task?.status !== 'completed') continue;

        const output = task.output as
          | {
              artifactId?: unknown;
              filePath?: unknown;
              effectivePrompt?: unknown;
              sourceEffectivePrompt?: unknown;
              promptOptimization?: unknown;
            }
          | null
          | undefined;

        const artifactId =
          output && typeof output.artifactId === 'string'
            ? output.artifactId.trim()
            : '';
        const filePathRaw =
          output && typeof output.filePath === 'string'
            ? output.filePath.trim()
            : '';

        if (
          !latestEffectivePrompt &&
          typeof output?.effectivePrompt === 'string'
        ) {
          latestEffectivePrompt = output.effectivePrompt.trim();
          latestSourcePrompt =
            typeof output.sourceEffectivePrompt === 'string'
              ? output.sourceEffectivePrompt.trim()
              : '';
          latestOptimization = normalizePromptOptimizationMeta(
            output.promptOptimization,
          );
        }

        if (filePathRaw && !latestFilePath) {
          latestArtifactId = artifactId || null;
          latestFilePath = filePathRaw.startsWith('/')
            ? filePathRaw
            : `/${filePathRaw}`;
        }
      }

      if (latestEffectivePrompt) {
        setEffectivePromptRuntime(latestEffectivePrompt);
        setSourcePromptRuntime(latestSourcePrompt);
        setPromptOptimizationRuntime(latestOptimization);
      }

      if (latestFilePath) {
        setLastRunState('completed');
        setLastRunError(null);
      } else {
        const failedTask = tasks.find((task) => task.status === 'failed');
        setLastRunState('failed');
        setLastRunError(failedTask?.error || '任务执行失败');
      }

      refetchArtifacts();
      if (latestFilePath) {
        onImageChange?.(latestFilePath, latestArtifactId);
      }
    },
  });

  useEffect(() => {
    if (defaultPrompt && !prompt) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, prompt]);

  const prevOwnerKeyRef = useRef(ownerKey);

  useEffect(() => {
    if (prevOwnerKeyRef.current === ownerKey) return;
    prevOwnerKeyRef.current = ownerKey;
    setPrompt(defaultPrompt);
    setEffectivePromptRuntime('');
    setSourcePromptRuntime('');
    setPromptOptimizationRuntime(null);
    setLastRunState('idle');
    setLastRunError(null);
  }, [ownerKey, defaultPrompt]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isGenerating) return;

    const refs = [
      ...(Array.isArray(referenceImages) ? referenceImages : []),
      ...(includeCurrentImageAsReference && displayPath ? [displayPath] : []),
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    const uniqueRefs = Array.from(new Set(refs));

    setIsGenerating(true);
    setLastRunError(null);

    try {
      if (onPromptSubmit) {
        await onPromptSubmit(trimmedPrompt);
      }

      const task = await createTask({
        prompt: trimmedPrompt,
        relatedId: owner.id,
        relatedMeta: JSON.stringify({ type: owner.type, slot: owner.slot }),
        referenceImages: uniqueRefs.length > 0 ? uniqueRefs : undefined,
        owner,
        options: {
          aspectRatio,
        },
      });
      setPendingTaskIds((prev) => [...prev, task.id]);
    } catch (error) {
      console.error('[ImageStudioLite] Failed to create image task:', error);
      setIsGenerating(false);
      setLastRunState('failed');
      setLastRunError(error instanceof Error ? error.message : '创建任务失败');
    }
  }, [
    prompt,
    isGenerating,
    referenceImages,
    includeCurrentImageAsReference,
    displayPath,
    onPromptSubmit,
    createTask,
    owner,
    aspectRatio,
  ]);

  const handleSwitchVersion = useCallback(
    async (artifact: GenerationArtifact) => {
      try {
        await setCurrentMutation.mutateAsync(artifact.id);
        onImageChange?.(artifact.filePath, artifact.id);
        setShowHistory(false);
      } catch (error) {
        console.error('Failed to switch version:', error);
      }
    },
    [setCurrentMutation, onImageChange],
  );

  const handleDeleteVersion = useCallback(
    async (artifact: GenerationArtifact) => {
      try {
        await deleteMutation.mutateAsync({ id: artifact.id });
        refetchArtifacts();
      } catch (error) {
        console.error('Failed to delete version:', error);
      }
    },
    [deleteMutation, refetchArtifacts],
  );

  const imageUrl = displayPath
    ? displayPath.startsWith('/')
      ? apiUrl(displayPath)
      : apiUrl(`/${displayPath}`)
    : null;

  const aspectRatioClass = {
    square: 'aspect-square',
    '4/3': 'aspect-[4/3]',
    '16/9': 'aspect-[16/9]',
    photo: '',
    landscape: '',
    portrait: '',
    auto: '',
  }[aspectRatio];

  const forcedOrientation: PhotoOrientation | undefined =
    aspectRatio === 'landscape'
      ? 'landscape'
      : aspectRatio === 'portrait'
        ? 'portrait'
        : undefined;

  const runtimeRefs = [
    ...(Array.isArray(referenceImages) ? referenceImages : []),
    ...(includeCurrentImageAsReference && displayPath ? [displayPath] : []),
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  const uniqueRuntimeRefs = Array.from(new Set(runtimeRefs));

  const runStatusText = isGenerating
    ? '生成中'
    : pendingTaskIds.length > 0
      ? '任务进行中'
      : lastRunState === 'failed'
        ? '最近一次失败'
        : lastRunState === 'completed'
          ? '最近一次完成'
          : '待生成';

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PhotoFrame
        src={imageUrl}
        alt="Generated"
        forcedOrientation={forcedOrientation}
        className={cn('rounded-xl border', aspectRatioClass)}
        fallback={
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-12 opacity-50" />
            <span className="text-sm">暂无图片</span>
          </div>
        }
      >
        {isGenerating && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">生成中...</span>
          </div>
        )}

        {!readonly && (
          <div className="absolute top-2 right-2">
            <Popover open={showHistory} onOpenChange={setShowHistory}>
              <PopoverTrigger
                render={
                  <Button size="icon" variant="secondary" className="size-8">
                    <History className="size-4" />
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-64 p-0">
                <div className="p-3 border-b">
                  <h4 className="font-medium text-sm">版本历史</h4>
                </div>
                <ScrollArea className="max-h-64">
                  {isLoadingArtifacts ? (
                    <div className="p-4 flex justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : artifactsData?.artifacts.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      暂无版本记录
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {artifactsData?.artifacts.map((artifact) => (
                        <VersionItem
                          key={artifact.id}
                          artifact={artifact}
                          isCurrent={
                            artifact.id === artifactsData.currentArtifactId
                          }
                          onSelect={() => handleSwitchVersion(artifact)}
                          onDelete={() => handleDeleteVersion(artifact)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </PhotoFrame>

      {!readonly && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-sm font-medium">出图提示词</div>
            <Textarea
              placeholder="描述你想要的图片效果..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                生成图片
              </>
            )}
          </Button>

          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>运行状态：{runStatusText}</span>
              <span>
                自动优化：{getOptimizationStatusText(promptOptimizationRuntime)}
              </span>
              <span>参考图：{uniqueRuntimeRefs.length} 张</span>
              <span>画幅锁定：{aspectRatio}</span>
              <span>输出策略：单帧静态图</span>
            </div>
            {lastRunError ? (
              <p className="mt-1 text-xs text-red-600">错误：{lastRunError}</p>
            ) : null}
          </div>

          <details className="rounded-xl border bg-muted/40 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              开发调试信息
            </summary>

            <div className="mt-3 space-y-3">
              <PromptOptimizationPanel meta={promptOptimizationRuntime} />

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  最终执行提示词
                </div>
                <Textarea
                  value={effectivePromptRuntime}
                  readOnly
                  rows={6}
                  className="resize-none font-mono text-xs"
                  placeholder="任务完成后显示"
                />
              </div>

              {sourcePromptRuntime &&
                sourcePromptRuntime !== effectivePromptRuntime && (
                  <details className="rounded-lg border bg-background/60 p-2">
                    <summary className="cursor-pointer text-xs font-medium">
                      查看优化前提示词
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-2xs">
                      {sourcePromptRuntime}
                    </pre>
                  </details>
                )}

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  本次发送参考图
                </div>
                {uniqueRuntimeRefs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">无</div>
                ) : (
                  <div className="space-y-1 text-2xs text-muted-foreground">
                    {uniqueRuntimeRefs.map((item, index) => (
                      <div key={item} className="truncate">
                        {index + 1}. {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function PromptOptimizationPanel({
  meta,
}: {
  meta: PromptOptimizationMeta | null;
}) {
  if (!meta) {
    return (
      <div className="rounded-lg border bg-background/60 p-2 text-xs text-muted-foreground">
        暂无优化摘要（尚未执行或任务未返回该字段）。
      </div>
    );
  }

  const statusText =
    meta.status === 'optimized'
      ? '已优化'
      : meta.status === 'fallback'
        ? '优化失败（已回退）'
        : '已跳过';

  return (
    <div className="rounded-lg border bg-background/60 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">Prompt 优化摘要</div>
        <div className="text-2xs text-muted-foreground">{statusText}</div>
      </div>

      <div className="grid gap-1 text-2xs text-muted-foreground">
        <div>provider: {meta.providerId || '-'}</div>
        <div>model: {meta.textModel || '-'}</div>
      </div>

      {meta.reason && (
        <div className="text-2xs text-amber-700">原因：{meta.reason}</div>
      )}
    </div>
  );
}

interface VersionItemProps {
  artifact: GenerationArtifact;
  isCurrent: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function VersionItem({
  artifact,
  isCurrent,
  onSelect,
  onDelete,
}: VersionItemProps) {
  const imageUrl = getArtifactUrl(artifact.filePath);
  const createdAt = artifact.createdAt
    ? new Date(artifact.createdAt).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '未知时间';

  return (
    // biome-ignore lint/a11y/useSemanticElements: container includes nested interactive controls
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer group',
        isCurrent && 'bg-accent',
      )}
      onClick={onSelect}
      onKeyDown={(event) => event.key === 'Enter' && onSelect()}
      role="button"
      tabIndex={0}
    >
      <PhotoFrame
        src={imageUrl}
        alt=""
        className="h-10 rounded-md shrink-0"
        fallback={
          <div className="h-full w-full flex items-center justify-center">
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
        }
      />

      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{createdAt}</p>
        {artifact.effectivePrompt && (
          <p className="text-xs truncate">{artifact.effectivePrompt}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isCurrent && <Check className="size-4 text-primary" />}
        <Button
          size="icon"
          variant="ghost"
          className="size-6 opacity-0 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}
