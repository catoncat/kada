'use client';

/**
 * Command Search Provider - 全局状态管理和快捷键监听
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useLocation } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getProject } from '@/lib/projects-api';
import type {
  CommandSearchState,
  CommandSearchContextValue,
  SearchScope,
} from '@/lib/command-search/types';

// Action 类型
type Action =
  | { type: 'SET_OPEN'; open: boolean }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_SCOPE'; scope: SearchScope }
  | { type: 'TOGGLE' }
  | { type: 'RESET' };

// 初始状态
const initialState: CommandSearchState = {
  open: false,
  query: '',
  scope: { type: 'global' },
};

// Reducer
function reducer(state: CommandSearchState, action: Action): CommandSearchState {
  switch (action.type) {
    case 'SET_OPEN':
      if (action.open === state.open) return state;
      return {
        ...state,
        open: action.open,
        // 关闭时清空查询
        query: action.open ? state.query : '',
      };
    case 'SET_QUERY':
      return { ...state, query: action.query };
    case 'SET_SCOPE':
      return { ...state, scope: action.scope };
    case 'TOGGLE':
      return {
        ...state,
        open: !state.open,
        query: state.open ? '' : state.query,
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// Context
const CommandSearchContext = createContext<CommandSearchContextValue | null>(null);

// Provider 组件
interface CommandSearchProviderProps {
  children: ReactNode;
}

export function CommandSearchProvider({ children }: CommandSearchProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const location = useLocation();

  // 从路由计算自动 Scope
  const projectIdMatch = location.pathname.match(/^\/project\/([^/]+)/);
  const projectId = projectIdMatch?.[1];
  const isScenePage = location.pathname.startsWith('/assets/scenes');

  // 获取项目名称（用于 Scope 标签显示）
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // 打开时自动设置 Scope
  useEffect(() => {
    if (state.open) {
      if (projectId && project) {
        dispatch({ type: 'SET_SCOPE', scope: { type: 'project', id: projectId, name: project.title } });
      } else if (isScenePage) {
        dispatch({ type: 'SET_SCOPE', scope: { type: 'scenes' } });
      } else {
        dispatch({ type: 'SET_SCOPE', scope: { type: 'global' } });
      }
    }
  }, [state.open, projectId, project, isScenePage]);

  // 全局快捷键监听 Cmd/Ctrl + K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE' });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Actions
  const setOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_OPEN', open });
  }, []);

  const setQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_QUERY', query });
  }, []);

  const setScope = useCallback((scope: SearchScope) => {
    dispatch({ type: 'SET_SCOPE', scope });
  }, []);

  const clearScope = useCallback(() => {
    dispatch({ type: 'SET_SCOPE', scope: { type: 'global' } });
  }, []);

  const toggle = useCallback(() => {
    dispatch({ type: 'TOGGLE' });
  }, []);

  const value: CommandSearchContextValue = {
    ...state,
    setOpen,
    setQuery,
    setScope,
    clearScope,
    toggle,
  };

  return (
    <CommandSearchContext.Provider value={value}>
      {children}
    </CommandSearchContext.Provider>
  );
}

// Hook
export function useCommandSearchContext() {
  const context = useContext(CommandSearchContext);
  if (!context) {
    throw new Error('useCommandSearchContext must be used within CommandSearchProvider');
  }
  return context;
}
