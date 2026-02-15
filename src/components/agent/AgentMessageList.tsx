import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { AgentEntry } from '@/types/agent';

interface MessageRow {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  createdAt: string | null;
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as Record<string, unknown>;

  if (typeof row.text === 'string' && row.text.trim()) {
    return row.text.trim();
  }

  if (typeof row.delta === 'string' && row.delta.trim()) {
    return row.delta.trim();
  }

  if (typeof row.message === 'string' && row.message.trim()) {
    return row.message.trim();
  }

  return JSON.stringify(payload);
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
}: {
  entries: AgentEntry[];
  streamingAssistantText: string;
}) {
  const rows = useMemo(() => {
    return entries
      .filter((entry) =>
        entry.entryType === 'user' ||
        entry.entryType === 'assistant' ||
        entry.entryType === 'toolResult',
      )
      .map((entry): MessageRow => {
        const role: MessageRow['role'] =
          entry.entryType === 'user'
            ? 'user'
            : entry.entryType === 'assistant'
              ? 'assistant'
              : 'tool';

        return {
          id: entry.id,
          role,
          text: extractText(entry.payload),
          createdAt: entry.createdAt,
        };
      });
  }, [entries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          先输入你的目标，例如“找 3 个轻法式外景风格并生成首图，再给一版小红书文案”。
        </div>
      ) : null}

      {rows.map((row) => (
        <article
          key={row.id}
          className={cn(
            'rounded-xl border p-3',
            row.role === 'user'
              ? 'border-primary/30 bg-primary/5'
              : row.role === 'tool'
                ? 'border-amber-300/40 bg-amber-50/60'
                : 'bg-card',
          )}
        >
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {row.role === 'user' ? '你' : row.role === 'assistant' ? '助手' : '工具'}
            </span>
            <span>{formatTime(row.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">{row.text}</p>
        </article>
      ))}

      {streamingAssistantText ? (
        <article className="rounded-xl border bg-card p-3">
          <div className="mb-1 text-xs text-muted-foreground">助手（流式）</div>
          <p className="whitespace-pre-wrap break-words text-sm">{streamingAssistantText}</p>
        </article>
      ) : null}
    </div>
  );
}
