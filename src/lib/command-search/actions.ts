/**
 * Quick Actions 定义
 */

import { Blocks, Image, Plus } from 'lucide-react';
import type { SearchItem } from './types';

/** 创建 Quick Actions 列表 */
export function getQuickActions(callbacks: {
  onCreateWorkspaceSession: () => void;
  onOpenWorkspace: () => void;
  onCreateProject: () => void;
  onCreateScene: () => void;
}): SearchItem[] {
  return [
    {
      id: 'action:create-workspace-session',
      type: 'action',
      title: '新建工作台会话',
      subtitle: '创建一个新的 Agent 会话',
      icon: Plus,
      keywords: ['workspace', 'session', 'new', 'create', '工作台', '会话', '新建'],
      action: { type: 'callback', handler: callbacks.onCreateWorkspaceSession },
    },
    {
      id: 'action:open-workspace',
      type: 'action',
      title: '打开工作台',
      subtitle: '进入 Agent 工作台',
      icon: Blocks,
      keywords: ['workspace', 'agent', 'chat', '工作台', '智能体'],
      action: { type: 'callback', handler: callbacks.onOpenWorkspace },
    },
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
  ];
}
