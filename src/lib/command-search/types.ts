/**
 * Command Search 类型定义
 */

import type { LucideIcon } from 'lucide-react';

/** 搜索项类型 */
export type SearchItemType = 'action' | 'recent' | 'project' | 'scene' | 'navigation';

/** Scope 类型 */
export type SearchScope =
  | { type: 'global' }
  | { type: 'project'; id: string; name: string }
  | { type: 'scenes' };

/** 搜索项动作 */
export type SearchItemAction =
  | { type: 'navigate'; to: string }
  | { type: 'callback'; handler: () => void };

/** 搜索项 */
export interface SearchItem {
  id: string;
  type: SearchItemType;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  keywords?: string[];
  action: SearchItemAction;
}

/** 搜索结果分组 */
export interface SearchResultGroup {
  id: string;
  label: string;
  items: SearchItem[];
}

/** Command Search 上下文状态 */
export interface CommandSearchState {
  open: boolean;
  query: string;
  scope: SearchScope;
}

/** Command Search 上下文方法 */
export interface CommandSearchActions {
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  setScope: (scope: SearchScope) => void;
  clearScope: () => void;
  toggle: () => void;
}

/** Command Search Context 值 */
export interface CommandSearchContextValue extends CommandSearchState, CommandSearchActions {}
