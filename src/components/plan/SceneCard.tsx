/**
 * SceneCard - 完整的场景卡片组件
 * 组合 SceneCardImage 和 SceneCardContent，管理编辑抽屉状态
 */

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SceneCardContent } from './SceneCardContent';
import { SceneCardImage } from './SceneCardImage';
import { SceneEditDrawer } from './SceneEditDrawer';
import type { GeneratedScene, SceneOwner } from './types';

export interface SceneCardProps {
  scene: GeneratedScene;
  sceneIndex: number;
  projectId: string;
  /** 初始自动打开编辑抽屉（用于从任务列表跳转） */
  autoOpenEdit?: boolean;
  /** 是否正在生成预览图 */
  isGenerating?: boolean;
  /** 生成预览图回调 */
  onGeneratePreview?: (sceneIndex: number, visualPrompt: string) => void;
  /** 图片变化回调（用于刷新数据） */
  onImageChange?: () => void;
  /** 查看该场景最近任务 */
  onViewRecentTasks?: (sceneIndex: number) => void;
}

export function SceneCard({
  scene,
  sceneIndex,
  projectId,
  autoOpenEdit = false,
  isGenerating = false,
  onGeneratePreview,
  onImageChange,
  onViewRecentTasks,
}: SceneCardProps) {
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  useEffect(() => {
    if (autoOpenEdit) setEditDrawerOpen(true);
  }, [autoOpenEdit]);

  // 构建 owner 配置
  const owner: SceneOwner = {
    type: 'planScene',
    id: projectId,
    slot: `scene:${sceneIndex}`,
  };

  // 处理生成
  const handleGenerate = useCallback(() => {
    if (scene.visualPrompt) {
      onGeneratePreview?.(sceneIndex, scene.visualPrompt);
    }
  }, [sceneIndex, scene.visualPrompt, onGeneratePreview]);

  // 处理打开编辑抽屉
  const handleOpenEdit = useCallback(() => {
    setEditDrawerOpen(true);
  }, []);

  // 处理图片变化
  const handleImageChange = useCallback(() => {
    onImageChange?.();
  }, [onImageChange]);

  const handleViewRecentTasks = useCallback(() => {
    onViewRecentTasks?.(sceneIndex);
  }, [onViewRecentTasks, sceneIndex]);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* 左侧：图片区域 */}
          <SceneCardImage
            currentImage={scene.previewArtifactPath}
            sceneAssetImage={scene.sceneAssetImage}
            defaultPrompt={scene.visualPrompt}
            sceneName={scene.location}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onOpenEdit={handleOpenEdit}
            onViewRecentTasks={handleViewRecentTasks}
          />

          {/* 右侧：内容区域 */}
          <SceneCardContent scene={scene} sceneIndex={sceneIndex} />
        </div>
      </Card>

      {/* 编辑抽屉 */}
      <SceneEditDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        scene={scene}
        sceneIndex={sceneIndex}
        owner={owner}
        onImageChange={handleImageChange}
      />
    </>
  );
}
