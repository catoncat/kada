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

/** 结果页模式 */
export type ResultMode = 'plan' | 'execute' | 'review';

/** 场景执行状态 */
export type SceneExecutionState =
  | 'not_confirmed'
  | 'not_generated'
  | 'running'
  | 'failed'
  | 'needs_info'
  | 'generated_pending_review'
  | 'passed';

/** 验收规则状态 */
export type AcceptanceRuleStatus = 'pass' | 'fail' | 'unknown';

/** 验收规则项 */
export interface AcceptanceRuleResult {
  key: 'people' | 'identity' | 'aspectRatio' | 'singleFrame' | 'constraints';
  label: string;
  status: AcceptanceRuleStatus;
  reason: string;
}

/** 场景验收结果 */
export interface AcceptanceResult {
  overall: AcceptanceRuleStatus;
  passCount: number;
  failCount: number;
  unknownCount: number;
  rules: AcceptanceRuleResult[];
}

/** 场景任务轨道 */
export interface SceneTaskTrack {
  sceneIndex: number;
  taskId: string | null;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  createdAt?: string | null;
  updatedAt?: string | null;
  error: string | null;
}

/** 执行清单快照 */
export interface ExecutionChecklistSnapshot {
  projectId: string;
  sceneIndex: number;
  planFingerprint: string;
  lockedAspectRatio: string;
  expectedPeopleCount: number;
  strategyVersion: string;
  checks: {
    sceneReferenceReady: boolean;
    identityCollageReady: boolean;
    identityMappingComplete: boolean;
    aspectRatioLocked: boolean;
    singleFrameDeclared: boolean;
  };
  allPassed: boolean;
  confirmedAt: number | null;
  updatedAt: number;
}
