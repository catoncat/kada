/**
 * Image Studio Lite
 * 通用图片生成/编辑组件
 *
 * Features:
 * - 显示当前图片版本
 * - 编辑 effective prompt
 * - 生成新版本
 * - 版本列表和切换
 * - 自动轮询任务状态
 */

import {
  Check,
  History,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
import { useImageGeneration, useTasksPolling } from '@/hooks/useTasks';
import { apiUrl } from '@/lib/api-config';
import { type ArtifactOwnerType, getArtifactUrl } from '@/lib/artifacts-api';
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
  /** 默认提示词 */
  defaultPrompt?: string;
  /** 图片变更回调 */
  onImageChange?: (filePath: string | null, artifactId: string | null) => void;
  /** 是否只读（不显示编辑按钮） */
  readonly?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 图片显示比例 */
  aspectRatio?: 'square' | '4/3' | '16/9' | 'auto';
}

export function ImageStudioLite({
  owner,
  currentImagePath,
  defaultPrompt = '',
  onImageChange,
  readonly = false,
  className,
  aspectRatio = '4/3',
}: ImageStudioLiteProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);

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
      // 刷新 artifacts 以获取新生成的图片
      refetchArtifacts();
      // 通知外部刷新
      onImageChange?.(null, null);
    },
  });

  // 同步 defaultPrompt 变化
  useEffect(() => {
    if (defaultPrompt && !prompt) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, prompt]);

  // 生成图片
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

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
        owner,
      });
      console.log('[ImageStudioLite] Task created:', task.id);
      // 添加到轮询列表
      setPendingTaskIds((prev) => [...prev, task.id]);
    } catch (error) {
      console.error('[ImageStudioLite] Failed to create image task:', error);
      setIsGenerating(false);
    }
  }, [prompt, isGenerating, createTask, owner]);

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
  const currentArtifact = artifactsData?.artifacts.find(
    (a) => a.id === artifactsData.currentArtifactId,
  );
  const displayPath = currentArtifact?.filePath || currentImagePath;
  const imageUrl = displayPath
    ? displayPath.startsWith('/')
      ? apiUrl(displayPath)
      : apiUrl(`/${displayPath}`)
    : null;

  const aspectRatioClass = {
    square: 'aspect-square',
    '4/3': 'aspect-[4/3]',
    '16/9': 'aspect-[16/9]',
    auto: '',
  }[aspectRatio];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 图片预览区 */}
      <div
        className={cn(
          'relative rounded-xl border bg-muted overflow-hidden',
          aspectRatioClass,
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Generated"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-12 opacity-50" />
            <span className="text-sm">暂无图片</span>
          </div>
        )}

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
      </div>

      {/* 提示词编辑区 */}
      {!readonly && (
        <div className="space-y-2">
          <Textarea
            placeholder="描述你想要的图片效果..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="resize-none"
          />
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
      <div className="size-10 rounded-md bg-muted overflow-hidden shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

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
