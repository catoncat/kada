/**
 * 设置类型定义
 */

/** 业务类型 */
export type BusinessType = 'consumer_studio' | 'commercial' | 'artistic';

/** 工作室配置 */
export interface StudioProfile {
  /** 业务类型 */
  businessType: BusinessType;
  /** 目标客户群 */
  targetCustomers: string[];
  /** 拍摄风格描述 */
  shootingStyle?: string;
  /** 自定义 prompt 前缀 */
  promptPrefix?: string;
}

/** 设置键常量 */
export const SETTINGS_KEYS = {
  STUDIO_PROFILE: 'studio_profile',
} as const;
