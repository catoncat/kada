/**
 * Command Search 搜索逻辑 Hook
 */

import { useQuery } from '@tanstack/react-query';
import { Clock, FolderKanban, Image, Users } from 'lucide-react';
import { useMemo } from 'react';
import {
  getQuickActions,
  getRecents,
  navigationItems,
  type SearchItem,
  type SearchResultGroup,
  type SearchScope,
} from '@/lib/command-search';
import { getModelAssets } from '@/lib/model-assets-api';
import { getProjects } from '@/lib/projects-api';
import { getSceneAssets } from '@/lib/scene-assets-api';

const MAX_RECENTS = 5;
const MAX_BEST_MATCHES = 3;
const MAX_OBJECT_RESULTS = 8;
const MAX_ACTION_RESULTS = 6;

interface UseCommandSearchOptions {
  query: string;
  scope: SearchScope;
  onCreateWorkspaceSession: () => void;
  onOpenWorkspace: () => void;
  onCreateProject: () => void;
  onCreateScene: () => void;
}

interface ScoredItem {
  item: SearchItem;
  score: number;
}

function extractEntityId(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function canIncludeObject(
  scope: SearchScope,
  type: 'project' | 'scene' | 'model',
) {
  if (scope.type === 'global') return true;
  if (scope.type === 'project') return type === 'project';
  if (scope.type === 'assets-scenes') return type === 'scene';
  if (scope.type === 'assets-models') return type === 'model';
  return true;
}

function canIncludeRecent(
  scope: SearchScope,
  type: 'project' | 'scene' | 'model',
) {
  if (scope.type === 'global') return true;
  if (scope.type === 'project') return type === 'project';
  if (scope.type === 'assets-scenes') return type === 'scene';
  if (scope.type === 'assets-models') return type === 'model';
  return true;
}

function getMatchScore(item: SearchItem, query: string): number {
  const q = query.toLowerCase();
  const title = item.title.toLowerCase();
  const subtitle = item.subtitle?.toLowerCase();
  const keywords = item.keywords?.map((k) => k.toLowerCase()) ?? [];

  if (title === q) return 140;
  if (title.startsWith(q)) return 110;
  if (title.includes(q)) return 80;
  if (subtitle?.startsWith(q)) return 60;
  if (subtitle?.includes(q)) return 50;
  if (keywords.some((k) => k === q)) return 45;
  if (keywords.some((k) => k.includes(q))) return 35;
  return 0;
}

function withScopeBoost(
  item: SearchItem,
  scope: SearchScope,
  score: number,
): number {
  if (scope.type === 'project' && item.type === 'project') {
    return extractEntityId(item.id) === scope.id ? score + 30 : score + 10;
  }

  if (scope.type === 'assets-scenes' && item.type === 'scene') {
    return score + 20;
  }

  if (scope.type === 'assets-models' && item.type === 'model') {
    return score + 20;
  }

  return score;
}

function rankItems(
  items: SearchItem[],
  query: string,
  scope: SearchScope,
): ScoredItem[] {
  return items
    .map((item) => {
      const score = getMatchScore(item, query);
      if (score <= 0) return null;
      return { item, score: withScopeBoost(item, scope, score) };
    })
    .filter((v): v is ScoredItem => Boolean(v))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.title.localeCompare(b.item.title, 'zh-CN');
    });
}

export function useCommandSearch({
  query,
  scope,
  onCreateWorkspaceSession,
  onOpenWorkspace,
  onCreateProject,
  onCreateScene,
}: UseCommandSearchOptions): SearchResultGroup[] {
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    staleTime: 30_000,
  });

  const scenesQuery = useQuery({
    queryKey: ['sceneAssets'],
    queryFn: getSceneAssets,
    staleTime: 30_000,
  });

  const modelsQuery = useQuery({
    queryKey: ['modelAssets'],
    queryFn: getModelAssets,
    staleTime: 30_000,
  });

  const results = useMemo(() => {
    const groups: SearchResultGroup[] = [];
    const trimmedQuery = query.trim();
    const hasQuery = trimmedQuery.length > 0;

    const quickActions = getQuickActions({
      onCreateWorkspaceSession,
      onOpenWorkspace,
      onCreateProject,
      onCreateScene,
    });

    const recentItems: SearchItem[] = getRecents()
      .filter((r) => canIncludeRecent(scope, r.type))
      .slice(0, MAX_RECENTS)
      .map((r) => ({
        id: `recent:${r.type}:${r.id}`,
        type: 'recent',
        title: r.title,
        subtitle:
          r.type === 'project'
            ? '最近项目'
            : r.type === 'scene'
              ? '最近场景'
              : '最近模特',
        icon: Clock,
        action: {
          type: 'navigate',
          target:
            r.type === 'project'
              ? { to: '/', search: { project: r.id } }
              : r.type === 'scene'
                ? { to: '/assets/scenes', search: { sceneId: r.id } }
                : { to: '/assets/models', search: { modelId: r.id } },
        },
      }));

    const projects = (projectsQuery.data?.data || []).map((p) => ({
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
      keywords: [
        p.customer?.notes || '',
        p.status,
        p.projectPrompt || '',
      ].filter(Boolean),
      action: {
        type: 'navigate' as const,
        target: {
          to: '/',
          search: { project: p.id },
        },
      },
    }));

    const scenes = (scenesQuery.data?.data || []).map((s) => ({
      id: `scene:${s.id}`,
      type: 'scene' as const,
      title: s.name,
      subtitle: s.tags?.slice(0, 2).join('，') || '场景资产',
      icon: Image,
      keywords: [
        s.description || '',
        s.defaultLighting || '',
        ...(s.tags || []),
      ].filter(Boolean),
      action: {
        type: 'navigate' as const,
        target: {
          to: '/assets/scenes',
          search: { sceneId: s.id },
        },
      },
    }));

    const models = (modelsQuery.data?.data || []).map((m) => ({
      id: `model:${m.id}`,
      type: 'model' as const,
      title: m.name,
      subtitle:
        m.gender === 'male' ? '男' : m.gender === 'female' ? '女' : '模特资产',
      icon: Users,
      keywords: [
        m.appearancePrompt || '',
        m.gender || '',
        m.gender === 'male'
          ? '男'
          : m.gender === 'female'
            ? '女'
            : m.gender === 'other'
              ? '其他'
              : '',
        m.ageRangeMin != null ? String(m.ageRangeMin) : '',
        m.ageRangeMax != null ? String(m.ageRangeMax) : '',
        m.ageRangeMin != null || m.ageRangeMax != null
          ? `${m.ageRangeMin ?? ''}-${m.ageRangeMax ?? ''}`.replace(
              /^-|-$/g,
              '',
            )
          : '',
      ].filter(Boolean),
      action: {
        type: 'navigate' as const,
        target: {
          to: '/assets/models',
          search: { modelId: m.id },
        },
      },
    }));

    if (!hasQuery) {
      if (recentItems.length > 0) {
        groups.push({
          id: 'recents',
          label: '继续工作',
          items: recentItems,
        });
      }

      groups.push({
        id: 'quick-actions',
        label: '常用操作',
        items: quickActions,
      });

      return groups;
    }

    const objectCandidates: SearchItem[] = [
      ...(canIncludeObject(scope, 'project')
        ? projects.filter((item) =>
            scope.type === 'project'
              ? extractEntityId(item.id) === scope.id
              : true,
          )
        : []),
      ...(canIncludeObject(scope, 'scene') ? scenes : []),
      ...(canIncludeObject(scope, 'model') ? models : []),
    ];

    const scoredObjects = rankItems(objectCandidates, trimmedQuery, scope);
    const bestMatches = scoredObjects
      .slice(0, MAX_BEST_MATCHES)
      .map((entry) => entry.item);
    const remainingObjects = scoredObjects
      .slice(MAX_BEST_MATCHES, MAX_BEST_MATCHES + MAX_OBJECT_RESULTS)
      .map((entry) => entry.item);

    if (bestMatches.length > 0) {
      groups.push({
        id: 'best-matches',
        label: '最佳匹配',
        items: bestMatches,
      });
    }

    const objectErrors: string[] = [];
    const retryActions: Array<() => void> = [];

    if (canIncludeObject(scope, 'project') && projectsQuery.error) {
      objectErrors.push('项目数据加载失败');
      retryActions.push(() => {
        void projectsQuery.refetch();
      });
    }

    if (canIncludeObject(scope, 'scene') && scenesQuery.error) {
      objectErrors.push('场景数据加载失败');
      retryActions.push(() => {
        void scenesQuery.refetch();
      });
    }

    if (canIncludeObject(scope, 'model') && modelsQuery.error) {
      objectErrors.push('模特数据加载失败');
      retryActions.push(() => {
        void modelsQuery.refetch();
      });
    }

    const objectLoading =
      (canIncludeObject(scope, 'project') && projectsQuery.isFetching) ||
      (canIncludeObject(scope, 'scene') && scenesQuery.isFetching) ||
      (canIncludeObject(scope, 'model') && modelsQuery.isFetching);

    if (
      remainingObjects.length > 0 ||
      objectLoading ||
      objectErrors.length > 0
    ) {
      groups.push({
        id: 'objects',
        label: bestMatches.length > 0 ? '更多对象' : '对象结果',
        items: remainingObjects,
        loading: objectLoading,
        error:
          objectErrors.length > 0
            ? {
                message: objectErrors.join('；'),
                actionLabel: '重试',
                onAction: () => {
                  retryActions.forEach((retry) => {
                    retry();
                  });
                },
              }
            : undefined,
      });
    }

    const actionCandidates = [...quickActions, ...navigationItems];
    const actionResults = rankItems(actionCandidates, trimmedQuery, {
      type: 'global',
    })
      .slice(0, MAX_ACTION_RESULTS)
      .map((entry) => entry.item);

    if (actionResults.length > 0) {
      groups.push({
        id: 'actions',
        label: '操作',
        items: actionResults,
      });
    }

    return groups;
  }, [
    modelsQuery.data,
    modelsQuery.error,
    modelsQuery.isFetching,
    modelsQuery.refetch,
    onCreateWorkspaceSession,
    onCreateProject,
    onCreateScene,
    onOpenWorkspace,
    projectsQuery.data,
    projectsQuery.error,
    projectsQuery.isFetching,
    projectsQuery.refetch,
    query,
    scenesQuery.data,
    scenesQuery.error,
    scenesQuery.isFetching,
    scenesQuery.refetch,
    scope,
  ]);

  return results;
}
