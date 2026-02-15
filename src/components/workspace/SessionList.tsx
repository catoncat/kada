import { Clock3, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkspaceSessionSummary } from '@/types/workspace';

function formatDate(value: string | null): string {
  if (!value) return '刚创建';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚创建';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  creating,
  loading,
}: {
  sessions: WorkspaceSessionSummary[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  creating?: boolean;
  loading?: boolean;
}) {
  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col border-r bg-background">
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">工作台会话</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">独立于项目</p>
          </div>
          <Button size="sm" onClick={onCreate} disabled={creating}>
            <Plus className="mr-1 h-4 w-4" />
            新建
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: loading skeleton
                key={index}
                className="h-14 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">还没有会话</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={onCreate}>
              创建第一个会话
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group rounded-lg border p-2 transition-colors',
                  activeSessionId === session.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-transparent hover:border-border hover:bg-muted/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  className="w-full text-left"
                >
                  <p className="truncate text-sm font-medium">{session.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {formatDate(session.updatedAt)}
                    </span>
                    <span>节点 {session.nodeCount}</span>
                  </div>
                </button>

                <div className="mt-2 flex items-center justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onDelete(session.id)}
                    aria-label="删除会话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
