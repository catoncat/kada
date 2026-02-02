/**
 * SceneCardContent - 场景卡片内容区域
 * 展示场景的描述、拍摄建议、灯光布置信息
 */

import { Camera, FileText, Lightbulb } from 'lucide-react';
import type { GeneratedScene } from './types';

export interface SceneCardContentProps {
  scene: GeneratedScene;
  sceneIndex: number;
}

export function SceneCardContent({ scene, sceneIndex }: SceneCardContentProps) {
  return (
    <div className="flex-1 p-6">
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
          {sceneIndex + 1}
        </span>
        <h3 className="text-lg font-semibold text-foreground">
          {scene.location}
        </h3>
      </div>

      {/* 详情列表 */}
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground">内容描述：</span>
            <span className="text-foreground">{scene.description}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Camera className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground">拍摄建议：</span>
            <span className="text-foreground">{scene.shots}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-muted-foreground">灯光布置：</span>
            <span className="text-foreground">{scene.lighting}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
