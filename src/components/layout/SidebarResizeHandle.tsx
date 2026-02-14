'use client';

import type React from 'react';
import { cn } from '@/lib/utils';

interface SidebarResizeHandleProps {
  width: number;
  minWidth: number;
  maxWidth: number;
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onReset: () => void;
  ariaLabel?: string;
  className?: string;
}

export function SidebarResizeHandle({
  width,
  minWidth,
  maxWidth,
  isDragging,
  onPointerDown,
  onKeyDown,
  onReset,
  ariaLabel = '调整列表宽度',
  className,
}: SidebarResizeHandleProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-description={`当前宽度 ${Math.round(width)} 像素，可在 ${minWidth} 到 ${maxWidth} 之间调整`}
      title="拖拽调整宽度，双击重置"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={cn(
        'absolute inset-y-0 -right-2 z-20 w-4 cursor-col-resize bg-transparent outline-none touch-none',
        'focus-visible:ring-2 focus-visible:ring-ring/40',
        isDragging && 'cursor-col-resize',
        className,
      )}
    />
  );
}
