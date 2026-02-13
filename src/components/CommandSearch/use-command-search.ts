/**
 * Command Search 搜索逻辑 Hook
 */

import { useQuery } from '@tanstack/react-query';
import { Clock, FolderKanban, Image } from 'lucide-react';
import { useMemo } from 'react';
import {
  getQuickActions,
  getRecents,
  navigationItems,
  type SearchItem,
  type SearchResultGroup,
  type SearchScope,
} from '@/lib/command-search';
import { getProjects } from '@/lib/projects-api';
import { getSceneAssets } from '@/lib/scene-assets-api';

const MAX_RESULTS_PER_GROUP = 5;

/** 搜索匹配函数 */
function matchesQuery(item: SearchItem, query: string): boolean {
  const q = query.toLowerCase();
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.subtitle?.toLowerCase().includes(q)) return true;
  if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}

interface UseCommandSearchOptions {
  query: string;
  scope: SearchScope;
  onCreateProject: () => void;
  onCreateScene: () => void;
}

export function useCommandSearch({
  query,
  scope,
  onCreateProject,
  onCreateScene,
}: UseCommandSearchOptions): SearchResultGroup[] {
  // 获取项目列表
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    staleTime: 30_000,
  });

  // 获取场景列表
  const { data: scenesData } = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
    staleTime: 30_000,
  });

  const results = useMemo(() => {
    const groups: SearchResultGroup[] = [];
    const trimmedQuery = query.trim();
    const hasQuery = trimmedQuery.length > 0;

    // Quick Actions - 始终显示
    const actions = getQuickActions({ onCreateProject, onCreateScene });
    const filteredActions = hasQuery
      ? actions.filter((a) => matchesQuery(a, trimmedQuery))
      : actions;

    if (filteredActions.length > 0) {
      groups.push({
        id: 'actions',
        label: '快捷操作',
        items: filteredActions.slice(0, MAX_RESULTS_PER_GROUP),
      });
    }

    // Recent - 无输入时显示
    if (!hasQuery) {
      const recents = getRecents();
      if (recents.length > 0) {
        const recentItems: SearchItem[] = recents.map((r) => ({
          id: `recent:${r.type}:${r.id}`,
          type: 'recent' as const,
          title: r.title,
          subtitle: r.type === 'project' ? '项目' : '场景',
          icon: Clock,
          action: {
            type: 'navigate' as const,
            to: r.type === 'project' ? `/?project=${r.id}` : `/assets/scenes`,
          },
        }));

        groups.push({
          id: 'recents',
          label: '最近访问',
          items: recentItems,
        });
      }
    }

    // Projects - 有输入时搜索
    if (hasQuery && scope.type !== 'scenes') {
      const projects = projectsData?.data || [];
      const projectItems: SearchItem[] = projects
        .filter((p) => {
          // Scope 过滤
          if (scope.type === 'project' && p.id !== scope.id) return false;

          // 关键词匹配
          const q = trimmedQuery.toLowerCase();
          return (
            p.title.toLowerCase().includes(q) ||
            (p.customer?.notes?.toLowerCase().includes(q) ?? false)
          );
        })
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((p) => ({
          id: `project:${p.id}`,
          type: 'project' as const,
          title: p.title,
          subtitle:
            p.status === 'generated'
              ? '已生成方案'
              : p.status === 'configured'
                ? '已配置'
                : '草稿',
          icon: FolderKanban,
          action: { type: 'navigate' as const, to: `/?project=${p.id}` },
        }));

      if (projectItems.length > 0) {
        groups.push({
          id: 'projects',
          label: '项目',
          items: projectItems,
        });
      }
    }

    // Scenes - 有输入时搜索
    if (hasQuery && scope.type !== 'project') {
      const scenes = scenesData?.data || [];
      const sceneItems: SearchItem[] = scenes
        .filter((s) => {
          const q = trimmedQuery.toLowerCase();
          return (
            s.name.toLowerCase().includes(q) ||
            (s.description?.toLowerCase().includes(q) ?? false) ||
            (s.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
          );
        })
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((s) => ({
          id: `scene:${s.id}`,
          type: 'scene' as const,
          title: s.name,
          subtitle: s.tags?.slice(0, 2).join(', ') || '场景资产',
          icon: Image,
          action: { type: 'navigate' as const, to: `/assets/scenes` },
        }));

      if (sceneItems.length > 0) {
        groups.push({
          id: 'scenes',
          label: '场景资产',
          items: sceneItems,
        });
      }
    }

    // Navigation - 有输入时显示
    if (hasQuery) {
      const filteredNav = navigationItems.filter((n) =>
        matchesQuery(n, trimmedQuery),
      );

      if (filteredNav.length > 0) {
        groups.push({
          id: 'navigation',
          label: '导航',
          items: filteredNav,
        });
      }
    }

    return groups;
  }, [query, scope, projectsData, scenesData, onCreateProject, onCreateScene]);

  return results;
}
