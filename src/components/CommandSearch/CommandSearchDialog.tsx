'use client';

/**
 * Command Search Dialog - 搜索对话框
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X, SearchIcon, ArrowRight, CornerDownLeft } from 'lucide-react';
import {
  CommandDialog,
  CommandDialogPopup,
  CommandPanel,
  CommandFooter,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useCommandSearchContext } from './CommandSearchProvider';
import { useCommandSearch } from './use-command-search';
import { addRecent } from '@/lib/command-search';
import { openSettingsWindow } from '@/lib/open-settings-window';
import type { SearchItem } from '@/lib/command-search/types';

interface CommandSearchDialogProps {
  onCreateProject: () => void;
  onCreateScene: () => void;
}

export function CommandSearchDialog({
  onCreateProject,
  onCreateScene,
}: CommandSearchDialogProps) {
  const navigate = useNavigate();
  const { open, setOpen, query, setQuery, scope, clearScope } = useCommandSearchContext();
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // 搜索结果
  const results = useCommandSearch({
    query,
    scope,
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

  // 重置高亮索引当结果变化时
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, results.length]);

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
      }

      // 执行动作
      if (item.action.type === 'navigate') {
        setOpen(false);
        const { to } = item.action;
        if (to === '/settings') {
          openSettingsWindow(() => navigate({ to }));
        } else {
          navigate({ to });
        }
      } else if (item.action.type === 'callback') {
        item.action.handler();
      }
    },
    [navigate, setOpen]
  );

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Backspace 删除 scope
      if (e.key === 'Backspace' && query === '' && scope.type !== 'global') {
        e.preventDefault();
        clearScope();
        return;
      }

      // 上下导航
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      // Enter 选择
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = allItems[highlightedIndex];
        if (item) {
          executeItem(item);
        }
        return;
      }
    },
    [query, scope, clearScope, allItems, highlightedIndex, executeItem]
  );

  // Scope 标签显示文本
  const scopeLabel = scope.type === 'project' ? scope.name : scope.type === 'scenes' ? '场景资产' : null;

  // 计算每个 item 在 allItems 中的索引
  let itemIndex = 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup className="overflow-hidden">
        {/* 输入区域 */}
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          onKeyDown={handleKeyDown}
        >
          <SearchIcon className="size-4 shrink-0 opacity-50" />

          {/* Scope 标签 */}
          {scopeLabel && (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1 pe-1"
            >
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
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={scopeLabel ? '搜索...' : '搜索项目、场景、操作...'}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* 结果列表 */}
        <CommandPanel>
          <div className="max-h-80 overflow-y-auto scroll-py-2 p-2">
            {/* 空状态 */}
            {allItems.length === 0 && query.trim() !== '' && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                没有找到匹配结果
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
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const currentIndex = itemIndex++;
                  const isHighlighted = currentIndex === highlightedIndex;

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
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">↑</kbd>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">↓</kbd>
              <span>导航</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs font-medium">Esc</kbd>
              <span>关闭</span>
            </span>
          </div>
        </CommandFooter>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
