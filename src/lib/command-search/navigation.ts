/**
 * Navigation Items 定义
 */

import { FolderKanban, Image, Settings, Users } from 'lucide-react';
import type { SearchItem } from './types';

/** 导航项列表 */
export const navigationItems: SearchItem[] = [
  {
    id: 'nav:projects',
    type: 'navigation',
    title: '项目列表',
    subtitle: '查看和管理项目',
    icon: FolderKanban,
    keywords: ['projects', 'list', 'home', '项目', '列表', '首页'],
    action: { type: 'navigate', target: { to: '/' } },
  },
  {
    id: 'nav:scenes',
    type: 'navigation',
    title: '场景管理',
    subtitle: '管理场景资产',
    icon: Image,
    keywords: ['scenes', 'assets', '场景', '资产'],
    action: { type: 'navigate', target: { to: '/assets/scenes' } },
  },
  {
    id: 'nav:models',
    type: 'navigation',
    title: '模特管理',
    subtitle: '管理模特资产',
    icon: Users,
    keywords: ['models', 'assets', '模特', '人物', '资产'],
    action: { type: 'navigate', target: { to: '/assets/models' } },
  },
  {
    id: 'nav:settings',
    type: 'navigation',
    title: '设置',
    subtitle: '应用配置',
    icon: Settings,
    keywords: ['settings', 'config', '设置', '配置'],
    action: { type: 'navigate', target: { to: '/settings' } },
  },
];
