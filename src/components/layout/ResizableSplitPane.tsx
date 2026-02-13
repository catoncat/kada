'use client';

import type { ReactNode } from 'react';
import { SidebarResizeHandle } from '@/components/layout/SidebarResizeHandle';
import { useResizableSidebarWidth } from '@/hooks/use-resizable-sidebar-width';
import { cn } from '@/lib/utils';

interface ResizableSplitPaneProps {
  storageKey: string;
  legacyStorageKeys?: readonly string[];
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  resizeAriaLabel: string;
  left: ReactNode;
  right: ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
}

export function ResizableSplitPane({
  storageKey,
  legacyStorageKeys,
  defaultWidth,
  minWidth,
  maxWidth,
  resizeAriaLabel,
  left,
  right,
  className,
  leftClassName,
  rightClassName,
}: ResizableSplitPaneProps) {
  const pane = useResizableSidebarWidth({
    storageKey,
    legacyStorageKeys,
    defaultWidth,
    minWidth,
    maxWidth,
  });

  return (
    <div className={cn('flex h-full min-h-0 overflow-hidden', className)}>
      <div className={cn('relative shrink-0', leftClassName)} style={{ width: pane.width }}>
        <div className="h-full min-h-0 w-full">{left}</div>
        <SidebarResizeHandle
          width={pane.width}
          minWidth={pane.minWidth}
          maxWidth={pane.maxWidth}
          isDragging={pane.isDragging}
          onPointerDown={pane.handlePointerDown}
          onKeyDown={pane.handleKeyDown}
          onReset={pane.resetWidth}
          ariaLabel={resizeAriaLabel}
        />
      </div>

      <div className={cn('min-h-0 min-w-0 flex-1', rightClassName)}>{right}</div>
    </div>
  );
}
