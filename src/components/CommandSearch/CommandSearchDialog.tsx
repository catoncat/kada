'use client';

/**
 * Command Search Dialog - 搜索对话框
 */

import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  CornerDownLeft,
  Loader2,
  SearchIcon,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandPanel,
} from '@/components/ui/command';
import { addRecent } from '@/lib/command-search';
import type {
  SearchItem,
  SearchNavigateTarget,
} from '@/lib/command-search/types';
import { openSettingsWindow } from '@/lib/open-settings-window';
import { useCommandSearchContext } from './CommandSearchProvider';
import { useCommandSearch } from './use-command-search';

interface CommandSearchDialogProps {
  onCreateWorkspaceSession: () => void;
  onOpenWorkspace: () => void;
  onCreateProject: () => void;
  onCreateScene: () => void;
}

export function CommandSearchDialog({
  onCreateWorkspaceSession,
  onOpenWorkspace,
  onCreateProject,
  onCreateScene,
}: CommandSearchDialogProps) {
  const navigate = useNavigate();
  const { open, setOpen, query, setQuery, scope, clearScope } =
    useCommandSearchContext();
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

  // 搜索结果
  const results = useCommandSearch({
    query,
    scope,
    onCreateWorkspaceSession: () => {
      setOpen(false);
      onCreateWorkspaceSession();
    },
    onOpenWorkspace: () => {
      setOpen(false);
      onOpenWorkspace();
    },
    onCreateProject: () => {
      setOpen(false);
      onCreateProject();
    },
    onCreateScene: () => {
      setOpen(false);
      onCreateScene();
    },
  });

  // 扁平化所有结果用于键盘导航
  const allItems = results.flatMap((g) => g.items);

  // 每次打开弹窗时重置高亮
  useEffect(() => {
    if (open) {
      setHighlightedIndex(0);
    }
  }, [open]);

  // 打开时聚焦输入框，确保键盘导航立即可用
  useEffect(() => {
    if (!open || !inputEl) return;
    const frame = requestAnimationFrame(() => {
      inputEl.focus();
      inputEl.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, inputEl]);

  const navigateToTarget = useCallback(
    (target: SearchNavigateTarget) => {
      navigate({
        to: target.to as never,
        params: target.params as never,
        search: target.search as never,
      } as never);
    },
    [navigate],
  );

  // 执行搜索项动作
  const executeItem = useCallback(
    (item: SearchItem) => {
      // 记录最近访问
      if (item.type === 'project') {
        const projectId = item.id.replace('project:', '');
        addRecent({ type: 'project', id: projectId, title: item.title });
      } else if (item.type === 'scene') {
        const sceneId = item.id.replace('scene:', '');
        addRecent({ type: 'scene', id: sceneId, title: item.title });
      } else if (item.type === 'model') {
        const modelId = item.id.replace('model:', '');
        addRecent({ type: 'model', id: modelId, title: item.title });
      }

      // 执行动作
      if (item.action.type === 'navigate') {
        setOpen(false);
        const { target } = item.action;
        if (target.to === '/settings') {
          openSettingsWindow(() => navigateToTarget(target));
        } else {
          navigateToTarget(target);
        }
      } else if (item.action.type === 'callback') {
        item.action.handler();
      }
    },
    [navigateToTarget, setOpen],
  );

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;

      // Backspace 删除 scope
      if (e.key === 'Backspace' && query === '' && scope.type !== 'global') {
        e.preventDefault();
        clearScope();
        return;
      }

      // 上下导航
      if (e.key === 'ArrowDown') {
        if (allItems.length === 0) return;
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const normalized = Math.min(prev, allItems.length - 1);
          return Math.min(normalized + 1, allItems.length - 1);
        });
        return;
      }

      if (e.key === 'ArrowUp') {
        if (allItems.length === 0) return;
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const normalized = Math.min(prev, allItems.length - 1);
          return Math.max(normalized - 1, 0);
        });
        return;
      }

      // Enter 选择
      if (e.key === 'Enter') {
        if (allItems.length === 0) return;
        e.preventDefault();
        const normalized = Math.min(highlightedIndex, allItems.length - 1);
        const item = allItems[normalized];
        if (item) {
          executeItem(item);
        }
        return;
      }
    },
    [query, scope, clearScope, allItems, highlightedIndex, executeItem],
  );

  // Scope 标签显示文本
  const scopeLabel =
    scope.type === 'project'
      ? scope.name
      : scope.type === 'assets-scenes'
        ? '场景资产'
        : scope.type === 'assets-models'
          ? '模特资产'
          : null;

  const emptyHint =
    scope.type === 'global'
      ? '试试搜索项目名、场景名、模特名或常用操作'
      : `当前范围（${scopeLabel ?? '限定范围'}）没有匹配结果`;

  const activeHighlightedIndex =
    allItems.length === 0 ? 0 : Math.min(highlightedIndex, allItems.length - 1);

  // 计算每个 item 在 allItems 中的索引
  let itemIndex = 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup className="overflow-hidden">
        {/* 输入区域 */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <SearchIcon className="size-4 shrink-0 opacity-50" />

          {/* Scope 标签 */}
          {scopeLabel && (
            <Badge variant="secondary" className="shrink-0 gap-1 pe-1">
              {scopeLabel}
              <button
                type="button"
                onClick={clearScope}
                className="rounded-sm p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}

          {/* 搜索输入框 */}
          <input
            ref={setInputEl}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              scopeLabel
                ? `在${scopeLabel}中搜索...`
                : '搜索项目、场景、模特、操作...'
            }
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* 结果列表 */}
        <CommandPanel>
          <div className="max-h-80 overflow-y-auto scroll-py-2 p-2">
            {/* 空状态 */}
            {allItems.length === 0 && query.trim() !== '' && (
              <div className="space-y-2 py-6 text-center text-sm text-muted-foreground">
                <div>{emptyHint}</div>
                {scope.type !== 'global' && (
                  <button
                    type="button"
                    onClick={clearScope}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    清除范围并全局搜索
                  </button>
                )}
              </div>
            )}

            {/* 无输入时的提示 */}
            {allItems.length === 0 && query.trim() === '' && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                输入关键词搜索项目、场景或操作
              </div>
            )}

            {/* 结果分组 */}
            {results.map((group) => (
              <div key={group.id} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  <span>{group.label}</span>
                  {group.loading && (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      加载中
                    </span>
                  )}
                </div>
                {group.error && (
                  <div className="mb-1 flex items-center justify-between rounded-md border border-border/80 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                    <span>{group.error.message}</span>
                    {group.error.onAction && (
                      <button
                        type="button"
                        onClick={group.error.onAction}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {group.error.actionLabel || '重试'}
                      </button>
                    )}
                  </div>
                )}
                {group.items.map((item) => {
                  const currentIndex = itemIndex++;
                  const isHighlighted = currentIndex === activeHighlightedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setHighlightedIndex(currentIndex)}
                      className={`flex w-full cursor-default select-none items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none ${
                        isHighlighted
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      <item.icon className="size-4 shrink-0 opacity-60" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.title}</div>
                        {item.subtitle && (
                          <div className="truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="size-3.5 shrink-0 opacity-40" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </CommandPanel>

        {/* 底部快捷键提示 */}
        <CommandFooter>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">
                <CornerDownLeft className="inline-block size-3" />
              </kbd>
              <span>选择</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">
                ↑
              </kbd>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">
                ↓
              </kbd>
              <span>导航</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">
                Esc
              </kbd>
              <span>关闭</span>
            </span>
          </div>
        </CommandFooter>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
