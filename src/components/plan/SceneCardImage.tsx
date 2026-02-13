/**
 * SceneCardImage - 场景卡片图片区域
 * 简化交互：仅展示图片，不再提供 hover 多动作菜单
 */

import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { getImageUrl } from '@/lib/scene-assets-api';

export interface SceneCardImageProps {
  currentImage?: string | null;
  sceneAssetImage?: string | null;
  sceneName?: string;
  isGenerating?: boolean;
  defaultPrompt?: string;
  onGenerate?: () => void;
  onOpenEdit?: () => void;
}

export function SceneCardImage({
  currentImage,
  sceneAssetImage,
  sceneName = '场景',
  isGenerating = false,
}: SceneCardImageProps) {
  const displayImage = currentImage || sceneAssetImage;
  const imageUrl = displayImage ? getImageUrl(displayImage) : null;

  return (
    <div className="relative w-full flex-shrink-0 md:w-64 md:self-start lg:w-72">
      <PhotoFrame
        src={imageUrl}
        alt={sceneName}
        className="w-full min-h-56 max-w-full"
        fallback={
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-10 w-10" />
            <p className="text-xs">暂无预览图</p>
          </div>
        }
      >
        {isGenerating ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}
      </PhotoFrame>
    </div>
  );
}
