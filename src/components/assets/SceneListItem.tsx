'use client';

import { ImageIcon, MapPin, Sun, Tag, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { getImageUrl } from '@/lib/scene-assets-api';
import { cn } from '@/lib/utils';
import type { SceneAsset } from '@/types/scene-asset';

interface SceneListItemProps {
  scene: SceneAsset;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

export function SceneListItem({
  scene,
  selected,
  onSelect,
  onDelete,
}: SceneListItemProps) {
  const imageUrl = scene.primaryImage ? getImageUrl(scene.primaryImage) : null;
  const tagsSummary = scene.tags?.filter(Boolean).slice(0, 2).join(' · ') || '';

  const content = (
    <>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={scene.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{scene.name}</div>

        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {scene.isOutdoor && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <MapPin className="h-3 w-3" />
              户外
            </span>
          )}

          {scene.defaultLighting && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <Sun className="h-3 w-3 shrink-0" />
              <span className="truncate">{scene.defaultLighting}</span>
            </span>
          )}
        </div>

        {tagsSummary && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate">{tagsSummary}</span>
          </div>
        )}
      </div>
    </>
  );

  if (!onDelete) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
          selected
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50',
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
          selected
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50',
        )}
      >
        {content}
      </ContextMenuTrigger>

      <ContextMenuPopup>
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          删除
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
