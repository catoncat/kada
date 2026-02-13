/**
 * Image Studio Lite
 * 通用图片生成/编辑组件
 *
 * Features:
 * - 显示当前图片版本
 * - 编辑 draft prompt（服务端拼接为 effectivePrompt）
 * - 生成新版本
 * - 版本列表和切换
 * - 自动轮询任务状态
 */

import {
  Check,
  Copy,
  History,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
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
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import type { PhotoOrientation } from '@/hooks/usePhotoOrientation';
import { useImageGeneration, useTasksPolling } from '@/hooks/useTasks';
import { apiUrl } from '@/lib/api-config';
import { type ArtifactOwnerType, getArtifactUrl } from '@/lib/artifacts-api';
import {
  previewImagePrompt,
  type PromptComposerMeta,
  type PromptOptimizationMeta,
  type ReferencePlanSummary,
} from '@/lib/prompts-api';
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
    raw.status === 'optimized' || raw.status === 'fallback' || raw.status === 'skipped'
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

export function ImageStudioLite({
  owner,
  currentImagePath,
  referenceImages,
  includeCurrentImageAsReference = true,
  defaultPrompt = '',
  onImageChange,
  readonly = false,
  className,
  aspectRatio = 'photo',
}: ImageStudioLiteProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [effectivePromptPreview, setEffectivePromptPreview] = useState('');
  const [sourcePromptPreview, setSourcePromptPreview] = useState('');
  const [previewComposer, setPreviewComposer] =
    useState<PromptComposerMeta | null>(null);
  const [previewStudioTemplateId, setPreviewStudioTemplateId] =
    useState<string | null>(null);
  const [promptOptimizationPreview, setPromptOptimizationPreview] =
    useState<PromptOptimizationMeta | null>(null);
  const [referencePlanPreview, setReferencePlanPreview] =
    useState<ReferencePlanSummary | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // 获取版本列表
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

  // 轮询任务状态
  useTasksPolling(pendingTaskIds, {
    enabled: pendingTaskIds.length > 0,
    onTaskComplete: (task) => {
      console.log('[ImageStudioLite] Task completed:', task.id, task.status);
    },
    onAllComplete: (tasks) => {
      console.log('[ImageStudioLite] All tasks completed:', tasks.length);
      setPendingTaskIds([]);
      setIsGenerating(false);

      let latestArtifactId: string | null = null;
      let latestFilePath: string | null = null;
      for (let i = tasks.length - 1; i >= 0; i--) {
        const t = tasks[i];
        if (t?.status !== 'completed') continue;
        const output = t.output as
          | { artifactId?: unknown; filePath?: unknown }
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
        if (!filePathRaw) continue;
        latestArtifactId = artifactId || null;
        latestFilePath = filePathRaw.startsWith('/')
          ? filePathRaw
          : `/${filePathRaw}`;
        break;
      }

      // 以服务端回显的最终执行 prompt 为准
      for (let i = tasks.length - 1; i >= 0; i--) {
        const output = tasks[i]?.output as
          | {
              effectivePrompt?: unknown;
              sourceEffectivePrompt?: unknown;
              promptOptimization?: unknown;
            }
          | null;
        if (
          output &&
          typeof output.effectivePrompt === 'string' &&
          output.effectivePrompt.trim()
        ) {
          setEffectivePromptPreview(output.effectivePrompt.trim());
          setSourcePromptPreview(
            typeof output.sourceEffectivePrompt === 'string'
              ? output.sourceEffectivePrompt.trim()
              : '',
          );
          setPromptOptimizationPreview(
            normalizePromptOptimizationMeta(output.promptOptimization),
          );
          break;
        }
      }
      // 刷新 artifacts 以获取新生成的图片
      refetchArtifacts();
      // 通知外部刷新（对话框/抽屉外的 UI 需要依赖它回显）
      if (latestFilePath) {
        onImageChange?.(latestFilePath, latestArtifactId);
      }
    },
  });

  // 同步 defaultPrompt 变化
  useEffect(() => {
    if (defaultPrompt && !prompt) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, prompt]);

  const prevOwnerKeyRef = useRef(ownerKey);

  // owner 变化时（例如切换不同场景/slot），重置为默认提示词
  useEffect(() => {
    if (prevOwnerKeyRef.current === ownerKey) return;
    prevOwnerKeyRef.current = ownerKey;
    setPrompt(defaultPrompt);
    setPreviewComposer(null);
    setPreviewStudioTemplateId(null);
    setSourcePromptPreview('');
    setPromptOptimizationPreview(null);
    setReferencePlanPreview(null);
  }, [ownerKey, defaultPrompt]);

  const runPreview = useCallback(async (
    draft: string,
    options?: { forceRefresh?: boolean },
  ) => {
    if (readonly) return;

    const draftPrompt = draft.trim();
    if (!draftPrompt) {
      setPreviewComposer(null);
      setPreviewStudioTemplateId(null);
      setEffectivePromptPreview('');
      setSourcePromptPreview('');
      setPromptOptimizationPreview(null);
      setReferencePlanPreview(null);
      setPreviewError(null);
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const res = await previewImagePrompt({
        prompt: draftPrompt,
        owner,
        referenceImages,
        currentImagePath: displayPath || null,
        includeCurrentImageAsReference,
      }, { forceRefresh: options?.forceRefresh });
      const finalPrompt = (res.renderPrompt || res.effectivePrompt || '').trim();
      setEffectivePromptPreview(finalPrompt);
      setSourcePromptPreview((res.effectivePrompt || '').trim());
      setPreviewComposer(res.composer || null);
      setPreviewStudioTemplateId(
        typeof res.studioTemplateId === 'string' && res.studioTemplateId.trim()
          ? res.studioTemplateId.trim()
          : null,
      );
      setPromptOptimizationPreview(
        normalizePromptOptimizationMeta(res.promptOptimization),
      );
      setReferencePlanPreview(res.referencePlan || null);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '预览失败');
      setPromptOptimizationPreview(null);
      setReferencePlanPreview(null);
    } finally {
      setIsPreviewing(false);
    }
  }, [
    readonly,
    owner,
    referenceImages,
    displayPath,
    includeCurrentImageAsReference,
  ]);

  const previewEffectivePrompt = useDebouncedCallback((draft: string) => {
    void runPreview(draft);
  }, 350);

  useEffect(() => {
    previewEffectivePrompt(prompt);
  }, [prompt, previewEffectivePrompt]);

  const handleRegeneratePreview = useCallback(() => {
    if (!prompt.trim()) return;
    void runPreview(prompt, { forceRefresh: true });
  }, [prompt, runPreview]);

  // 生成图片
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    const refs = [
      ...(Array.isArray(referenceImages) ? referenceImages : []),
      ...(includeCurrentImageAsReference && displayPath ? [displayPath] : []),
    ]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    const uniqueRefs = Array.from(new Set(refs));

    console.log(
      '[ImageStudioLite] Creating image task with prompt:',
      prompt.trim(),
    );
    setIsGenerating(true);
    try {
      const task = await createTask({
        prompt: prompt.trim(),
        relatedId: owner.id,
        relatedMeta: JSON.stringify({ type: owner.type, slot: owner.slot }),
        referenceImages: uniqueRefs.length > 0 ? uniqueRefs : undefined,
        owner,
      });
      console.log('[ImageStudioLite] Task created:', task.id);
      // 添加到轮询列表
      setPendingTaskIds((prev) => [...prev, task.id]);
    } catch (error) {
      console.error('[ImageStudioLite] Failed to create image task:', error);
      setIsGenerating(false);
    }
  }, [
    prompt,
    isGenerating,
    createTask,
    owner,
    referenceImages,
    displayPath,
    includeCurrentImageAsReference,
  ]);

  // 切换版本
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

  // 删除版本
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

  // 计算图片 URL - 优先使用当前 artifact
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
  const previewStatusText =
    !prompt.trim()
      ? '待输入'
      : isPreviewing
        ? '预览生成中'
        : promptOptimizationPreview
          ? promptOptimizationPreview.status === 'optimized'
            ? '已优化'
            : promptOptimizationPreview.status === 'fallback'
              ? '优化失败（已回退）'
              : '已跳过优化'
          : effectivePromptPreview
            ? '已生成预览'
            : '待预览';
  const previewReferenceCount = referencePlanPreview?.totalCount ?? 0;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 图片预览区 */}
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
        {/* 生成中状态 */}
        {isGenerating && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">生成中...</span>
          </div>
        )}

        {/* 版本历史按钮 */}
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

      {/* 提示词编辑区 */}
      {!readonly && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">出图提示词（draft）</div>
              <div className="text-xs text-muted-foreground">
                会参与服务端上下文拼接
              </div>
            </div>
            <Textarea
              placeholder="描述你想要的图片效果..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
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
              <span>预览状态：{previewStatusText}</span>
              <span>参考图：{previewReferenceCount} 张</span>
              {previewComposer ? <span>编排：{previewComposer.name}</span> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              默认使用简化视图；需要排查时展开下方技术详情。
            </p>
          </div>

          <details className="rounded-xl border bg-muted/40 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              技术详情
            </summary>
            <div className="mt-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    最终出图文案
                  </div>
                  {previewComposer ? (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      编排：{previewComposer.name} · {previewComposer.version}
                      {previewStudioTemplateId
                        ? ` · 系统提示词：${previewStudioTemplateId}`
                        : ''}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      服务端拼接后经优化器处理，最终用于模型执行
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!prompt.trim() || isPreviewing}
                    onClick={handleRegeneratePreview}
                  >
                    <RefreshCw
                      className={cn('mr-1 size-3.5', isPreviewing && 'animate-spin')}
                    />
                    重新生成
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={!effectivePromptPreview}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          effectivePromptPreview,
                        );
                      } catch {
                        // ignore
                      }
                    }}
                    title="复制"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>

              {isPreviewing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  <span>正在生成预览…</span>
                </div>
              )}
              {previewError && (
                <div className="text-xs text-red-500">{previewError}</div>
              )}

              <Textarea
                value={effectivePromptPreview}
                readOnly
                rows={6}
                className="resize-none font-mono text-xs"
                placeholder="（将显示最终执行的提示词）"
              />

              {promptOptimizationPreview && (
                <PromptOptimizationPanel meta={promptOptimizationPreview} />
              )}

              {sourcePromptPreview &&
                sourcePromptPreview !== effectivePromptPreview && (
                  <details className="rounded-lg border bg-background/60 p-2">
                    <summary className="cursor-pointer text-xs font-medium">
                      查看优化前拼接文案
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-2xs">
                      {sourcePromptPreview}
                    </pre>
                  </details>
                )}

              {referencePlanPreview && (
                <ReferencePlanPanel plan={referencePlanPreview} />
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function PromptOptimizationPanel({ meta }: { meta: PromptOptimizationMeta }) {
  const statusText =
    meta.status === 'optimized'
      ? '已优化'
      : meta.status === 'fallback'
        ? '优化失败（已回退）'
        : '已跳过';
  const hasAssumptions = meta.assumptions.length > 0;
  const hasConflicts = meta.conflicts.length > 0;

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

      {(hasAssumptions || hasConflicts) && (
        <div className="grid gap-2 text-2xs">
          <div>
            <div className="font-medium text-muted-foreground">假设补全</div>
            {hasAssumptions ? (
              <div className="space-y-0.5">
                {meta.assumptions.map((item) => (
                  <div key={`assume-${item}`}>{item}</div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">无</div>
            )}
          </div>
          <div>
            <div className="font-medium text-muted-foreground">冲突处理</div>
            {hasConflicts ? (
              <div className="space-y-0.5">
                {meta.conflicts.map((item) => (
                  <div key={`conflict-${item}`}>{item}</div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">无</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferencePlanPanel({ plan }: { plan: ReferencePlanSummary }) {
  const hasDropped = plan.droppedGeneratedImages.length > 0;
  const toPreviewUrl = (value: string) => {
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    const normalized = value.startsWith('/') ? value : `/${value}`;
    return apiUrl(normalized);
  };

  const renderReferenceList = (
    items: string[],
    role: 'scene' | 'identity',
  ) => {
    if (items.length === 0) {
      return <div className="text-muted-foreground">无</div>;
    }
    return (
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div
            key={`${role}-${item}`}
            className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
          >
            <div className="text-[10px] font-mono text-muted-foreground shrink-0">
              {index + 1}
            </div>
            <div className="size-9 shrink-0 overflow-hidden rounded border bg-background">
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <img
                src={toPreviewUrl(item)}
                className="size-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px]">{item}</div>
              {item.includes('.scene-noface.') ? (
                <div className="text-[10px] text-emerald-600">
                  已使用场景去脸缓存图
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-background/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">参考图参与详情</div>
        <div className="text-2xs text-muted-foreground">
          总计 {plan.totalCount} 张
        </div>
      </div>

      <div className="grid gap-2 text-2xs">
        <div>
          <div className="font-medium text-muted-foreground">
            人物参考（{plan.counts.identity}）
          </div>
          {renderReferenceList(plan.byRole.identity, 'identity')}
        </div>

        <div>
          <div className="font-medium text-muted-foreground">
            场景参考（{plan.counts.scene}）
          </div>
          {renderReferenceList(plan.byRole.scene, 'scene')}
        </div>
      </div>

      {plan.order.length > 0 && (
        <div>
          <div className="text-2xs font-medium text-muted-foreground">
            参与顺序
          </div>
          <div className="mt-1 space-y-0.5 text-2xs">
            {plan.order.map((item, idx) => (
              <div key={`order-${item}`}>
                {idx + 1}. {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasDropped && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-2xs text-amber-700">
          已自动过滤 {plan.droppedGeneratedImages.length} 张同场景历史生成图：
          {plan.droppedGeneratedImages.map((item) => (
            <div key={`dropped-${item}`} className="truncate">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 版本项组件
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
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      role="button"
      tabIndex={0}
    >
      {/* 缩略图 */}
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

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{createdAt}</p>
        {artifact.effectivePrompt && (
          <p className="text-xs truncate">{artifact.effectivePrompt}</p>
        )}
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1 shrink-0">
        {isCurrent && <Check className="size-4 text-primary" />}
        <Button
          size="icon"
          variant="ghost"
          className="size-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}
