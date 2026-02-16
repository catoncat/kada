import { Loader2, MessageSquareQuote, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ActionCards } from '@/components/workspace/ActionCards';
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
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
      >
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            先说你的目标，例如“把 @海边场景 和 @模特A 组成清晨情绪板”。
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {message.role === 'user' ? (
                <article className="max-w-[82%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm">
                  <div className="mb-1 text-right text-[11px] text-primary-foreground/70">
                    {formatTime(message.createdAt)}
                  </div>
                  <MarkdownRenderer content={message.content} variant="user" />
                </article>
              ) : (
                <article className="w-full max-w-full">
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    {formatTime(message.createdAt)}
                  </div>
                  <MarkdownRenderer
                    content={message.content}
                    variant="assistant"
                  />
                </article>
              )}
            </div>
          ))
        )}

        {sending ? (
          <div className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs text-muted-foreground">
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
          <p className="text-[11px] text-muted-foreground">
            提示：可用 @场景名 / @模特名
          </p>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={sending || !input.trim()}
          >
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
