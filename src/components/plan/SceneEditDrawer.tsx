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

type SceneEditAspectRatio =
  | 'photo'
  | 'landscape'
  | 'portrait'
  | 'square'
  | '4/3'
  | '16/9'
  | 'auto';

export interface SceneEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: GeneratedScene | null;
  sceneIndex: number;
  owner: SceneOwner | null;
  lockedAspectRatio?: SceneEditAspectRatio;
  referenceCount?: number;
  recentTaskStatus?: string | null;
  /** 提示词更新回调（用于同步回场景 visualPrompt） */
  onPromptUpdate?: (visualPrompt: string) => Promise<void> | void;
  /** 图片变化回调 */
  onImageChange?: (filePath: string | null, artifactId: string | null) => void;
}

export function SceneEditDrawer({
  open,
  onOpenChange,
  scene,
  sceneIndex,
  owner,
  lockedAspectRatio = 'photo',
  referenceCount = 0,
  recentTaskStatus = null,
  onPromptUpdate,
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
      <SheetContent side="right" variant="inset" className="max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            场景 {sceneIndex + 1}: {scene.location}
          </SheetTitle>
          <SheetDescription>
            编辑场景预览图（约束默认锁定为 photo）
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
              <div>
                当前场景：#{sceneIndex + 1} {scene.location}
              </div>
              <div>画幅锁定：{lockedAspectRatio}</div>
              <div>参考图数量：{referenceCount} 张</div>
              <div>最近任务状态：{recentTaskStatus || '暂无任务'}</div>
              <div>
                参考图参与：
                {scene.sceneAssetImage ? '已配置 scene 参考图' : '未配置'}
              </div>
              <div>输出策略：单帧静态图</div>
            </div>

            <ImageStudioLite
              owner={owner}
              currentImagePath={scene.previewArtifactPath}
              referenceImages={
                scene.sceneAssetImage ? [scene.sceneAssetImage] : undefined
              }
              includeCurrentImageAsReference={false}
              defaultPrompt={scene.visualPrompt}
              onPromptSubmit={onPromptUpdate}
              onImageChange={handleImageChange}
              aspectRatio={lockedAspectRatio}
            />

            <div className="rounded-lg border bg-muted/50 p-4">
              <h4 className="text-sm font-medium text-foreground">场景信息</h4>
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
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
