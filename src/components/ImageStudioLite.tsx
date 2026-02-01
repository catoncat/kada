/**
 * Image Studio Lite
 * 通用图片生成/编辑组件
 *
 * Features:
 * - 显示当前图片版本
 * - 编辑 effective prompt
 * - 生成新版本
 * - 版本列表和切换
 */

import { useState, useCallback } from 'react';
import { Image as ImageIcon, Sparkles, History, Trash2, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useArtifacts,
  useSetCurrentArtifact,
  useDeleteArtifact,
  type GenerationArtifact,
} from '@/hooks/useArtifacts';
import { useImageGeneration } from '@/hooks/useTasks';
import { getArtifactUrl, type ArtifactOwnerType } from '@/lib/artifacts-api';
import { apiUrl } from '@/lib/api-config';

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

  // 获取版本列表
  const {
    data: artifactsData,
    isLoading: isLoadingArtifacts,
    refetch: refetchArtifacts,
  } = useArtifacts(
    { ownerType: owner.type, ownerId: owner.id, slot: owner.slot },
    { enabled: showHistory }
  );

  const setCurrentMutation = useSetCurrentArtifact();
  const deleteMutation = useDeleteArtifact();
  const { createTask } = useImageGeneration();

  // 生成图片
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      await createTask({
        prompt: prompt.trim(),
        relatedId: owner.id,
        relatedMeta: JSON.stringify({ type: owner.type, slot: owner.slot }),
        owner,
      });
      // 任务创建成功后，轮询会处理后续更新
      // 这里可以添加 toast 提示
    } catch (error) {
      console.error('Failed to create image task:', error);
    } finally {
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
    [setCurrentMutation, onImageChange]
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
    [deleteMutation, refetchArtifacts]
  );

  // 计算图片 URL
  const imageUrl = currentImagePath
    ? currentImagePath.startsWith('/')
      ? apiUrl(currentImagePath)
      : apiUrl(`/${currentImagePath}`)
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
          aspectRatioClass
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
        isCurrent && 'bg-accent'
      )}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      role="button"
      tabIndex={0}
    >
      {/* 缩略图 */}
      <div className="size-10 rounded-md bg-muted overflow-hidden shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
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
