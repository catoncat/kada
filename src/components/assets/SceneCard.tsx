'use client';

import { Edit2, Trash2, ImageIcon, Sun, MapPin } from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { cn } from '@/lib/utils';
import { getImageUrl } from '@/lib/scene-assets-api';
import type { SceneAsset } from '@/types/scene-asset';

interface SceneCardProps {
  scene: SceneAsset;
  onEdit?: () => void;
  onDelete?: () => void;
  /** 选择模式 */
  selectable?: boolean;
  /** 是否已选中 */
  selected?: boolean;
  /** 选择回调 */
  onSelect?: () => void;
}

export function SceneCard({
  scene,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelect,
}: SceneCardProps) {
  const sceneImageUrl = scene.primaryImage ? getImageUrl(scene.primaryImage) : null;

  const handleClick = () => {
    if (!onSelect) return;
    onSelect();
  };

  const cardClassName = cn(
    'rounded-2xl border bg-card text-card-foreground overflow-hidden transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    selectable && 'cursor-pointer hover:shadow-md hover:border-ring/24',
    selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
  );

  if (selectable) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        className={cn(cardClassName, 'w-full text-left')}
        onClick={handleClick}
      >
        {/* 图片区域 */}
        <PhotoFrame
          src={sceneImageUrl}
          alt={scene.name}
          className="relative"
          fallback={
            <div className="h-full w-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground opacity-50" />
            </div>
          }
        >

          {/* 选中标记 */}
          {selected && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <svg
                aria-hidden="true"
                className="w-4 h-4 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}

          {/* 户外标记 */}
          {scene.isOutdoor && (
            <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-success/90 text-white text-xs font-medium flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              户外
            </div>
          )}
        </PhotoFrame>

        {/* 信息区域 */}
        <div className="p-4">
          <h3 className="text-base font-semibold text-foreground truncate">
            {scene.name}
          </h3>

          {scene.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {scene.description}
            </p>
          )}

          {/* 标签 */}
          {scene.tags && scene.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scene.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {scene.tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs text-muted-foreground">
                  +{scene.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* 灯光信息 */}
          {scene.defaultLighting && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sun className="w-3.5 h-3.5" />
              <span className="truncate">{scene.defaultLighting}</span>
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className={cardClassName}>
      {/* 图片区域 */}
      <PhotoFrame
        src={sceneImageUrl}
        alt={scene.name}
        className="relative"
        fallback={
          <div className="h-full w-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-muted-foreground opacity-50" />
          </div>
        }
      >

        {/* 选中标记 */}
        {selected && (
          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <svg
              aria-hidden="true"
              className="w-4 h-4 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* 户外标记 */}
        {scene.isOutdoor && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-success/90 text-white text-xs font-medium flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            户外
          </div>
        )}
      </PhotoFrame>

      {/* 信息区域 */}
      <div className="p-4">
        <h3 className="text-base font-semibold text-foreground truncate">
          {scene.name}
        </h3>

        {scene.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {scene.description}
          </p>
        )}

        {/* 标签 */}
        {scene.tags && scene.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {scene.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {scene.tags.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                +{scene.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* 灯光信息 */}
        {scene.defaultLighting && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sun className="w-3.5 h-3.5" />
            <span className="truncate">{scene.defaultLighting}</span>
          </div>
        )}

        {/* 操作按钮（非选择模式） */}
        {!selectable && (onEdit || onDelete) && (
          <div className="mt-4 flex items-center gap-2 pt-3 border-t border-border">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-accent transition"
              >
                <Edit2 className="w-4 h-4" />
                编辑
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
