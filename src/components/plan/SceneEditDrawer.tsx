/**
 * SceneEditDrawer - 场景图片编辑抽屉
 * 右侧抽屉，集成 ImageStudioLite 进行图片生成和编辑
 * 不遮挡页面内容，但保持焦点捕获
 */

import { ImageStudioLite } from '@/components/ImageStudioLite';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from '@/components/ui/sheet';
import type { GeneratedScene, SceneOwner } from './types';

export interface SceneEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: GeneratedScene | null;
  sceneIndex: number;
  owner: SceneOwner | null;
  /** 图片变化回调 */
  onImageChange?: (filePath: string | null, artifactId: string | null) => void;
}

export function SceneEditDrawer({
  open,
  onOpenChange,
  scene,
  sceneIndex,
  owner,
  onImageChange,
}: SceneEditDrawerProps) {
  if (!scene || !owner) return null;

  const handleImageChange = (
    filePath: string | null,
    artifactId: string | null,
  ) => {
    onImageChange?.(filePath, artifactId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal="trap-focus">
      <SheetContent side="right" variant="inset">
        <SheetHeader>
          <SheetTitle>
            场景 {sceneIndex + 1}: {scene.location}
          </SheetTitle>
          <SheetDescription>编辑场景预览图</SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="space-y-4">
            <ImageStudioLite
              owner={owner}
              currentImagePath={scene.previewArtifactPath}
              referenceImages={scene.sceneAssetImage ? [scene.sceneAssetImage] : undefined}
              includeCurrentImageAsReference={false}
              defaultPrompt={scene.visualPrompt}
              onImageChange={handleImageChange}
              aspectRatio="photo"
            />

            {/* 场景信息摘要 */}
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <h4 className="text-sm font-medium text-foreground">场景信息</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">描述：</span>
                  {scene.description}
                </p>
                <p>
                  <span className="font-medium">拍摄：</span>
                  {scene.shots}
                </p>
                <p>
                  <span className="font-medium">灯光：</span>
                  {scene.lighting}
                </p>
              </div>
            </div>
          </div>
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}
