import {
  Archive,
  ArchiveRestore,
  Bug,
  ChevronDown,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentComposer,
  type AgentComposerSubmitPayload,
} from '@/components/agent/AgentComposer';
import { AgentMessageList } from '@/components/agent/AgentMessageList';
import { AgentOutputRail } from '@/components/agent/AgentOutputRail';
import { AgentToolTimeline } from '@/components/agent/AgentToolTimeline';
import type { StreamingInsertion } from '@/components/agent/agent-message-view-model';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  useAbortAgentSession,
  useAgentOutputs,
  useAgentSession,
  useAgentSessions,
  useCreateAgentSession,
  useDeleteAgentSession,
  useFollowUpAgentSession,
  usePromoteFollowUpToSteerAgentSession,
  useSteerAgentSession,
  useUpdateAgentSession,
} from '@/hooks/useAgentSessions';
import { useAgentTurnStream } from '@/hooks/useAgentTurnStream';
import type { AgentTurnEvent, AgentTurnStreamChunk } from '@/types/agent';

function eventFromChunk(chunk: AgentTurnStreamChunk): AgentTurnEvent {
  return chunk.event;
}

interface QueuedFollowUpItem {
  id: string;
  text: string;
}

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

export function AgentShell() {
  const sessionsQuery = useAgentSessions();
  const createSessionMutation = useCreateAgentSession();
  const updateSessionMutation = useUpdateAgentSession();
  const deleteSessionMutation = useDeleteAgentSession();
  const steerMutation = useSteerAgentSession();
  const followUpMutation = useFollowUpAgentSession();
  const promoteFollowUpMutation = usePromoteFollowUpToSteerAgentSession();
  const abortMutation = useAbortAgentSession();
  const turnStream = useAgentTurnStream();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showOutputRail, setShowOutputRail] = useState(false);
  const [events, setEvents] = useState<AgentTurnEvent[]>([]);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [streamingInsertions, setStreamingInsertions] = useState<
    StreamingInsertion[]
  >([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<
    Array<{ id: string; text: string; createdAt: string }>
  >([]);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUpItem[]>(
    [],
  );
  const queueCounterRef = useRef(0);
  const insertionSeqRef = useRef(0);
  const streamingAssistantTextRef = useRef('');
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
        // 新建/刷新窗口期先保留目标会话，避免错误回退到旧会话
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
    sortedActiveSessions,
    sortedArchivedSessions,
    sessions,
    showArchived,
  ]);

  const sessionDetailQuery = useAgentSession(activeSessionId, {
    enabled: Boolean(activeSessionId),
  });
  const outputsQuery = useAgentOutputs(activeSessionId, undefined, {
    enabled: Boolean(activeSessionId),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 切换会话时重置本地 UI 状态
  useEffect(() => {
    setEvents([]);
    setStreamingAssistantText('');
    streamingAssistantTextRef.current = '';
    setStreamingInsertions([]);
    setErrorText(null);
    setOptimisticUserMessages([]);
    setQueuedFollowUps([]);
    insertionSeqRef.current = 0;
  }, [activeSessionId]);

  const entries = sessionDetailQuery.data?.entries || [];
  const outputs =
    outputsQuery.data?.data || sessionDetailQuery.data?.outputs || [];

  const composerDisabled =
    !activeSessionId ||
    createSessionMutation.isPending ||
    Boolean(activeSession?.archivedAt) ||
    abortMutation.isPending;

  const setStreamingText = (value: string | ((prev: string) => string)) => {
    const next =
      typeof value === 'function'
        ? value(streamingAssistantTextRef.current)
        : value;
    streamingAssistantTextRef.current = next;
    setStreamingAssistantText(next);
  };

  const appendOptimisticUserMessage = (text: string): string => {
    const id = `optimistic-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setOptimisticUserMessages((prev) => [
      ...prev,
      {
        id,
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
    return id;
  };

  const removeOptimisticUserMessage = (id: string) => {
    setOptimisticUserMessages((prev) => prev.filter((item) => item.id !== id));
  };

  const appendStreamingInsertion = (text: string): string => {
    const id = `stream-insert-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const position = streamingAssistantTextRef.current.length;
    insertionSeqRef.current += 1;
    const seq = insertionSeqRef.current;
    setStreamingInsertions((prev) => [
      ...prev,
      { id, text, position, seq, createdAt: new Date().toISOString() },
    ]);
    return id;
  };

  const removeStreamingInsertion = (id: string) => {
    setStreamingInsertions((prev) => prev.filter((item) => item.id !== id));
  };

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
    } catch (error) {
      if (archived && wasActive) {
        setActiveSessionId(sessionId);
      }
      setErrorText(error instanceof Error ? error.message : '更新会话失败');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const confirmed = window.confirm('确定删除该会话吗？删除后不可恢复。');
    if (!confirmed) return;

    const wasActive = activeSessionId === sessionId;
    if (wasActive) {
      setActiveSessionId(null);
    }

    try {
      await deleteSessionMutation.mutateAsync(sessionId);
      setErrorText(null);
    } catch (error) {
      if (wasActive) {
        setActiveSessionId(sessionId);
      }
      setErrorText(error instanceof Error ? error.message : '删除会话失败');
    }
  };

  const handleCopySessionId = async (sessionId: string) => {
    try {
      await copyToClipboard(sessionId);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '复制 Chat ID 失败');
    }
  };

  const handleChunk = (chunk: AgentTurnStreamChunk) => {
    const event = eventFromChunk(chunk);
    setEvents((prev) => [...prev, event]);

    if (event.type === 'turn.started') {
      setQueuedFollowUps([]);
      setStreamingInsertions([]);
      insertionSeqRef.current = 0;
      return;
    }

    if (event.type === 'assistant.delta') {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta) {
        setStreamingText((prev) => prev + delta);
      }
      return;
    }

    if (event.type === 'assistant.completed') {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const text = typeof payload.text === 'string' ? payload.text : '';
      setStreamingText(text);
      return;
    }

    if (event.type === 'queue.updated') {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const mode = typeof payload.mode === 'string' ? payload.mode : '';
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';

      if (mode === 'follow-up' && text) {
        queueCounterRef.current += 1;
        const id = `${event.timestamp}-${queueCounterRef.current}`;
        setQueuedFollowUps((prev) => [
          ...prev,
          {
            id,
            text,
          },
        ]);
      }
      return;
    }

    if (event.type === 'turn.completed' || event.type === 'turn.failed') {
      void Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        sessionsQuery.refetch(),
      ]).then(
        () => {
          setQueuedFollowUps([]);
          setStreamingInsertions([]);
          insertionSeqRef.current = 0;
          setOptimisticUserMessages([]);
          if (event.type === 'turn.completed') {
            setStreamingText('');
          }
        },
        () => {
          // 保留流式临时态，避免 refetch 失败导致插入气泡“瞬间消失”。
        },
      );

      if (event.type === 'turn.failed') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        const message =
          typeof payload.message === 'string' ? payload.message : '执行失败';
        setErrorText(message);
        return;
      }
    }

    if (event.type === 'session.aborted') {
      setQueuedFollowUps([]);
      setStreamingInsertions([]);
      insertionSeqRef.current = 0;
      setOptimisticUserMessages([]);
      setErrorText(null);
      setStreamingText('');
    }
  };

  const handleSend = async ({ text, mentions }: AgentComposerSubmitPayload) => {
    if (!activeSessionId) {
      setErrorText('请先创建会话');
      return;
    }

    const optimisticId = appendOptimisticUserMessage(text);

    setErrorText(null);
    setStreamingText('');
    setStreamingInsertions([]);
    insertionSeqRef.current = 0;
    setQueuedFollowUps([]);

    try {
      await turnStream.runTurn({
        sessionId: activeSessionId,
        text,
        mentions,
        onEvent: handleChunk,
      });
      await Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        sessionsQuery.refetch(),
      ]);
      removeOptimisticUserMessage(optimisticId);
    } catch (error) {
      removeOptimisticUserMessage(optimisticId);
      setErrorText(error instanceof Error ? error.message : '发送失败');
    }
  };

  const handleSteer = async ({
    text,
    mentions,
  }: AgentComposerSubmitPayload) => {
    if (!activeSessionId) return;
    const insertionId = turnStream.isStreaming
      ? appendStreamingInsertion(text)
      : null;
    const optimisticId =
      turnStream.isStreaming ? null : appendOptimisticUserMessage(text);
    try {
      await steerMutation.mutateAsync({ sessionId: activeSessionId, text, mentions });
      setErrorText(null);
    } catch (error) {
      if (insertionId) removeStreamingInsertion(insertionId);
      if (optimisticId) removeOptimisticUserMessage(optimisticId);
      setErrorText(error instanceof Error ? error.message : 'Steer 失败');
    }
  };

  const handleFollowUp = async ({
    text,
    mentions,
  }: AgentComposerSubmitPayload) => {
    if (!activeSessionId) return;
    try {
      await followUpMutation.mutateAsync({
        sessionId: activeSessionId,
        text,
        mentions,
      });
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Follow-up 失败');
    }
  };

  const handleAbort = async () => {
    if (!activeSessionId) return;

    try {
      await abortMutation.mutateAsync(activeSessionId);
      turnStream.abort();
      await Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        sessionsQuery.refetch(),
      ]);
      setOptimisticUserMessages([]);
      setStreamingInsertions([]);
      insertionSeqRef.current = 0;
      setQueuedFollowUps([]);
      setErrorText(null);
      setStreamingText('');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '中断失败');
    }
  };

  const handleSteerQueuedFollowUp = async (itemId: string, text: string) => {
    if (!activeSessionId) return;
    if (!turnStream.isStreaming) {
      setErrorText('当前未在执行中，不能发送 steer。');
      return;
    }

    const currentQueue = queuedFollowUps;
    const removedIndex = currentQueue.findIndex((item) => item.id === itemId);
    if (removedIndex === -1) return;
    const removedItem = currentQueue[removedIndex];

    setQueuedFollowUps((prev) => prev.filter((item) => item.id !== itemId));
    const insertionId = appendStreamingInsertion(text);

    try {
      await promoteFollowUpMutation.mutateAsync({
        sessionId: activeSessionId,
        text,
        queueIndex: removedIndex,
      });
      setErrorText(null);
    } catch (error) {
      removeStreamingInsertion(insertionId);
      setQueuedFollowUps((prev) => {
        const next = [...prev];
        const insertAt = Math.max(0, Math.min(removedIndex, next.length));
        next.splice(insertAt, 0, removedItem);
        return next;
      });
      setErrorText(error instanceof Error ? error.message : 'Steer 失败');
    }
  };

  const activeStatus = useMemo(() => {
    if (turnStream.isStreaming) return statusLabel('running');
    if (activeSession?.archivedAt) return '已归档';
    if (activeSession?.status === 'aborted') return statusLabel('idle');
    return statusLabel(activeSession?.status || 'idle');
  }, [activeSession, turnStream.isStreaming]);

  const toggleTimelinePanel = () => {
    setShowTimeline((prev) => {
      const next = !prev;
      if (next) setShowOutputRail(false);
      return next;
    });
  };

  const toggleOutputPanel = () => {
    setShowOutputRail((prev) => {
      const next = !prev;
      if (next) setShowTimeline(false);
      return next;
    });
  };

  const renderSessionItem = (session: (typeof sessions)[number]) => {
    const isActive = session.id === activeSessionId;
    const isArchived = Boolean(session.archivedAt);
    const isRunning = session.status === 'running';
    const activityText = toRelativeTime(
      session.lastTurnAt || session.updatedAt || session.createdAt,
    );
    const engineText = session.engine === 'coding-agent' ? 'Coding' : 'Core';

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
                {engineText} · {statusLabel(session.status)}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuPopup>
          <ContextMenuItem onClick={() => void handleCopySessionId(session.id)}>
            <Copy className="h-4 w-4" />
            复制 Chat ID
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => void handleArchiveSession(session.id, !isArchived)}
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
            onClick={() => void handleDeleteSession(session.id)}
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
              <p className="text-[11px] text-muted-foreground">
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
        </div>

        <div
          ref={sessionListRef}
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b bg-background px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>当前状态：{activeStatus}</span>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant={showTimeline ? 'secondary' : 'outline'}
                onClick={toggleTimelinePanel}
              >
                <Bug className="mr-1 h-3.5 w-3.5" />
                {showTimeline ? '隐藏调试时间线' : '显示调试时间线'}
              </Button>
              <Button
                size="xs"
                variant={showOutputRail ? 'secondary' : 'outline'}
                onClick={toggleOutputPanel}
              >
                <ImageIcon className="mr-1 h-3.5 w-3.5" />
                {showOutputRail ? '隐藏产物栏' : `显示产物栏 (${outputs.length})`}
              </Button>
            </div>
          </div>
        </div>

        {errorText ? (
          <div className="p-3">
            <Alert variant="warning">
              <AlertTitle>提示</AlertTitle>
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <AgentMessageList
          entries={entries}
          streamingAssistantText={streamingAssistantText}
          optimisticUserMessages={optimisticUserMessages}
          streamingInsertions={streamingInsertions}
        />

        <AgentComposer
          disabled={composerDisabled}
          streaming={turnStream.isStreaming}
          steerPending={steerMutation.isPending || promoteFollowUpMutation.isPending}
          followUpPending={followUpMutation.isPending}
          abortPending={abortMutation.isPending}
          focusKey={activeSessionId}
          queuedFollowUps={queuedFollowUps}
          onSend={handleSend}
          onSteer={handleSteer}
          onFollowUp={handleFollowUp}
          onSteerQueuedFollowUp={(itemId, text) =>
            handleSteerQueuedFollowUp(itemId, text)
          }
          onAbort={handleAbort}
        />
      </div>

      {showTimeline ? <AgentToolTimeline events={events} /> : null}
      {showOutputRail ? <AgentOutputRail outputs={outputs} /> : null}
    </div>
  );
}
