import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentComposer } from '@/components/agent/AgentComposer';
import { AgentMessageList } from '@/components/agent/AgentMessageList';
import { AgentOutputRail } from '@/components/agent/AgentOutputRail';
import { AgentToolTimeline } from '@/components/agent/AgentToolTimeline';
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
  queuedAt: string;
  steerSubmitted: boolean;
}

export function AgentShell() {
  const sessionsQuery = useAgentSessions();
  const createSessionMutation = useCreateAgentSession();
  const updateSessionMutation = useUpdateAgentSession();
  const deleteSessionMutation = useDeleteAgentSession();
  const steerMutation = useSteerAgentSession();
  const followUpMutation = useFollowUpAgentSession();
  const abortMutation = useAbortAgentSession();
  const turnStream = useAgentTurnStream();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [events, setEvents] = useState<AgentTurnEvent[]>([]);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<
    Array<{ id: string; text: string; createdAt: string }>
  >([]);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUpItem[]>(
    [],
  );
  const queueCounterRef = useRef(0);

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

  useEffect(() => {
    if (sessions.length === 0) {
      if (activeSessionId) setActiveSessionId(null);
      return;
    }

    if (activeSessionId) {
      const current = sessions.find((item) => item.id === activeSessionId);
      if (!current) {
        const nextId =
          activeSessions[0]?.id ||
          (showArchived ? archivedSessions[0]?.id : null) ||
          null;
        setActiveSessionId(nextId);
        return;
      }

      if (current.archivedAt && !showArchived) {
        setActiveSessionId(activeSessions[0]?.id || null);
      }
      return;
    }

    const nextId =
      activeSessions[0]?.id ||
      (showArchived ? archivedSessions[0]?.id : null) ||
      null;
    if (nextId) {
      setActiveSessionId(nextId);
    }
  }, [
    activeSessionId,
    activeSessions,
    archivedSessions,
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
    setErrorText(null);
    setOptimisticUserMessages([]);
    setQueuedFollowUps([]);
  }, [activeSessionId]);

  const entries = sessionDetailQuery.data?.entries || [];
  const outputs =
    outputsQuery.data?.data || sessionDetailQuery.data?.outputs || [];

  const composerDisabled =
    !activeSessionId ||
    createSessionMutation.isPending ||
    Boolean(activeSession?.archivedAt) ||
    abortMutation.isPending;

  const handleCreateSession = async () => {
    try {
      const created = await createSessionMutation.mutateAsync({});
      setActiveSessionId(created.id);
      setErrorText(null);
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

  const handleChunk = (chunk: AgentTurnStreamChunk) => {
    const event = eventFromChunk(chunk);
    setEvents((prev) => [...prev, event]);

    if (event.type === 'turn.started') {
      setQueuedFollowUps([]);
      return;
    }

    if (event.type === 'assistant.delta') {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta) {
        setStreamingAssistantText((prev) => prev + delta);
      }
      return;
    }

    if (event.type === 'assistant.completed') {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const text = typeof payload.text === 'string' ? payload.text : '';
      setStreamingAssistantText(text);
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
            queuedAt: event.timestamp,
            steerSubmitted: false,
          },
        ]);
      }
      return;
    }

    if (event.type === 'turn.completed' || event.type === 'turn.failed') {
      void Promise.all([sessionDetailQuery.refetch(), outputsQuery.refetch()]);
      setQueuedFollowUps([]);
      if (event.type === 'turn.completed') {
        setStreamingAssistantText('');
      }

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
      setErrorText('已中断当前会话执行。');
    }
  };

  const handleSend = async (text: string) => {
    if (!activeSessionId) {
      setErrorText('请先创建会话');
      return;
    }

    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setOptimisticUserMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        text,
        createdAt: new Date().toISOString(),
      },
    ]);

    setErrorText(null);
    setStreamingAssistantText('');
    setQueuedFollowUps([]);

    try {
      await turnStream.runTurn({
        sessionId: activeSessionId,
        text,
        onEvent: handleChunk,
      });
      await Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        sessionsQuery.refetch(),
      ]);
      setOptimisticUserMessages((prev) =>
        prev.filter((item) => item.id !== optimisticId),
      );
    } catch (error) {
      setOptimisticUserMessages((prev) =>
        prev.filter((item) => item.id !== optimisticId),
      );
      setErrorText(error instanceof Error ? error.message : '发送失败');
    }
  };

  const handleSteer = async (text: string) => {
    if (!activeSessionId) return;
    try {
      await steerMutation.mutateAsync({ sessionId: activeSessionId, text });
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Steer 失败');
    }
  };

  const handleFollowUp = async (text: string) => {
    if (!activeSessionId) return;
    try {
      await followUpMutation.mutateAsync({ sessionId: activeSessionId, text });
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
      setQueuedFollowUps([]);
      setErrorText('已中断当前会话执行。');
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

    setQueuedFollowUps((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, steerSubmitted: true } : item,
      ),
    );

    try {
      await steerMutation.mutateAsync({ sessionId: activeSessionId, text });
      setErrorText(null);
    } catch (error) {
      setQueuedFollowUps((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, steerSubmitted: false } : item,
        ),
      );
      setErrorText(error instanceof Error ? error.message : 'Steer 失败');
    }
  };

  const activeStatus = useMemo(() => {
    if (turnStream.isStreaming) return 'running';
    if (activeSession?.archivedAt) return 'archived';
    return activeSession?.status || 'idle';
  }, [activeSession, turnStream.isStreaming]);

  const renderSessionItem = (session: (typeof sessions)[number]) => {
    const isActive = session.id === activeSessionId;
    const isArchived = Boolean(session.archivedAt);

    return (
      <ContextMenu key={session.id}>
        <ContextMenuTrigger
          className={`w-full rounded-lg border px-2 py-2 text-left ${
            isActive
              ? 'border-primary bg-primary/5'
              : isArchived
                ? 'border-border/60 bg-muted/20 hover:bg-muted/35'
                : 'hover:bg-muted/40'
          }`}
          onClick={() => setActiveSessionId(session.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {session.title}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {session.engine} · {session.status}
              </div>
            </div>

            {isArchived ? (
              <span className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                已归档
              </span>
            ) : null}
          </div>
        </ContextMenuTrigger>

        <ContextMenuPopup>
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
            <h3 className="text-sm font-semibold">Agent 会话</h3>
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

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {sessionsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded border p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载会话中...
            </div>
          ) : null}

          {activeSessions.length === 0 && archivedSessions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              暂无会话，点击上方“新建”开始。
            </div>
          ) : null}

          {activeSessions.map(renderSessionItem)}

          {archivedSessions.length > 0 ? (
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
                <span>{archivedSessions.length}</span>
              </button>

              {showArchived ? (
                <div className="mt-1 space-y-1">
                  {archivedSessions.map(renderSessionItem)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b bg-background px-3 py-2 text-xs text-muted-foreground">
          当前状态：{activeStatus}
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
        />

        <AgentComposer
          disabled={composerDisabled}
          streaming={turnStream.isStreaming}
          steerPending={steerMutation.isPending}
          followUpPending={followUpMutation.isPending}
          abortPending={abortMutation.isPending}
          onSend={handleSend}
          onSteer={handleSteer}
          onFollowUp={handleFollowUp}
          onAbort={handleAbort}
        />
      </div>

      <AgentToolTimeline
        events={events}
        queuedFollowUps={queuedFollowUps}
        steerDisabled={!turnStream.isStreaming || steerMutation.isPending}
        onSteerQueuedFollowUp={(itemId, text) =>
          void handleSteerQueuedFollowUp(itemId, text)
        }
      />
      <AgentOutputRail outputs={outputs} />
    </div>
  );
}
