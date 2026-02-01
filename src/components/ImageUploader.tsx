'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
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
        <div className="relative rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--paper-2)]">
          <img
            src={getImageUrl(value)}
            alt="已上传图片"
            className="w-full h-48 object-cover"
          />
          {/* 悬浮操作层 */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleClick}
              disabled={disabled || uploading}
              className="p-2 rounded-full bg-white/90 hover:bg-white transition"
              title="更换图片"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-2)]" />
              ) : (
                <Upload className="w-5 h-5 text-[var(--ink)]" />
              )}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="p-2 rounded-full bg-white/90 hover:bg-white transition"
              title="删除图片"
            >
              <X className="w-5 h-5 text-red-500" />
            </button>
          </div>
        </div>
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
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
          'flex flex-col items-center justify-center text-center',
          dragOver
            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
            : 'border-[var(--line)] bg-white hover:border-[var(--ink-3)] hover:bg-[var(--paper-2)]',
          disabled && 'opacity-50 cursor-not-allowed',
          uploading && 'pointer-events-none'
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="w-10 h-10 text-[var(--primary)] animate-spin mb-3" />
            <p className="text-sm text-[var(--ink-2)]">上传中...</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-[var(--paper-2)] flex items-center justify-center mb-3">
              <ImageIcon className="w-6 h-6 text-[var(--ink-3)]" />
            </div>
            <p className="text-sm font-medium text-[var(--ink)]">{placeholder}</p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              支持 JPG、PNG、WebP、GIF，最大 10MB
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
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
