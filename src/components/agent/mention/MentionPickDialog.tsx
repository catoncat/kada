import { Check, Loader2, RefreshCcw } from 'lucide-react';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { getImageUrl } from '@/lib/scene-assets-api';
import { cn } from '@/lib/utils';
import type { AgentMention, AgentMentionImageRef } from '@/types/agent';
import { AGENT_MENTION_KIND_LABEL } from './mention-utils';

interface MentionPickDialogProps {
  open: boolean;
  target: AgentMention | null;
  items: AgentMentionImageRef[];
  loading: boolean;
  error: string | null;
  selectedIds: Set<string>;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onToggle: (id: string) => void;
  onClear: () => void;
  onInvert: () => void;
  onConfirm: () => void;
}

export function MentionPickDialog({
  open,
  target,
  items,
  loading,
  error,
  selectedIds,
  onOpenChange,
  onRetry,
  onToggle,
  onClear,
  onInvert,
  onConfirm,
}: MentionPickDialogProps) {
  const selectedCount = selectedIds.size;
  const kindText = target ? AGENT_MENTION_KIND_LABEL[target.kind] : '资源';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="w-full max-w-4xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>选择图片</DialogTitle>
          <DialogDescription>
            {target
              ? `当前引用：${kindText}「${target.resourceTitle}」`
              : '请选择要绑定到引用的图片'}
            {' · '}
            快捷键：Alt+Enter（候选中=手动挑图，输入框中=打开待补图引用）
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              已选择 {selectedCount} / {items.length}
            </div>
            <div className="flex items-center gap-2">
              <Button size="xs" variant="outline" onClick={onInvert}>
                反选
              </Button>
              <Button size="xs" variant="outline" onClick={onClear}>
                清空
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载可选图片...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              该资源暂无可选图片，可直接仅引用资源发送。
            </div>
          ) : null}

          {!loading && !error && items.length > 0 ? (
            <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const checked = selectedIds.has(item.id);
                const label = item.label || item.filePath;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'group relative overflow-hidden rounded-lg border text-left transition',
                      checked
                        ? 'border-primary ring-1 ring-primary/40'
                        : 'border-border hover:border-primary/40',
                    )}
                    onClick={() => onToggle(item.id)}
                  >
                    <PhotoFrame
                      src={getImageUrl(item.filePath)}
                      alt={label}
                      className="aspect-square w-full bg-muted"
                      imgClassName="transition group-hover:scale-[1.02]"
                    />
                    <div className="space-y-1 border-t px-2 py-1.5">
                      <p className="line-clamp-1 text-[11px] font-medium">{label}</p>
                      <p className="line-clamp-1 text-[10px] text-muted-foreground">
                        {item.filePath}
                      </p>
                    </div>
                    {checked ? (
                      <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={onConfirm}>
            应用选择
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
