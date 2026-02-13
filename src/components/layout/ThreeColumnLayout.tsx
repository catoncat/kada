'use client';

import type { ReactNode } from 'react';
import { ResizableSplitPane } from '@/components/layout/ResizableSplitPane';
import { cn } from '@/lib/utils';

export interface ThreeColumnWidthPreset {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  legacyStorageKeys?: readonly string[];
}

interface ThreeColumnLayoutProps {
  preset: ThreeColumnWidthPreset;
  resizeAriaLabel: string;
  list: ReactNode;
  detail: ReactNode;
  className?: string;
  children?: ReactNode;
}

interface ThreeColumnPaneProps {
  children: ReactNode;
  className?: string;
}

interface ThreeColumnDetailPaneProps extends ThreeColumnPaneProps {
  tone?: 'muted' | 'plain';
}

export function ThreeColumnLayout({
  preset,
  resizeAriaLabel,
  list,
  detail,
  className,
  children,
}: ThreeColumnLayoutProps) {
  return (
    <div className={cn('h-full min-h-0 overflow-hidden bg-background', className)}>
      <ResizableSplitPane
        storageKey={preset.storageKey}
        legacyStorageKeys={preset.legacyStorageKeys}
        defaultWidth={preset.defaultWidth}
        minWidth={preset.minWidth}
        maxWidth={preset.maxWidth}
        resizeAriaLabel={resizeAriaLabel}
        left={list}
        right={detail}
        className="h-full"
      />
      {children}
    </div>
  );
}

export function ThreeColumnListPane({ children, className }: ThreeColumnPaneProps) {
  return (
    <aside className={cn('h-full w-full flex min-h-0 flex-col bg-background', className)}>
      {children}
    </aside>
  );
}

export function ThreeColumnDetailPane({
  children,
  className,
  tone = 'muted',
}: ThreeColumnDetailPaneProps) {
  return (
    <main
      className={cn(
        'h-full min-h-0 min-w-0',
        tone === 'muted'
          ? 'bg-[#F5F5F7] dark:bg-[#1C1C1E]'
          : 'bg-background',
        className,
      )}
    >
      {children}
    </main>
  );
}
