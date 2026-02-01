/**
 * 生成按钮组件（Split Button）
 * 主按钮：直接生成
 * 下拉菜单：预览 Prompt / 编辑后生成
 */

'use client';

import { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, Eye, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { previewPrompt } from '@/lib/projects-api';
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
} from '@/components/ui/menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface GenerateButtonProps {
  projectId: string;
  disabled?: boolean;
  isGenerating?: boolean;
  onGenerate: (customPrompt?: string) => void;
}

type ModalMode = 'preview' | 'edit' | null;

export function GenerateButton({
  projectId,
  disabled = false,
  isGenerating = false,
  onGenerate,
}: GenerateButtonProps) {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [promptContent, setPromptContent] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

  // 打开预览/编辑模态框
  const openModal = async (mode: ModalMode) => {
    if (!mode) return;
    setModalMode(mode);
    setIsLoadingPrompt(true);

    try {
      const prompt = await previewPrompt(projectId);
      setPromptContent(prompt);
    } catch (err) {
      alert(err instanceof Error ? err.message : '获取 Prompt 失败');
      setModalMode(null);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // 关闭模态框
  const closeModal = () => {
    setModalMode(null);
    setPromptContent('');
  };

  // 使用编辑后的 prompt 生成
  const handleEditGenerate = () => {
    closeModal();
    onGenerate(promptContent);
  };

  const canGenerate = !disabled && !isGenerating;

  return (
    <>
      {/* Split Button 容器 */}
      <div className="inline-flex">
        {/* 主生成按钮 */}
        <button
          type="button"
          onClick={() => onGenerate()}
          disabled={!canGenerate}
          className={cn(
            'inline-flex items-center gap-2 rounded-l-lg px-5 py-2.5 text-sm font-medium transition border-r border-white/20',
            canGenerate
              ? 'bg-[var(--primary)] text-white hover:opacity-90'
              : 'bg-[var(--paper-2)] text-[var(--ink-3)] cursor-not-allowed'
          )}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isGenerating ? '生成中...' : '生成预案'}
        </button>

        {/* 下拉菜单触发器 */}
        <Menu>
          <MenuTrigger
            disabled={!canGenerate}
            className={cn(
              'inline-flex items-center justify-center rounded-r-lg px-2 py-2.5 text-sm font-medium transition',
              canGenerate
                ? 'bg-[var(--primary)] text-white hover:opacity-90'
                : 'bg-[var(--paper-2)] text-[var(--ink-3)] cursor-not-allowed'
            )}
          >
            <ChevronDown className="w-4 h-4" />
          </MenuTrigger>

          <MenuPopup align="end">
            <MenuItem onClick={() => openModal('preview')}>
              <Eye className="w-4 h-4 mr-2" />
              预览 Prompt
            </MenuItem>
            <MenuItem onClick={() => openModal('edit')}>
              <Edit3 className="w-4 h-4 mr-2" />
              编辑后生成
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      {/* 预览 / 编辑模态框 */}
      <Dialog open={modalMode !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'preview' ? '预览 Prompt' : '编辑 Prompt'}
            </DialogTitle>
            <DialogDescription>
              {modalMode === 'preview'
                ? '以下是将发送给 AI 的完整提示词内容'
                : '你可以编辑提示词内容后生成预案'}
            </DialogDescription>
          </DialogHeader>

          <DialogPanel>
            {isLoadingPrompt ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-3)]" />
              </div>
            ) : modalMode === 'preview' ? (
              <pre className="whitespace-pre-wrap text-sm text-[var(--ink)] bg-[var(--paper-2)] p-4 rounded-lg max-h-96 overflow-y-auto">
                {promptContent}
              </pre>
            ) : (
              <Textarea
                value={promptContent}
                onChange={(e) => setPromptContent(e.target.value)}
                className="min-h-80 font-mono text-sm"
              />
            )}
          </DialogPanel>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              关闭
            </Button>
            {modalMode === 'edit' && (
              <Button onClick={handleEditGenerate}>
                <Sparkles className="w-4 h-4 mr-2" />
                使用此 Prompt 生成
              </Button>
            )}
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
