'use client';

import { ImageIcon, Loader2, MoreHorizontal, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { PhotoFrame } from '@/components/PhotoFrame';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import {
  PHOTO_RATIO_CLASS,
  type PhotoOrientation,
} from '@/hooks/usePhotoOrientation';
import { getImageUrl, uploadImage } from '@/lib/scene-assets-api';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  /** 当前图片路径 */
  value?: string;
  /** 图片变更回调 */
  onChange: (path: string | undefined) => void;
  /** 占位文字 */
  placeholder?: string;
  /** 紧凑模式（用于窄卡片） */
  compact?: boolean;
  /** 空状态的默认比例 */
  emptyOrientation?: PhotoOrientation;
  /** 次级提示文案；传 false 隐藏 */
  metaText?: string | false;
  /** 自定义类名 */
  className?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

export function ImageUploader({
  value,
  onChange,
  placeholder = '点击或拖拽上传图片',
  compact = false,
  emptyOrientation = 'landscape',
  metaText = false,
  className,
  disabled = false,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageUrl = value ? getImageUrl(value) : null;

  const handleUpload = useCallback(
    async (file: File) => {
      if (disabled) return;

      // 验证文件类型
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      if (!allowedTypes.includes(file.type)) {
        setError('不支持的图片格式，请使用 JPG/PNG/WebP/GIF');
        return;
      }

      // 验证文件大小（最大 10MB）
      if (file.size > 10 * 1024 * 1024) {
        setError('图片大小不能超过 10MB');
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const result = await uploadImage(file);
        onChange(result.path);
      } catch (err) {
        setError(err instanceof Error ? err.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [onChange, disabled],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // 清空 input 以允许重复选择同一文件
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleRemove = () => {
    onChange(undefined);
    setError(null);
  };

  const handleClick = () => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || uploading) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleReplaceFromMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick();
  };

  const handleRemoveFromMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleRemove();
  };

  // 有图片时的预览模式
  if (value) {
    return (
      <div className={cn('relative group', className)}>
        <ContextMenu>
          <ContextMenuTrigger
            className={cn(
              'group relative block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              disabled && 'cursor-not-allowed opacity-70',
            )}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={handleClick}
            onKeyDown={handleCardKeyDown}
            aria-label="更换图片"
          >
            <PhotoFrame
              src={imageUrl}
              alt="已上传图片"
              forcedOrientation={emptyOrientation}
              className="rounded-xl border border-input/70 bg-muted/35"
            >
              <Menu>
                <MenuTrigger
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  disabled={disabled || uploading}
                  aria-label="图片操作"
                  className={cn(
                    'absolute top-1.5 right-1.5 z-10 rounded-md border border-white/15 bg-black/50 p-1 text-white/85 opacity-0 transition',
                    'group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100',
                    'hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    (disabled || uploading) && 'pointer-events-none opacity-0',
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </MenuTrigger>
                <MenuPopup align="end" sideOffset={6}>
                  <MenuItem
                    disabled={disabled || uploading}
                    onClick={handleReplaceFromMenu}
                  >
                    <Upload className="h-4 w-4" />
                    更换图片...
                  </MenuItem>
                  <MenuItem
                    variant="destructive"
                    disabled={disabled || uploading}
                    onClick={handleRemoveFromMenu}
                  >
                    <X className="h-4 w-4" />
                    删除图片
                  </MenuItem>
                </MenuPopup>
              </Menu>

              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </PhotoFrame>
          </ContextMenuTrigger>
          <ContextMenuPopup>
            <ContextMenuItem
              disabled={disabled || uploading}
              onClick={handleReplaceFromMenu}
            >
              <Upload className="h-4 w-4" />
              更换图片...
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={disabled || uploading}
              onClick={handleRemoveFromMenu}
            >
              <X className="h-4 w-4" />
              删除图片
            </ContextMenuItem>
          </ContextMenuPopup>
        </ContextMenu>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  // 无图片时的上传区域
  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={disabled || uploading}
        className={cn(
          'rounded-xl border border-dashed transition-colors cursor-pointer',
          PHOTO_RATIO_CLASS[emptyOrientation],
          compact ? 'p-4' : 'p-8',
          'flex flex-col items-center justify-center text-center',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-input/70 bg-muted/35 hover:border-ring/30 hover:bg-muted/55',
          disabled && 'opacity-50 cursor-not-allowed',
          uploading && 'pointer-events-none',
        )}
      >
        {uploading ? (
          <>
            <Loader2
              className={cn(
                'text-primary animate-spin',
                compact ? 'mb-2 h-7 w-7' : 'mb-3 h-10 w-10',
              )}
            />
            <p className="text-sm text-muted-foreground">上传中...</p>
          </>
        ) : (
          <>
            <div
              className={cn(
                'rounded-full bg-muted flex items-center justify-center',
                compact ? 'mb-2 h-10 w-10' : 'mb-3 h-12 w-12',
              )}
            >
              <ImageIcon
                className={cn(
                  'text-muted-foreground',
                  compact ? 'h-5 w-5' : 'h-6 w-6',
                )}
              />
            </div>
            <p
              className={cn(
                'font-medium text-foreground',
                compact ? 'text-sm leading-tight' : 'text-sm',
              )}
            >
              {placeholder}
            </p>
            {metaText && (
              <p
                className={cn(
                  'mt-1 text-muted-foreground',
                  compact ? 'text-[11px] leading-4' : 'text-xs',
                )}
              >
                {metaText}
              </p>
            )}
          </>
        )}
      </button>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
