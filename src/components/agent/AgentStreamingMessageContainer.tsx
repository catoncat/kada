import { useEffect, useMemo, useRef, useState } from 'react';
import type { StreamingInsertion } from '@/components/agent/agent-message-view-model';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { sanitizeTextForDisplay } from '@/lib/agent-display';
import { cn } from '@/lib/utils';
import type { AgentTurnEvent } from '@/types/agent';

const AUTO_SCROLL_THRESHOLD = 72;

interface StreamingToolRow {
  id: string;
  text: string;
  status: 'running' | 'completed' | 'error' | 'info';
}

function formatTime(value: string | null | undefined): string {
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
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
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

  const rawSummary =
    toInlineText(payload.enhancedSummary) || toInlineText(payload.summary);
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
  const message =
    toInlineText(payload.message) || toInlineText(payload.status);
  if (message) return `${displayName} · ${message}`;

  const partial = payload.partialResult;
  if (typeof partial === 'string' && partial.trim()) {
    return `${displayName} · ${partial.trim()}`;
  }

  if (partial && typeof partial === 'object') {
    const partialRow = partial as Record<string, unknown>;
    const status = toInlineText(partialRow.status);
    const taskId = toInlineText(partialRow.taskId);
    const line = [status, taskId ? shortId(taskId) : '']
      .filter(Boolean)
      .join(' ');
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

    if (
      event.type === 'photo.task.created' ||
      event.type === 'photo.task.updated'
    ) {
      const status = toInlineText(payload.status);
      const taskId = toInlineText(payload.taskId);
      const line = [status, taskId ? shortId(taskId) : '']
        .filter(Boolean)
        .join(' ');
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

export function AgentStreamingMessageContainer({
  sessionId,
  streamingAssistantText,
  streamingInsertions,
  events,
  streaming,
}: {
  sessionId?: string | null;
  streamingAssistantText: string;
  streamingInsertions?: StreamingInsertion[];
  events?: AgentTurnEvent[];
  streaming?: boolean;
}) {
  const [thinkingFrame, setThinkingFrame] = useState(0);
  const [settlingToolRows, setSettlingToolRows] = useState<StreamingToolRow[]>([]);
  const [showSettlingToolRows, setShowSettlingToolRows] = useState(false);
  const [toolNearBottom, setToolNearBottom] = useState(true);
  const settleTimerRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(false);
  const toolScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    wasStreamingRef.current = false;
    setShowSettlingToolRows(false);
    setSettlingToolRows([]);
    setToolNearBottom(true);
  }, [sessionId]);

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

  const latestToolRows = useMemo(() => buildStreamingToolRows(events || []), [events]);
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

    if (latestToolRows.length === 0) {
      setShowSettlingToolRows(false);
      setSettlingToolRows([]);
      wasStreamingRef.current = false;
      return;
    }

    if (!wasStreamingRef.current) {
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
    const element = toolScrollRef.current;
    if (!element) return;

    if (toolNearBottom || streaming) {
      scrollToBottom(element);
    }
  }, [toolNearBottom, streaming, streamingToolVersion]);

  return (
    <>
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
    </>
  );
}
