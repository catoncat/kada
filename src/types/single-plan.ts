import type { ShootingPlan } from '@/lib/ppt-exporter';

// 扩展接口以支持历史记录和生图提示词
export interface ExtendedShootingPlan extends ShootingPlan {
  id: string;
  createdAt: number;
  scenes: {
    location: string;
    description: string;
    shots: string;
    visualPrompt: string; // 由 Gemini 生成的英文生图提示词
  }[];
}
