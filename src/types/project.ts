/**
 * 项目类型定义
 */

/** 项目状态 */
export type ProjectStatus = 'draft' | 'configured' | 'generated';

/** 客户类型 */
export type CustomerType = 'child' | 'pregnant' | 'family' | 'parent_child' | 'couple' | 'individual';

/** 年龄范围 */
export type AgeRange = 'infant' | 'toddler' | 'preschool' | 'school_age' | 'teenager' | 'adult';

/** 客户信息 */
export interface CustomerInfo {
  /** 客户类型 */
  type: CustomerType;
  /** 年龄范围 */
  ageRange?: AgeRange;
  /** 人数 */
  count?: number;
  /** 关系描述（如"母女"、"一家四口"） */
  relation?: string;
  /** 特殊备注 */
  notes?: string;
}

/** 拍摄参数 */
export interface ShootingParams {
  /** 焦段 */
  focalLength?: string;
  /** 光比 */
  lightRatio?: string;
  /** 时段 */
  timeOfDay?: string;
  /** 其他参数 */
  [key: string]: string | undefined;
}

/** 项目 */
export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  /** 已选场景 ID（MVP 单选） */
  selectedScene?: string;
  /** 已选服装配置（JSON） */
  selectedOutfits?: string[];
  /** 已选道具 ID 列表 */
  selectedProps?: string[];
  /** 拍摄参数 */
  params?: ShootingParams;
  /** 客户信息 */
  customer?: CustomerInfo;
  /** AI 生成的预案结果 */
  generatedPlan?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 创建项目的输入 */
export interface CreateProjectInput {
  title: string;
}

/** 更新项目的输入 */
export interface UpdateProjectInput {
  title?: string;
  status?: ProjectStatus;
  selectedScene?: string | null;
  selectedOutfits?: string[];
  selectedProps?: string[];
  params?: ShootingParams;
  customer?: CustomerInfo;
  generatedPlan?: unknown;
}

/** API 响应格式 */
export interface ProjectListResponse {
  data: Project[];
  total: number;
}
