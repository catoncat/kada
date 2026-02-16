import { AlertCircle, Check, Copy } from 'lucide-react';
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
const MAX_VISIBLE_TOOL_SUMMARY_ROWS = 6;

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

function toolDisplayName(toolName: string): string {
  const map: Record<string, string> = {
    photo_compose_prompt: '组装提示词',
    photo_enqueue_generation: '创建生图任务',
    photo_get_generation_status: '查询生图状态',
    copy_generate_variants: '生成文案',
    copy_rewrite_by_tone: '改写文案',
    resource_search_scenes: '检索场景资源',
    resource_search_models: '检索模特资源',
    resource_get_project_context: '读取项目上下文',
  };
  return map[toolName] || toolName || '工具调用';
}

function summarizeToolResult(payload: Record<string, unknown>): string {
  const toolName = toInlineText(payload.toolName);
  const displayName = toolDisplayName(toolName);
  const result = toRecord(payload.result);
  const details = toRecord(result.details);

  const rawSummary = toInlineText(payload.enhancedSummary) || toInlineText(payload.summary);
  const looksLikeGitList = /^[0-9a-f]{7,}\s+.+/.test(rawSummary);
  if (rawSummary && !looksLikeGitList) {
    return rawSummary;
  }

  const status = toInlineText(details.status);
  const taskId = toInlineText(details.taskId);
  if (status || taskId) {
    const shortTask = taskId ? shortId(taskId) : '';
    return [displayName, status, shortTask].filter(Boolean).join(' · ');
  }

  if (Boolean(payload.isError)) {
    return `${displayName} 失败`;
  }
  return `${displayName} 完成`;
}

function summarizeToolProgress(payload: Record<string, unknown>): string {
  const toolName = toInlineText(payload.toolName);
  const displayName = toolDisplayName(toolName);
  const message = toInlineText(payload.message) || toInlineText(payload.status);
  if (message) return `${displayName} · ${message}`;

  const partial = payload.partialResult;
  if (typeof partial === 'string' && partial.trim()) {
    return `${displayName} · ${partial.trim()}`;
  }

  if (partial && typeof partial === 'object') {
    const partialRow = partial as Record<string, unknown>;
    const status = toInlineText(partialRow.status);
    const taskId = toInlineText(partialRow.taskId);
    const line = [status, taskId ? shortId(taskId) : ''].filter(Boolean).join(' ');
    if (line) return `${displayName} · ${line}`;
  }

  return `${displayName} 处理中`;
}

function normalizeStreamLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clipStreamLine(value: string, maxChars = 120): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function pushStreamRow(rows: StreamingToolRow[], row: StreamingToolRow) {
  const text = clipStreamLine(normalizeStreamLine(row.text));
  if (!text) return;
  const next = { ...row, text };
  const last = rows[rows.length - 1];
  if (last && last.text === next.text && last.status === next.status) {
    return;
  }
  rows.push(next);
}

function buildStreamingToolRows(events: AgentTurnEvent[]): StreamingToolRow[] {
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
      const tool = toolDisplayName(toInlineText(payload.toolName));
      pushStreamRow(rows, { id, text: `${tool} · 开始`, status: 'running' });
      continue;
    }

    if (event.type === 'tool.progress') {
      const text = summarizeToolProgress(payload);
      if (text) pushStreamRow(rows, { id, text, status: 'info' });
      continue;
    }

    if (event.type === 'tool.result') {
      const text = summarizeToolResult(payload);
      pushStreamRow(rows, {
        id,
        text,
        status: payload.isError ? 'error' : 'completed',
      });
      continue;
    }

    if (event.type === 'photo.task.created' || event.type === 'photo.task.updated') {
      const status = toInlineText(payload.status);
      const taskId = toInlineText(payload.taskId);
      const line = [status, taskId ? shortId(taskId) : ''].filter(Boolean).join(' ');
      if (line) pushStreamRow(rows, { id, text: line, status: 'info' });
      continue;
    }

    if (event.type === 'photo.ready') {
      pushStreamRow(rows, { id, text: 'photo ✓', status: 'completed' });
      continue;
    }

    if (event.type === 'copy.ready') {
      pushStreamRow(rows, { id, text: 'copy ✓', status: 'completed' });
      continue;
    }

    if (
      event.type === 'turn.completed' ||
      event.type === 'turn.failed' ||
      event.type === 'session.aborted'
    ) {
      break;
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

function renderReadableSummaryDetail(
  detail: string,
  compact: boolean,
) {
  const lines = detail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const kvPairs = lines
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9_.\-\[\]]{1,40})\s*:\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1],
        value: match[2].trim(),
      };
    })
    .filter((item): item is { key: string; value: string } => Boolean(item));

  const useKv = kvPairs.length >= 2 && kvPairs.length >= Math.ceil(lines.length * 0.6);
  const baseClass = cn(
    'rounded-md border border-border/40 bg-background/65',
    compact ? 'mt-1 px-1.5 py-1 text-[10px]' : 'mt-2 px-2 py-1.5 text-[11px]',
  );

  if (useKv) {
    return (
      <div className={baseClass}>
        {kvPairs.slice(0, 16).map((pair) => (
          <div key={`${pair.key}:${pair.value}`} className="grid grid-cols-[auto,1fr] gap-x-2">
            <span className="text-muted-foreground">{pair.key}</span>
            <span className="break-words text-foreground/90">{pair.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={baseClass}>
      {lines.slice(0, 16).map((line) => (
        <p key={line} className="break-words text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
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
        {renderReadableSummaryDetail(row.detail, compact)}
      </details>
    </article>
  );
}

function renderToolGroupRow(
  id: string,
  rows: Array<Extract<AgentMessageListRow, { kind: 'summary' }>>,
) {
  const errorCount = rows.filter((row) => row.level === 'error').length;
  const latest = rows[rows.length - 1];

  return (
    <article
      key={id}
      className={cn(
        'rounded-md border px-2 py-1.5 text-[11px]',
        errorCount > 0
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-border/60 bg-muted/15',
      )}
    >
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              errorCount > 0 ? 'bg-destructive/75' : 'bg-muted-foreground/65',
            )}
          />
          <span className="truncate text-foreground/90">
            工具执行（{rows.length} 步{errorCount > 0 ? `，${errorCount} 失败` : ''}）
          </span>
          {latest?.createdAt ? (
            <span className="ml-auto text-[10px]">{formatTime(latest.createdAt)}</span>
          ) : null}
        </summary>

        <div className="mt-1 space-y-1.5">
          {rows.map((row) => (
            <div key={row.id} className="rounded border border-border/40 bg-background/60 px-1.5 py-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    row.level === 'error'
                      ? 'bg-destructive/75'
                      : 'bg-muted-foreground/65',
                  )}
                />
                <span className="truncate text-foreground/90">{row.title}</span>
                {row.createdAt ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatTime(row.createdAt)}
                  </span>
                ) : null}
              </div>
              {row.detail ? renderReadableSummaryDetail(row.detail, true) : null}
            </div>
          ))}
        </div>
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
  const [settlingToolRows, setSettlingToolRows] = useState<StreamingToolRow[]>([]);
  const [showSettlingToolRows, setShowSettlingToolRows] = useState(false);
  const [toolNearBottom, setToolNearBottom] = useState(true);
  const settleTimerRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(false);
  const toolScrollRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => {
    return buildAgentMessageRows({
      entries,
      optimisticUserMessages,
    });
  }, [entries, optimisticUserMessages]);

  const displayRows = useMemo(() => {
    const toolSummaryIndices = rows
      .map((row, index) =>
        row.kind === 'summary' && row.category === 'tool' ? index : -1,
      )
      .filter((index) => index >= 0);

    if (toolSummaryIndices.length <= MAX_VISIBLE_TOOL_SUMMARY_ROWS) {
      return rows;
    }

    const keepSet = new Set(
      toolSummaryIndices.slice(-MAX_VISIBLE_TOOL_SUMMARY_ROWS),
    );
    const hiddenCount = toolSummaryIndices.length - keepSet.size;
    const output: AgentMessageListRow[] = [];
    let insertedCollapsedHint = false;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const isToolSummary = row.kind === 'summary' && row.category === 'tool';
      if (!isToolSummary) {
        output.push(row);
        continue;
      }

      if (keepSet.has(index)) {
        output.push(row);
        continue;
      }

      if (!insertedCollapsedHint) {
        output.push({
          kind: 'summary',
          id: `collapsed-tool-summary:${hiddenCount}`,
          title: `已折叠 ${hiddenCount} 条工具结果`,
          detail: '为保持阅读流畅，仅展示最近工具结果。',
          createdAt: row.createdAt,
          level: 'info',
          category: 'tool',
        });
        insertedCollapsedHint = true;
      }
    }

    return output;
  }, [rows]);

  const displayBlocks = useMemo(() => {
    const blocks: Array<
      | { kind: 'row'; row: AgentMessageListRow }
      | {
          kind: 'tool-group';
          id: string;
          rows: Array<Extract<AgentMessageListRow, { kind: 'summary' }>>;
        }
    > = [];

    let pendingGroup: Array<Extract<AgentMessageListRow, { kind: 'summary' }>> = [];

    const flushGroup = () => {
      if (pendingGroup.length === 0) return;
      if (pendingGroup.length < 2) {
        blocks.push({ kind: 'row', row: pendingGroup[0] });
      } else {
        blocks.push({
          kind: 'tool-group',
          id: `tool-group:${pendingGroup[0].id}:${pendingGroup.length}`,
          rows: pendingGroup,
        });
      }
      pendingGroup = [];
    };

    for (const row of displayRows) {
      const isToolSummary = row.kind === 'summary' && row.category === 'tool';
      if (isToolSummary) {
        pendingGroup.push(row as Extract<AgentMessageListRow, { kind: 'summary' }>);
        continue;
      }

      flushGroup();
      blocks.push({ kind: 'row', row });
    }

    flushGroup();
    return blocks;
  }, [displayRows]);

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

  const latestToolRows = useMemo(
    () => buildStreamingToolRows(events || []),
    [events],
  );
  const visibleStreamingToolRows = streaming
    ? latestToolRows
    : showSettlingToolRows
      ? settlingToolRows
      : [];
  const streamingToolVersion = useMemo(() => {
    const last = visibleStreamingToolRows[visibleStreamingToolRows.length - 1];
    if (!last) return '0';
    return `${visibleStreamingToolRows.length}:${last.id}:${last.text}:${last.status}`;
  }, [visibleStreamingToolRows]);

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
    const element = toolScrollRef.current;
    if (!element) return;

    const onToolScroll = () => {
      setToolNearBottom(isNearBottom(element));
    };

    element.addEventListener('scroll', onToolScroll, { passive: true });
    onToolScroll();

    return () => {
      element.removeEventListener('scroll', onToolScroll);
    };
  }, [visibleStreamingToolRows.length]);

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
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    if (streaming) {
      wasStreamingRef.current = true;
      setShowSettlingToolRows(false);
      setSettlingToolRows(latestToolRows);
      return;
    }

    if (!wasStreamingRef.current || latestToolRows.length === 0) {
      return;
    }
    wasStreamingRef.current = false;

    setSettlingToolRows(latestToolRows);
    setShowSettlingToolRows(true);
    settleTimerRef.current = window.setTimeout(() => {
      setShowSettlingToolRows(false);
      setSettlingToolRows([]);
      settleTimerRef.current = null;
    }, 380);
  }, [latestToolRows, streaming]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const contentVersion = `${displayBlocks.length}:${streamBlocks.length}:${streamingAssistantText.length}:${visibleStreamingToolRows.length}:${streaming ? 1 : 0}`;
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
    displayBlocks.length,
    streamBlocks.length,
    streamingAssistantText.length,
    visibleStreamingToolRows.length,
    streaming,
  ]);

  useEffect(() => {
    const element = toolScrollRef.current;
    if (!element) return;

    if (toolNearBottom || streaming) {
      scrollToBottom(element);
    }
  }, [toolNearBottom, streaming, streamingToolVersion]);

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

        {displayBlocks.map((block) => {
          if (block.kind === 'tool-group') {
            return renderToolGroupRow(block.id, block.rows);
          }

          const row = block.row;
          return row.kind === 'summary'
            ? renderSummaryRow(row)
            : renderMessageRow(row, {
                copiedRowId,
                onCopyAssistantMessage: handleCopyAssistantMessage,
              });
        })}

        {visibleStreamingToolRows.length > 0 ? (
          <article
            data-testid="agent-stream-tools"
            className="rounded-md border border-border/40 bg-background/40 p-1.5"
          >
            <div
              ref={toolScrollRef}
              data-testid="agent-stream-tools-scroll"
              className="max-h-[clamp(84px,22vh,168px)] overflow-y-auto"
            >
              <div className="space-y-1">
                {visibleStreamingToolRows.map((row) => (
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
