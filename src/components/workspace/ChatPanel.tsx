import { Send, Loader2, MessageSquareQuote } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionCards } from '@/components/workspace/ActionCards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { WorkspaceActionCard, WorkspaceMessage } from '@/types/workspace';

function formatTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatPanel({
  messages,
  onSend,
  sending,
  onApplyCard,
  applyingCardId,
}: {
  messages: WorkspaceMessage[];
  onSend: (text: string) => Promise<void>;
  sending: boolean;
  onApplyCard: (card: WorkspaceActionCard) => void;
  applyingCardId: string | null;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const latestCards = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'assistant' && message.actionCards.length > 0) {
        return message.actionCards;
      }
    }
    return [] as WorkspaceActionCard[];
  }, [messages]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [messages.length]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || sending) return;
    await onSend(text);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <aside className="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">自由 Chat</h3>
          <Badge variant="outline" className="ml-auto">
            建议模式
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          支持输入意图、结合选中节点与 @资产引用生成动作卡。
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            先说你的目标，例如“把 @海边场景 和 @模特A 组成清晨情绪板”。
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                'rounded-xl border p-3',
                message.role === 'user'
                  ? 'border-primary/20 bg-primary/5'
                  : 'bg-card',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {message.role === 'user' ? '你' : '助手'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatTime(message.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
            </article>
          ))
        )}

        {sending ? (
          <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在生成建议...
          </div>
        ) : null}

        <ActionCards
          cards={latestCards}
          onApply={onApplyCard}
          applyingCardId={applyingCardId}
        />
      </div>

      <div className="border-t p-3">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder="输入你的创作意图，回车发送（Shift+Enter 换行）"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">提示：可用 @场景名 / @模特名</p>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={sending || !input.trim()}>
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            发送
          </Button>
        </div>
      </div>
    </aside>
  );
}
