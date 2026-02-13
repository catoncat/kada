/**
 * 项目类型定义
 */

/** 项目状态 */
export type ProjectStatus = 'draft' | 'configured' | 'generated';

/** 性别 */
export type Gender = 'male' | 'female';

/** 拍摄人物 */
export interface Person {
  id: string;
  /** 角色描述，如"宝宝"、"妈妈"、"爷爷" */
  role: string;
  /** 性别 */
  gender?: Gender;
  /** 年龄（具体数字） */
  age?: number;
}

/** 客户信息 */
export interface CustomerInfo {
  /** 拍摄人物列表 */
  people: Person[];
  /** 备注（可补充关系、特殊需求等） */
  notes?: string;
}

/** 项目 */
export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  /** 项目级提示词（参与所有 AI 能力的上下文拼接，可为空） */
  projectPrompt?: string | null;
  /** 已选场景 ID（MVP 单选） */
  selectedScene?: string;
  /** 客户信息 */
  customer?: CustomerInfo;
  /** 模特配置（JSON 字符串） */
  selectedModels?: string;
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
  projectPrompt?: string | null;
  selectedScene?: string | null;
  customer?: CustomerInfo;
  selectedModels?: string;
  generatedPlan?: unknown;
}

/** API 响应格式 */
export interface ProjectListResponse {
  data: Project[];
  total: number;
}

/** 项目元数据（用于列表展示） */
export interface ProjectMeta {
  /** 方案版本数 */
  planVersionCount?: number;
  /** 当前方案版本号 */
  currentPlanVersion?: number;
  /** 预览图进度 */
  previewProgress?: { done: number; total: number };
  /** 待处理任务数 */
  pendingTasks?: number;
  /** 进行中的任务 */
  runningTask?: {
    id: string;
    type: string;
    progress?: number;
  };
  /** 最后的错误信息 */
  lastError?: {
    type: string;
    message: string;
    taskId?: string;
  };
}

/** 带元数据的项目（列表使用） */
export interface ProjectWithMeta extends Project, ProjectMeta {}

/** 增强版项目列表响应 */
export interface ProjectListWithMetaResponse {
  data: ProjectWithMeta[];
  total: number;
}
