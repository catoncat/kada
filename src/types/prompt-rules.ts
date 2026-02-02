/**
 * Prompt 编排规则（前端 Settings 管理用）
 * - 规则存储在 Settings（sidecar DB）中
 * - sidecar 负责实际拼接与回显 effectivePrompt（前端只负责展示与编辑规则）
 */

export type PromptOwnerType = 'asset' | 'projectPlanVersion' | 'planScene';

export type PromptRuleKey =
  | 'image-generation:planScene'
  | 'image-generation:asset';

export type PromptBlockKind =
  | 'studioPrompt'
  | 'projectPrompt'
  | 'customerInfo'
  | 'selectedSceneAsset'
  | 'planScene'
  | 'asset'
  | 'draftPrompt'
  | 'editInstruction'
  | 'freeText';

export interface PromptBlockV1 {
  id: string;
  kind: PromptBlockKind;
  label: string;
  enabled: boolean;
  /** 仅 freeText 使用 */
  content?: string;
}

export interface PromptRuleV1 {
  id: string;
  name: string;
  blocks: PromptBlockV1[];
}

export interface PromptRulesV1 {
  version: 1;
  rules: Record<PromptRuleKey, PromptRuleV1>;
}

export const DEFAULT_PROMPT_RULES_V1: PromptRulesV1 = {
  version: 1,
  rules: {
    'image-generation:planScene': {
      id: 'image-generation:planScene:v1',
      name: '场景预览图（项目分镜）',
      blocks: [
        {
          id: 'studio',
          kind: 'studioPrompt',
          label: '全局工作室提示词',
          enabled: true,
        },
        {
          id: 'project',
          kind: 'projectPrompt',
          label: '项目提示词',
          enabled: true,
        },
        {
          id: 'customer',
          kind: 'customerInfo',
          label: '客户信息',
          enabled: true,
        },
        {
          id: 'scene-asset',
          kind: 'selectedSceneAsset',
          label: '已选场景资产',
          enabled: true,
        },
        {
          id: 'plan-scene',
          kind: 'planScene',
          label: '具体分镜场景',
          enabled: true,
        },
        {
          id: 'draft',
          kind: 'draftPrompt',
          label: '用户/分镜提示词（draft）',
          enabled: true,
        },
      ],
    },
    'image-generation:asset': {
      id: 'image-generation:asset:v1',
      name: '资产图片（场景资产）',
      blocks: [
        {
          id: 'studio',
          kind: 'studioPrompt',
          label: '全局工作室提示词',
          enabled: true,
        },
        {
          id: 'asset',
          kind: 'asset',
          label: '资产信息',
          enabled: true,
        },
        {
          id: 'draft',
          kind: 'draftPrompt',
          label: '用户提示词（draft）',
          enabled: true,
        },
      ],
    },
  },
};

