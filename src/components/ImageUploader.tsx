'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { cn } from '@/lib/utils';
import { uploadImage, getImageUrl } from '@/lib/scene-assets-api';

interface ImageUploaderProps {
  /** 当前图片路径 */
  value?: string;
  /** 图片变更回调 */
  onChange: (path: string | undefined) => void;
  /** 占位文字 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

export function ImageUploader({
  value,
  onChange,
  placeholder = '点击或拖拽上传图片',
  className,
  disabled = false,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageUrl = value ? getImageUrl(value) : null;

  const handleUpload = useCallback(async (file: File) => {
    if (disabled) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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
  }, [onChange, disabled]);

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

  // 有图片时的预览模式
  if (value) {
    return (
      <div className={cn('relative group', className)}>
        <PhotoFrame
          src={imageUrl}
          alt="已上传图片"
          className="rounded-xl border border-border"
        >
          {/* 悬浮操作层 */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleClick}
              disabled={disabled || uploading}
              className="p-2 rounded-full bg-popover/90 hover:bg-popover transition"
              title="更换图片"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-foreground" />
              ) : (
                <Upload className="w-5 h-5 text-foreground" />
              )}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="p-2 rounded-full bg-popover/90 hover:bg-popover transition"
              title="删除图片"
            >
              <X className="w-5 h-5 text-destructive" />
            </button>
          </div>
        </PhotoFrame>
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
          'rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
          'aspect-[3/2]',
          'flex flex-col items-center justify-center text-center',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card hover:border-ring/24 hover:bg-accent/30',
          disabled && 'opacity-50 cursor-not-allowed',
          uploading && 'pointer-events-none'
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">上传中...</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{placeholder}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              支持 JPG、PNG、WebP、GIF，最大 10MB
            </p>
          </>
        )}
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

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
