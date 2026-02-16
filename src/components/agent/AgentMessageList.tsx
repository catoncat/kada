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
import type { AgentEntry } from '@/types/agent';

const AUTO_SCROLL_THRESHOLD = 72;

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

function renderSummaryRow(row: Extract<AgentMessageListRow, { kind: 'summary' }>) {
  return (
    <article
      key={row.id}
      className={cn(
        'rounded-lg border px-3 py-2 text-xs',
        row.level === 'error'
          ? 'border-destructive/50 bg-destructive/5'
          : 'border-border bg-muted/20',
      )}
    >
      <details>
        <summary className="cursor-pointer list-none text-muted-foreground">
          <span className="font-medium text-foreground">{row.title}</span>
          {row.createdAt ? (
            <span className="ml-2 text-[11px]">{formatTime(row.createdAt)}</span>
          ) : null}
        </summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border bg-background/70 p-2 text-[11px] text-muted-foreground">
          {row.detail}
        </pre>
      </details>
    </article>
  );
}

function renderMessageRow(row: Extract<AgentMessageListRow, { kind: 'message' }>) {
  return (
    <div
      key={row.id}
      className={cn('flex', row.role === 'user' ? 'justify-end' : 'justify-start')}
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
        <article className="w-full max-w-[min(100%,78ch)]">
          <div className="mb-1 text-[11px] text-muted-foreground">
            {formatTime(row.createdAt)}
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
}: {
  entries: AgentEntry[];
  streamingAssistantText: string;
  optimisticUserMessages?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  streamingInsertions?: StreamingInsertion[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentVersionRef = useRef('');
  const [nearBottom, setNearBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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
    const element = scrollRef.current;
    if (!element) return;

    const contentVersion = `${rows.length}:${streamBlocks.length}:${streamingAssistantText.length}`;
    if (contentVersion === contentVersionRef.current) return;
    contentVersionRef.current = contentVersion;

    if (nearBottom) {
      scrollToBottom(element);
      setShowScrollToBottom(false);
      return;
    }

    setShowScrollToBottom(true);
  }, [nearBottom, rows.length, streamBlocks.length, streamingAssistantText.length]);

  const handleScrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollToBottom(scrollRef.current);
    setNearBottom(true);
    setShowScrollToBottom(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="agent-message-scroll"
        className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-3 py-4"
      >
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            先输入你的目标，例如“找 3
            个轻法式外景风格并生成首图，再给一版小红书文案”。
          </div>
        ) : null}

        {rows.map((row) =>
          row.kind === 'summary' ? renderSummaryRow(row) : renderMessageRow(row),
        )}

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
                  <article className="max-w-[82%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm">
                    {block.createdAt ? (
                      <div className="mb-1 text-right text-[11px] text-primary-foreground/70">
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
