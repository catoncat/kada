'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

interface UseResizableSidebarWidthOptions {
  storageKey: string;
  legacyStorageKeys?: readonly string[];
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface DragState {
  startX: number;
  startWidth: number;
}

function clampWidth(value: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, value));
}

function readPersistedWidth(
  storageKey: string,
  legacyStorageKeys: readonly string[],
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): number {
  const fallback = clampWidth(defaultWidth, minWidth, maxWidth);
  if (typeof window === 'undefined') return fallback;

  const candidateKeys = [storageKey, ...legacyStorageKeys];
  for (const key of candidateKeys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) continue;

    return clampWidth(parsed, minWidth, maxWidth);
  }

  return fallback;
}

export function useResizableSidebarWidth({
  storageKey,
  legacyStorageKeys = [],
  defaultWidth,
  minWidth,
  maxWidth,
}: UseResizableSidebarWidthOptions) {
  const [width, setWidth] = useState(() =>
    readPersistedWidth(
      storageKey,
      legacyStorageKeys,
      defaultWidth,
      minWidth,
      maxWidth,
    ),
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);

  const setClampedWidth = useCallback(
    (nextWidth: number) => {
      setWidth(clampWidth(nextWidth, minWidth, maxWidth));
    },
    [maxWidth, minWidth],
  );

  const resetWidth = useCallback(() => {
    setClampedWidth(defaultWidth);
  }, [defaultWidth, setClampedWidth]);

  useEffect(() => {
    setWidth(
      readPersistedWidth(
        storageKey,
        legacyStorageKeys,
        defaultWidth,
        minWidth,
        maxWidth,
      ),
    );
  }, [defaultWidth, legacyStorageKeys, maxWidth, minWidth, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, String(Math.round(width)));
  }, [storageKey, width]);

  const endDragging = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const delta = event.clientX - dragState.startX;
      setClampedWidth(dragState.startWidth + delta);
    },
    [setClampedWidth],
  );

  const onPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    endDragging();
  }, [endDragging, onPointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      endDragging();
    };
  }, [endDragging, onPointerMove, onPointerUp]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();

      dragStateRef.current = {
        startX: event.clientX,
        startWidth: width,
      };

      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [onPointerMove, onPointerUp, width],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const STEP = 12;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setClampedWidth(width - STEP);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setClampedWidth(width + STEP);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setClampedWidth(minWidth);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        setClampedWidth(maxWidth);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        resetWidth();
      }
    },
    [maxWidth, minWidth, resetWidth, setClampedWidth, width],
  );

  return {
    width,
    minWidth,
    maxWidth,
    isDragging,
    resetWidth,
    handlePointerDown,
    handleKeyDown,
  };
}
