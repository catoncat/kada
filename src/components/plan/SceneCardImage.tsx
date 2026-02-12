/**
 * SceneCardImage - 场景卡片图片区域
 * 显示预览图，点击编辑时通知父组件打开抽屉
 */

import { Edit, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Button } from '@/components/ui/button';
import { getImageUrl } from '@/lib/scene-assets-api';

export interface SceneCardImageProps {
  /** 当前图片路径 */
  currentImage?: string | null;
  /** 场景资产图片（优先显示） */
  sceneAssetImage?: string | null;
  /** 默认提示词 */
  defaultPrompt?: string;
  /** 场景名称，用于 alt */
  sceneName?: string;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 生成回调（用于外部控制生成） */
  onGenerate?: () => void;
  /** 打开编辑抽屉回调 */
  onOpenEdit?: () => void;
  /** 查看最近任务回调 */
  onViewRecentTasks?: () => void;
}

export function SceneCardImage({
  currentImage,
  sceneAssetImage,
  defaultPrompt = '',
  sceneName = '场景',
  isGenerating = false,
  onGenerate,
  onOpenEdit,
  onViewRecentTasks,
}: SceneCardImageProps) {
  // 确定显示的图片
  const displayImage = currentImage || sceneAssetImage;
  const imageUrl = displayImage ? getImageUrl(displayImage) : null;

  return (
    <div className="relative w-full md:w-64 lg:w-72 flex-shrink-0">
      {/* 图片预览区域 */}
      <PhotoFrame
        src={imageUrl}
        alt={sceneName}
        className="group"
        fallback={
          <div className="h-full w-full flex flex-col items-center justify-center gap-3">
            <ImageIcon className="w-12 h-12 text-muted-foreground" />
            {defaultPrompt && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onGenerate?.()}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                生成预览
              </Button>
            )}
          </div>
        }
      >

        {/* 悬浮操作按钮（有图片时显示） */}
        {imageUrl && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onGenerate?.()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              重新生成
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpenEdit?.()}
            >
              <Edit className="w-4 h-4" />
              编辑
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onViewRecentTasks?.()}
            >
              查看最近任务
            </Button>
          </div>
        )}
      </PhotoFrame>

      {/* 编辑按钮（固定在右下角） */}
      <div className="absolute bottom-2 right-2 z-10">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2"
          onClick={() => onOpenEdit?.()}
        >
          <Edit className="w-4 h-4" />
          <span className="text-xs">编辑</span>
        </Button>
      </div>
    </div>
  );
}
