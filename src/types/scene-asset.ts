/**
 * 场景资产类型定义
 */

/** 场景风格属性 */
export interface SceneStyle {
  /** 色调 */
  colorTone?: 'warm' | 'cool' | 'neutral';
  /** 光线氛围 */
  lightingMood?: 'soft' | 'dramatic' | 'natural';
  /** 年代感 */
  era?: 'modern' | 'vintage' | 'timeless';
}

/** 场景资产 */
export interface SceneAsset {
  id: string;
  name: string;
  description?: string;
  /** 主图路径 */
  primaryImage?: string;
  /** 默认灯光方案 */
  defaultLighting?: string;
  /** 标签 */
  tags?: string[];
  /** 是否户外场景 */
  isOutdoor?: boolean;
  /** 风格属性 */
  style?: SceneStyle;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 创建场景资产的输入 */
export interface CreateSceneAssetInput {
  name: string;
  description?: string;
  primaryImage?: string;
  defaultLighting?: string;
  tags?: string[];
  isOutdoor?: boolean;
  style?: SceneStyle;
}

/** 更新场景资产的输入 */
export interface UpdateSceneAssetInput extends Partial<CreateSceneAssetInput> {}

/** API 响应格式 */
export interface SceneAssetListResponse {
  data: SceneAsset[];
  total: number;
}
