/**
 * 生成按钮组件（单主路径）
 */

'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerateButtonProps {
  projectId: string;
  disabled?: boolean;
  isGenerating?: boolean;
  onGenerate: () => void;
}

export function GenerateButton({
  disabled = false,
  isGenerating = false,
  onGenerate,
}: GenerateButtonProps) {
  const canGenerate = !disabled && !isGenerating;

  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={!canGenerate}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition',
        canGenerate
          ? 'bg-primary text-primary-foreground hover:opacity-90'
          : 'bg-muted text-muted-foreground cursor-not-allowed',
      )}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {isGenerating ? '生成中...' : '生成方案'}
    </button>
  );
}
