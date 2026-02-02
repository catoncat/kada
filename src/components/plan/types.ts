/**
 * Plan Result 页面相关类型定义
 */

import type { ArtifactOwnerType } from '@/lib/artifacts-api';

/** 生成的场景 */
export interface GeneratedScene {
  location: string;
  description: string;
  shots: string;
  lighting: string;
  visualPrompt: string;
  sceneAssetId?: string;
  sceneAssetImage?: string;
  generatedImage?: string; // base64 图片（过渡态）
  previewArtifactPath?: string; // 落盘后的图片路径
}

/** 生成的预案 */
export interface GeneratedPlan {
  title: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: GeneratedScene[];
}

/** SceneCard 组件的 owner 配置 */
export interface SceneOwner {
  type: ArtifactOwnerType;
  id: string;
  slot: string;
}

/** 预览进度 */
export interface PreviewProgress {
  done: number;
  total: number;
}
