/**
 * Quick Actions 定义
 */

import { Plus, Settings, Image } from 'lucide-react';
import type { SearchItem } from './types';

/** 创建 Quick Actions 列表 */
export function getQuickActions(callbacks: {
  onCreateProject: () => void;
  onCreateScene: () => void;
}): SearchItem[] {
  return [
    {
      id: 'action:create-project',
      type: 'action',
      title: '新建项目',
      subtitle: '创建新的拍摄项目',
      icon: Plus,
      keywords: ['new', 'project', 'create', '项目', '新建', '创建'],
      action: { type: 'callback', handler: callbacks.onCreateProject },
    },
    {
      id: 'action:create-scene',
      type: 'action',
      title: '新建场景',
      subtitle: '添加新的场景资产',
      icon: Image,
      keywords: ['new', 'scene', 'create', '场景', '新建', '创建'],
      action: { type: 'callback', handler: callbacks.onCreateScene },
    },
    {
      id: 'action:open-settings',
      type: 'action',
      title: '打开设置',
      subtitle: '配置应用设置',
      icon: Settings,
      keywords: ['settings', 'preferences', 'config', '设置', '配置'],
      action: { type: 'navigate', to: '/settings' },
    },
  ];
}
