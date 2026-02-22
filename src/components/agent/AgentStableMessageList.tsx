import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildAgentMessageRows,
  type AgentMessageListRow,
} from '@/components/agent/agent-message-view-model';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentEntry } from '@/types/agent';

const MAX_VISIBLE_TOOL_SUMMARY_ROWS = 6;

function formatTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
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

function renderReadableSummaryDetail(detail: string, compact: boolean) {
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

  const useKv =
    kvPairs.length >= 2 && kvPairs.length >= Math.ceil(lines.length * 0.6);
  const baseClass = cn(
    'rounded-md border border-border/40 bg-background/65',
    compact ? 'mt-1 px-1.5 py-1 text-[10px]' : 'mt-2 px-2 py-1.5 text-[11px]',
  );

  if (useKv) {
    return (
      <div className={baseClass}>
        {kvPairs.slice(0, 16).map((pair) => (
          <div
            key={`${pair.key}:${pair.value}`}
            className="grid grid-cols-[auto,1fr] gap-x-2"
          >
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
          <span
            className={cn(
              compact ? 'truncate text-foreground/90' : 'font-medium text-foreground',
            )}
          >
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
            <div
              key={row.id}
              className="rounded border border-border/40 bg-background/60 px-1.5 py-1"
            >
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

export function AgentStableMessageList({
  entries,
  optimisticUserMessages,
}: {
  entries: AgentEntry[];
  optimisticUserMessages?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
}) {
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

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

    const keepSet = new Set(toolSummaryIndices.slice(-MAX_VISIBLE_TOOL_SUMMARY_ROWS));
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
    <>
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
    </>
  );
}
