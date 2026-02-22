import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentConversationPane } from '@/components/agent/AgentConversationPane';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  useAgentSessions,
  useCreateAgentSession,
  useDeleteAgentSession,
  useUpdateAgentSession,
} from '@/hooks/useAgentSessions';
import { useAgentTurnStream } from '@/hooks/useAgentTurnStream';

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function toRelativeTime(value: string | null | undefined): string {
  const ts = toTimestamp(value);
  if (!ts) return '--';
  const diffMs = Date.now() - ts;
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 1) return '刚刚';
  if (Math.abs(diffMin) < 60) return `${diffMin}m`;
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return `${diffHour}h`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d`;
}

function statusDotClass(status: string): string {
  if (status === 'running') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-destructive';
  if (status === 'aborted') return 'bg-muted-foreground/50';
  return 'bg-muted-foreground/50';
}

function statusLabel(status: string): string {
  if (status === 'running') return '运行中';
  if (status === 'failed') return '失败';
  if (status === 'aborted') return '空闲';
  return '空闲';
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

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  if (!copied) {
    throw new Error('当前环境不支持剪贴板写入');
  }
}

function logSessionMenu(
  event: string,
  payload?: Record<string, unknown>,
): void {
  console.info('[AgentSessionMenu]', event, {
    at: new Date().toISOString(),
    ...(payload || {}),
  });
}

export function AgentShell() {
  const sessionsQuery = useAgentSessions();
  const createSessionMutation = useCreateAgentSession();
  const updateSessionMutation = useUpdateAgentSession();
  const deleteSessionMutation = useDeleteAgentSession();
  const turnStream = useAgentTurnStream();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<
    string | null
  >(null);
  const sessionListRef = useRef<HTMLDivElement | null>(null);

  const sessions = sessionsQuery.data?.data || [];
  const activeSessions = useMemo(
    () => sessions.filter((session) => !session.archivedAt),
    [sessions],
  );
  const archivedSessions = useMemo(
    () => sessions.filter((session) => Boolean(session.archivedAt)),
    [sessions],
  );
  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || null,
    [activeSessionId, sessions],
  );
  const deleteTargetSession = useMemo(
    () => sessions.find((item) => item.id === deleteTargetSessionId) || null,
    [deleteTargetSessionId, sessions],
  );

  const sortedActiveSessions = useMemo(
    () =>
      [...activeSessions].sort((a, b) => {
        const aKey = Math.max(
          toTimestamp(a.lastTurnAt),
          toTimestamp(a.updatedAt),
          toTimestamp(a.createdAt),
        );
        const bKey = Math.max(
          toTimestamp(b.lastTurnAt),
          toTimestamp(b.updatedAt),
          toTimestamp(b.createdAt),
        );
        return bKey - aKey;
      }),
    [activeSessions],
  );

  const sortedArchivedSessions = useMemo(
    () =>
      [...archivedSessions].sort((a, b) => {
        const aKey = Math.max(
          toTimestamp(a.lastTurnAt),
          toTimestamp(a.updatedAt),
          toTimestamp(a.createdAt),
        );
        const bKey = Math.max(
          toTimestamp(b.lastTurnAt),
          toTimestamp(b.updatedAt),
          toTimestamp(b.createdAt),
        );
        return bKey - aKey;
      }),
    [archivedSessions],
  );

  useEffect(() => {
    if (sessions.length === 0) {
      if (activeSessionId) setActiveSessionId(null);
      return;
    }

    if (activeSessionId) {
      const current = sessions.find((item) => item.id === activeSessionId);
      if (!current) {
        if (createSessionMutation.isPending || sessionsQuery.isFetching) {
          return;
        }

        const nextId =
          sortedActiveSessions[0]?.id ||
          (showArchived ? sortedArchivedSessions[0]?.id : null) ||
          null;
        setActiveSessionId(nextId);
        return;
      }

      if (current.archivedAt && !showArchived) {
        setActiveSessionId(sortedActiveSessions[0]?.id || null);
      }
      return;
    }

    const nextId =
      sortedActiveSessions[0]?.id ||
      (showArchived ? sortedArchivedSessions[0]?.id : null) ||
      null;
    if (nextId) {
      setActiveSessionId(nextId);
    }
  }, [
    activeSessionId,
    createSessionMutation.isPending,
    sessionsQuery.isFetching,
    sessions,
    showArchived,
    sortedActiveSessions,
    sortedArchivedSessions,
  ]);

  const handleCreateSession = async () => {
    try {
      const created = await createSessionMutation.mutateAsync({});
      setShowArchived(false);
      setActiveSessionId(created.id);
      setErrorText(null);
      requestAnimationFrame(() => {
        if (!sessionListRef.current) return;
        sessionListRef.current.scrollTop = 0;
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '创建会话失败');
    }
  };

  const handleArchiveSession = async (sessionId: string, archived: boolean) => {
    logSessionMenu('archive.start', {
      sessionId,
      archived,
      activeSessionId,
    });
    const wasActive = activeSessionId === sessionId;

    if (archived && wasActive) {
      setActiveSessionId(null);
    }

    try {
      await updateSessionMutation.mutateAsync({
        sessionId,
        input: { archived },
      });

      if (!archived && !activeSessionId) {
        setActiveSessionId(sessionId);
      }

      setErrorText(null);
      logSessionMenu('archive.success', {
        sessionId,
        archived,
      });
    } catch (error) {
      if (archived && wasActive) {
        setActiveSessionId(sessionId);
      }
      setErrorText(error instanceof Error ? error.message : '更新会话失败');
      logSessionMenu('archive.error', {
        sessionId,
        archived,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleDeleteSession = async (sessionId: string): Promise<boolean> => {
    logSessionMenu('delete.start', {
      sessionId,
      activeSessionId,
    });
    const wasActive = activeSessionId === sessionId;
    if (wasActive) {
      setActiveSessionId(null);
    }

    try {
      await deleteSessionMutation.mutateAsync(sessionId);
      setErrorText(null);
      logSessionMenu('delete.success', { sessionId });
      return true;
    } catch (error) {
      if (wasActive) {
        setActiveSessionId(sessionId);
      }
      setErrorText(error instanceof Error ? error.message : '删除会话失败');
      logSessionMenu('delete.error', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!deleteTargetSessionId) {
      logSessionMenu('delete.confirm.skip', {
        reason: 'NO_TARGET_SESSION',
      });
      return;
    }
    logSessionMenu('delete.confirm.click', {
      sessionId: deleteTargetSessionId,
    });
    const deleted = await handleDeleteSession(deleteTargetSessionId);
    if (deleted) {
      setDeleteTargetSessionId(null);
      logSessionMenu('delete.confirm.closed', {
        sessionId: deleteTargetSessionId,
      });
    }
  };

  const handleCopySessionId = async (sessionId: string) => {
    logSessionMenu('copy.start', { sessionId });
    try {
      await copyToClipboard(sessionId);
      setErrorText(null);
      logSessionMenu('copy.success', { sessionId });
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : '复制 Chat ID 失败',
      );
      logSessionMenu('copy.error', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const renderSessionItem = (session: (typeof sessions)[number]) => {
    const isActive = session.id === activeSessionId;
    const isArchived = Boolean(session.archivedAt);
    const isRunning =
      turnStream.isSessionStreaming(session.id) || session.status === 'running';
    const activityText = toRelativeTime(
      session.lastTurnAt || session.updatedAt || session.createdAt,
    );
    const engineText = session.engine === 'coding-agent' ? 'Coding' : 'Core';
    const statusText = isRunning
      ? statusLabel('running')
      : statusLabel(session.status);

    return (
      <ContextMenu key={session.id}>
        <ContextMenuTrigger
          className={`group relative w-full rounded-xl border px-2.5 py-2 text-left transition ${
            isActive
              ? 'border-primary/40 bg-primary/8 shadow-sm'
              : isArchived
                ? 'border-border/60 bg-muted/20 hover:bg-muted/35'
                : 'border-transparent hover:border-border/60 hover:bg-muted/35'
          }`}
          data-testid="agent-session-item"
          data-session-id={session.id}
          onClick={() => setActiveSessionId(session.id)}
        >
          <div className="flex items-start gap-2">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusDotClass(session.status)} ${
                isRunning ? 'animate-pulse' : ''
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium">
                  {session.title}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {activityText}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {engineText} · {statusText}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuPopup>
          <ContextMenuItem
            onClick={() => {
              logSessionMenu('menu.copy.click', {
                sessionId: session.id,
              });
              void handleCopySessionId(session.id);
            }}
          >
            <Copy className="h-4 w-4" />
            复制 Chat ID
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              logSessionMenu('menu.archive.click', {
                sessionId: session.id,
                nextArchived: !isArchived,
              });
              void handleArchiveSession(session.id, !isArchived);
            }}
          >
            {isArchived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {isArchived ? '取消归档' : '归档'}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => {
              logSessionMenu('menu.delete.click', {
                sessionId: session.id,
              });
              setDeleteTargetSessionId(session.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
    );
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex h-full min-h-0 w-[260px] shrink-0 flex-col border-r bg-background">
        <div className="border-b px-3 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">会话</h3>
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="agent-active-session-count"
              >
                {sortedActiveSessions.length} 个活跃线程
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleCreateSession()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              新建
            </Button>
          </div>
          {errorText ? (
            <p className="mt-2 text-[11px] text-destructive/90">{errorText}</p>
          ) : null}
        </div>

        <div
          ref={sessionListRef}
          data-testid="agent-session-list"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
        >
          {sessionsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded border p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载会话中...
            </div>
          ) : null}

          {sortedActiveSessions.length === 0 &&
          sortedArchivedSessions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              暂无会话，点击上方“新建”开始。
            </div>
          ) : null}

          {sortedActiveSessions.map(renderSessionItem)}

          {sortedArchivedSessions.length > 0 ? (
            <div className="pt-1">
              <button
                type="button"
                data-testid="agent-archived-toggle"
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/40"
                onClick={() => setShowArchived((prev) => !prev)}
              >
                <span className="inline-flex items-center gap-1">
                  {showArchived ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  已归档
                </span>
                <span>{sortedArchivedSessions.length}</span>
              </button>

              {showArchived ? (
                <div className="mt-1 space-y-1">
                  {sortedArchivedSessions.map(renderSessionItem)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      <AgentConversationPane
        key={activeSessionId || 'no-session'}
        activeSessionId={activeSessionId}
        activeSession={activeSession}
        turnStream={turnStream}
        refreshSessions={async () => {
          await sessionsQuery.refetch();
        }}
      />

      <AlertDialog
        open={Boolean(deleteTargetSessionId)}
        onOpenChange={(open) => {
          logSessionMenu('delete.dialog.openChange', {
            open,
            targetSessionId: deleteTargetSessionId,
            deletePending: deleteSessionMutation.isPending,
          });
          if (!open && !deleteSessionMutation.isPending) {
            setDeleteTargetSessionId(null);
          }
        }}
      >
        <AlertDialogPopup className="p-0">
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTargetSession?.title || '该会话'}
              」吗？删除后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={deleteSessionMutation.isPending}
              render={<Button variant="outline" />}
            >
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleteSessionMutation.isPending}
              onClick={() => void handleConfirmDeleteSession()}
            >
              {deleteSessionMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                '删除'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
