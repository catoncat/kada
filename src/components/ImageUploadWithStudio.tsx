/**
 * ImageUploadWithStudio
 * 结合了图片上传和 AI 生成功能的组件
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { ImageUploader } from '@/components/ImageUploader';
import { ImageStudioLite } from '@/components/ImageStudioLite';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ArtifactOwnerType } from '@/lib/artifacts-api';

export interface ImageUploadWithStudioProps {
  /** 当前图片路径 */
  value?: string;
  /** 图片变更回调 */
  onChange?: (path: string | undefined) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** AI 生成相关的 owner 信息 */
  owner?: {
    type: ArtifactOwnerType;
    id: string;
    slot?: string;
  };
  /** 默认提示词（用于 AI 生成） */
  defaultPrompt?: string;
  /** 是否显示 AI 生成功能 */
  showAIGenerate?: boolean;
}

export function ImageUploadWithStudio({
  value,
  onChange,
  placeholder = '点击上传图片',
  disabled = false,
  className,
  owner,
  defaultPrompt = '',
  showAIGenerate = true,
}: ImageUploadWithStudioProps) {
  const [showStudio, setShowStudio] = useState(false);

  const handleImageChange = (path: string | null) => {
    onChange?.(path ?? undefined);
    setShowStudio(false);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* 主图片上传区 */}
      <ImageUploader
        value={value || ''}
        onChange={onChange || (() => {})}
        placeholder={placeholder}
        disabled={disabled}
      />

      {/* AI 生成按钮 */}
      {showAIGenerate && owner && !disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowStudio(true)}
        >
          <Sparkles className="size-4 mr-2" />
          AI 生成图片
        </Button>
      )}

      {/* Image Studio Dialog */}
      {owner && (
        <Dialog open={showStudio} onOpenChange={setShowStudio}>
          <DialogContent className="max-w-lg">
            <DialogTitle>AI 图片生成</DialogTitle>
            <ImageStudioLite
              owner={owner}
              currentImagePath={value}
              defaultPrompt={defaultPrompt}
              onImageChange={(filePath) => {
                handleImageChange(filePath);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
