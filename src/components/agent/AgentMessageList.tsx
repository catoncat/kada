import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildAgentMessageRows,
  type AgentMessageListRow,
  type StreamingInsertion,
} from '@/components/agent/agent-message-view-model';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { sanitizeTextForDisplay } from '@/lib/agent-display';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentEntry, AgentTurnEvent } from '@/types/agent';

const AUTO_SCROLL_THRESHOLD = 72;

interface StreamingToolRow {
  id: string;
  text: string;
  status: 'running' | 'completed' | 'error' | 'info';
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

function isNearBottom(element: HTMLDivElement): boolean {
  const remaining =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  return remaining <= AUTO_SCROLL_THRESHOLD;
}

function scrollToBottom(element: HTMLDivElement) {
  element.scrollTop = element.scrollHeight;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function shortId(value: string): string {
  if (value.length <= 10) return value;
  return value.slice(0, 8);
}

function toInlineText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

function buildStreamingToolRows(
  events: AgentTurnEvent[],
  streaming: boolean,
): StreamingToolRow[] {
  if (!streaming) return [];

  let startIndex = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'turn.started') {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return [];

  const activeTurnId = events[startIndex].turnId;
  const rows: StreamingToolRow[] = [];

  for (let i = startIndex + 1; i < events.length; i += 1) {
    const event = events[i];
    if (activeTurnId && event.turnId && event.turnId !== activeTurnId) {
      continue;
    }

    const payload = toRecord(event.payload);
    const id = `${event.timestamp}:${event.type}:${i}`;

    if (event.type === 'tool.call') {
      const tool = toInlineText(payload.toolName) || 'tool';
      rows.push({ id, text: tool, status: 'running' });
      continue;
    }

    if (event.type === 'tool.progress') {
      const text =
        toInlineText(payload.message) ||
        toInlineText(payload.status) ||
        toInlineText(payload.toolName);
      if (text) rows.push({ id, text, status: 'info' });
      continue;
    }

    if (event.type === 'tool.result') {
      const summary = toInlineText(payload.summary);
      const tool = toInlineText(payload.toolName) || 'tool';
      rows.push({
        id,
        text: summary || tool,
        status: payload.isError ? 'error' : 'completed',
      });
      continue;
    }

    if (event.type === 'photo.task.created' || event.type === 'photo.task.updated') {
      const status = toInlineText(payload.status);
      const taskId = toInlineText(payload.taskId);
      const line = [status, taskId ? shortId(taskId) : ''].filter(Boolean).join(' ');
      if (line) rows.push({ id, text: line, status: 'info' });
      continue;
    }

    if (event.type === 'photo.ready') {
      rows.push({ id, text: 'photo ✓', status: 'completed' });
      continue;
    }

    if (event.type === 'copy.ready') {
      rows.push({ id, text: 'copy ✓', status: 'completed' });
    }
  }

  return rows.slice(-20);
}

function statusDotClass(status: StreamingToolRow['status']): string {
  if (status === 'completed') return 'bg-emerald-500/75';
  if (status === 'error') return 'bg-destructive/75';
  if (status === 'running') return 'bg-amber-500/75';
  return 'bg-muted-foreground/65';
}

function renderSummaryRow(row: Extract<AgentMessageListRow, { kind: 'summary' }>) {
  const compact = row.category === 'tool';

  return (
    <article
      key={row.id}
      className={cn(
        compact
          ? 'rounded-md border px-2 py-1.5 text-[11px]'
          : 'rounded-lg border px-3 py-2 text-xs',
        row.level === 'error'
          ? 'border-destructive/45 bg-destructive/5'
          : 'border-border/60 bg-muted/15',
      )}
    >
      <details>
        <summary
          className={cn(
            'cursor-pointer list-none text-muted-foreground',
            compact ? 'flex items-center gap-2' : '',
          )}
        >
          {compact ? (
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                row.level === 'error'
                  ? 'bg-destructive/75'
                  : 'bg-muted-foreground/65',
              )}
            />
          ) : null}
          <span className={cn(compact ? 'truncate text-foreground/90' : 'font-medium text-foreground')}>
            {row.title}
          </span>
          {row.createdAt ? (
            <span className={cn(compact ? 'ml-auto text-[10px]' : 'ml-2 text-[11px]')}>
              {formatTime(row.createdAt)}
            </span>
          ) : null}
        </summary>
        <pre
          className={cn(
            'whitespace-pre-wrap break-words rounded-md border bg-background/65 text-muted-foreground',
            compact
              ? 'mt-1 border-border/40 p-1.5 text-[10px]'
              : 'mt-2 p-2 text-[11px]',
          )}
        >
          {row.detail}
        </pre>
      </details>
    </article>
  );
}

function renderMessageRow(
  row: Extract<AgentMessageListRow, { kind: 'message' }>,
  options?: {
    copiedRowId?: string | null;
    onCopyAssistantMessage?: (rowId: string, text: string) => void;
  },
) {
  return (
    <div
      key={row.id}
      className={cn('flex', row.role === 'user' ? 'justify-end' : 'justify-start')}
    >
      {row.role === 'user' ? (
        <article
          className={cn(
            'max-w-[76%] rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-foreground',
            row.optimistic ? 'opacity-80' : '',
          )}
        >
          <div className="mb-0.5 text-right text-[10px] leading-none text-muted-foreground/80">
            {formatTime(row.createdAt)}
          </div>
          <MarkdownRenderer content={row.text} variant="user" />
        </article>
      ) : (
        <article className="group w-full max-w-[min(100%,78ch)]">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{formatTime(row.createdAt)}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              title="复制这条回复"
              aria-label="复制这条回复"
              onClick={() => options?.onCopyAssistantMessage?.(row.id, row.text)}
            >
              {options?.copiedRowId === row.id ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <MarkdownRenderer content={row.text} variant="assistant" />
        </article>
      )}
    </div>
  );
}

export function AgentMessageList({
  entries,
  streamingAssistantText,
  optimisticUserMessages,
  streamingInsertions,
  events,
  streaming,
}: {
  entries: AgentEntry[];
  streamingAssistantText: string;
  optimisticUserMessages?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  streamingInsertions?: StreamingInsertion[];
  events?: AgentTurnEvent[];
  streaming?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentVersionRef = useRef('');
  const [nearBottom, setNearBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [thinkingFrame, setThinkingFrame] = useState(0);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return buildAgentMessageRows({
      entries,
      optimisticUserMessages,
    });
  }, [entries, optimisticUserMessages]);

  const streamBlocks = useMemo(() => {
    const text = streamingAssistantText || '';
    const insertions = [...(streamingInsertions || [])].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.seq - b.seq;
    });

    if (!text && insertions.length === 0) return [];

    const blocks: Array<
      | { id: string; type: 'assistant'; text: string }
      | { id: string; type: 'user'; text: string; createdAt?: string }
    > = [];

    let cursor = 0;
    const textLength = text.length;

    for (const item of insertions) {
      const pos = Math.max(0, Math.min(item.position, textLength));
      if (pos > cursor) {
        const slice = sanitizeTextForDisplay(text.slice(cursor, pos));
        if (slice.trim()) {
          blocks.push({
            id: `assistant-${cursor}-${pos}`,
            type: 'assistant',
            text: slice,
          });
        }
      }

      blocks.push({
        id: `insert-${item.id}`,
        type: 'user',
        text: sanitizeTextForDisplay(item.text),
        createdAt: item.createdAt,
      });

      cursor = pos;
    }

    if (cursor < textLength) {
      const tail = sanitizeTextForDisplay(text.slice(cursor));
      if (tail.trim()) {
        blocks.push({
          id: `assistant-${cursor}-${textLength}`,
          type: 'assistant',
          text: tail,
        });
      }
    }

    if (blocks.length === 0 && text) {
      blocks.push({
        id: 'assistant-full',
        type: 'assistant',
        text: sanitizeTextForDisplay(text),
      });
    }

    return blocks;
  }, [streamingAssistantText, streamingInsertions]);
  const firstStreamingAssistantIndex = useMemo(
    () => streamBlocks.findIndex((block) => block.type === 'assistant'),
    [streamBlocks],
  );
  const shouldShowThinking =
    Boolean(streaming) &&
    !streamingAssistantText.trim() &&
    streamBlocks.every((block) => block.type !== 'assistant');
  const thinkingText = `Thinking${'.'.repeat((thinkingFrame % 3) + 1)}`;

  const streamingToolRows = useMemo(
    () => buildStreamingToolRows(events || [], Boolean(streaming)),
    [events, streaming],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onScroll = () => {
      const nextNearBottom = isNearBottom(element);
      setNearBottom(nextNearBottom);
      if (nextNearBottom) {
        setShowScrollToBottom(false);
      }
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      element.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!shouldShowThinking) {
      setThinkingFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setThinkingFrame((prev) => (prev + 1) % 3);
    }, 420);

    return () => {
      window.clearInterval(timer);
    };
  }, [shouldShowThinking]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const contentVersion = `${rows.length}:${streamBlocks.length}:${streamingAssistantText.length}:${streamingToolRows.length}:${streaming ? 1 : 0}`;
    if (contentVersion === contentVersionRef.current) return;
    contentVersionRef.current = contentVersion;

    if (nearBottom) {
      scrollToBottom(element);
      setShowScrollToBottom(false);
      return;
    }

    setShowScrollToBottom(true);
  }, [
    nearBottom,
    rows.length,
    streamBlocks.length,
    streamingAssistantText.length,
    streamingToolRows.length,
    streaming,
  ]);

  const handleScrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollToBottom(scrollRef.current);
    setNearBottom(true);
    setShowScrollToBottom(false);
  };

  const handleCopyAssistantMessage = (rowId: string, text: string) => {
    if (!text.trim()) return;
    void copyToClipboard(text)
      .then(() => {
        setCopiedRowId(rowId);
        window.setTimeout(() => {
          setCopiedRowId((prev) => (prev === rowId ? null : prev));
        }, 1200);
      })
      .catch(() => {
        // ignore copy failure in message list UI
      });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="agent-message-scroll"
        className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-3 py-4"
      >

        {rows.map((row) =>
          row.kind === 'summary'
            ? renderSummaryRow(row)
            : renderMessageRow(row, {
                copiedRowId,
                onCopyAssistantMessage: handleCopyAssistantMessage,
              }),
        )}

        {streaming && streamingToolRows.length > 0 ? (
          <article className="rounded-md border border-border/40 bg-background/40 p-1.5">
            <div className="max-h-24 overflow-y-auto">
              <div className="space-y-1">
                {streamingToolRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        statusDotClass(row.status),
                      )}
                    />
                    <span className="truncate">{row.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ) : null}

        {shouldShowThinking ? (
          <div className="flex justify-start">
            <article className="w-full max-w-[min(100%,78ch)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-[12px] text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/70" />
                <span>{thinkingText}</span>
              </div>
            </article>
          </div>
        ) : null}

        {streamBlocks.length > 0
          ? streamBlocks.map((block, index) =>
              block.type === 'assistant' ? (
                <div key={block.id} className="flex justify-start">
                  <article className="w-full max-w-[min(100%,78ch)]">
                    {index === firstStreamingAssistantIndex ? (
                      <div className="mb-1 text-[11px] text-muted-foreground">
                        助手正在输入...
                      </div>
                    ) : null}
                    <MarkdownRenderer content={block.text} variant="assistant" />
                  </article>
                </div>
              ) : (
                <div key={block.id} className="flex justify-end">
                  <article className="max-w-[76%] rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-foreground">
                    {block.createdAt ? (
                      <div className="mb-0.5 text-right text-[10px] leading-none text-muted-foreground/80">
                        {formatTime(block.createdAt)}
                      </div>
                    ) : null}
                    <MarkdownRenderer content={block.text} variant="user" />
                  </article>
                </div>
              ),
            )
          : null}
      </div>

      {showScrollToBottom ? (
        <div className="pointer-events-none absolute bottom-3 right-3">
          <Button
            size="sm"
            className="pointer-events-auto"
            onClick={handleScrollToBottom}
          >
            回到底部
          </Button>
        </div>
      ) : null}
    </div>
  );
}
