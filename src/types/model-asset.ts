/**
 * 模特资产类型定义
 */

/** 模特资产 */
export interface ModelAsset {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'other';
  ageRangeMin?: number;
  ageRangeMax?: number;
  description?: string;
  /** 外观提示词（中文） */
  appearancePrompt?: string;
  /** 主参考照片路径 */
  primaryImage?: string;
  /** 辅助参考照片路径数组 */
  referenceImages?: string[];
  /** 标签 */
  tags?: string[];
  /**
   * @deprecated 兼容历史数据字段，不再用于“项目专属”语义。
   */
  projectId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 创建模特资产的输入 */
export interface CreateModelAssetInput {
  name: string;
  gender?: 'male' | 'female' | 'other';
  ageRangeMin?: number;
  ageRangeMax?: number;
  description?: string;
  appearancePrompt?: string;
  primaryImage?: string;
  referenceImages?: string[];
  tags?: string[];
}

/** 更新模特资产的输入 */
export interface UpdateModelAssetInput extends Partial<CreateModelAssetInput> {}

/** API 响应格式 */
export interface ModelAssetListResponse {
  data: ModelAsset[];
  total: number;
}

/** 项目模特配置（存储在 projects.selected_models） */
export interface ProjectModelConfig {
  personModelMap: Record<string, string>;
  autoMatch: boolean;
}

/** 自动匹配结果 */
export interface AutoMatchResult {
  matches: Record<string, Array<{
    modelId: string;
    name: string;
    score: number;
  }>>;
}
