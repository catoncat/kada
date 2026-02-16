import { useEffect, useMemo, useRef } from 'react';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import {
  formatPayloadForDisplay,
  sanitizeTextForDisplay,
} from '@/lib/agent-display';
import { cn } from '@/lib/utils';
import type { AgentEntry } from '@/types/agent';

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string | null;
  optimistic?: boolean;
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as Record<string, unknown>;

  if (typeof row.text === 'string' && row.text.trim()) {
    return sanitizeTextForDisplay(row.text.trim());
  }

  if (typeof row.delta === 'string' && row.delta.trim()) {
    return sanitizeTextForDisplay(row.delta.trim());
  }

  if (typeof row.message === 'string' && row.message.trim()) {
    return sanitizeTextForDisplay(row.message.trim());
  }

  return formatPayloadForDisplay(payload);
}

function formatTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AgentMessageList({
  entries,
  streamingAssistantText,
  optimisticUserMessages,
}: {
  entries: AgentEntry[];
  streamingAssistantText: string;
  optimisticUserMessages?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo<MessageRow[]>(() => {
    const persisted = entries
      .filter(
        (entry) =>
          entry.entryType === 'user' || entry.entryType === 'assistant',
      )
      .map((entry): MessageRow => {
        const role: MessageRow['role'] =
          entry.entryType === 'user' ? 'user' : 'assistant';

        return {
          id: entry.id,
          role,
          text: extractText(entry.payload),
          createdAt: entry.createdAt,
        };
      });

    const optimisticRows = (optimisticUserMessages || []).map(
      (item): MessageRow => ({
        id: item.id,
        role: 'user',
        text: sanitizeTextForDisplay(item.text),
        createdAt: item.createdAt,
        optimistic: true,
      }),
    );

    return [...persisted, ...optimisticRows];
  }, [entries, optimisticUserMessages]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4"
    >
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          先输入你的目标，例如“找 3
          个轻法式外景风格并生成首图，再给一版小红书文案”。
        </div>
      ) : null}

      {rows.map((row) => (
        <div
          key={row.id}
          className={cn(
            'flex',
            row.role === 'user' ? 'justify-end' : 'justify-start',
          )}
        >
          {row.role === 'user' ? (
            <article
              className={cn(
                'max-w-[82%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm',
                row.optimistic ? 'opacity-80' : '',
              )}
            >
              <div className="mb-1 text-right text-[11px] text-primary-foreground/70">
                {formatTime(row.createdAt)}
              </div>
              <MarkdownRenderer content={row.text} variant="user" />
            </article>
          ) : (
            <article className="w-full max-w-full">
              <div className="mb-1 text-[11px] text-muted-foreground">
                {formatTime(row.createdAt)}
              </div>
              <MarkdownRenderer content={row.text} variant="assistant" />
            </article>
          )}
        </div>
      ))}

      {streamingAssistantText ? (
        <article className="w-full max-w-full">
          <div className="mb-1 text-[11px] text-muted-foreground">
            助手正在输入...
          </div>
          <MarkdownRenderer
            content={sanitizeTextForDisplay(streamingAssistantText)}
            variant="assistant"
          />
        </article>
      ) : null}
    </div>
  );
}
