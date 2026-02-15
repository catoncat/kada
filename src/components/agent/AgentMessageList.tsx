import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  formatPayloadForDisplay,
  sanitizeTextForDisplay,
} from '@/lib/agent-display';
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          先输入你的目标，例如“找 3
          个轻法式外景风格并生成首图，再给一版小红书文案”。
        </div>
      ) : null}

      {rows.map((row) => (
        <article
          key={row.id}
          className={cn(
            'rounded-xl border p-3',
            row.role === 'user' ? 'border-primary/30 bg-primary/5' : 'bg-card',
            row.optimistic ? 'opacity-80' : '',
          )}
        >
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{row.role === 'user' ? '你' : '助手'}</span>
            <span>{formatTime(row.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">{row.text}</p>
        </article>
      ))}

      {streamingAssistantText ? (
        <article className="rounded-xl border bg-card p-3">
          <div className="mb-1 text-xs text-muted-foreground">助手（流式）</div>
          <p className="whitespace-pre-wrap break-words text-sm">
            {sanitizeTextForDisplay(streamingAssistantText)}
          </p>
        </article>
      ) : null}
    </div>
  );
}
