import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { AgentComposer } from '@/components/agent/AgentComposer';
import { AgentMessageList } from '@/components/agent/AgentMessageList';
import { AgentOutputRail } from '@/components/agent/AgentOutputRail';
import { AgentToolTimeline } from '@/components/agent/AgentToolTimeline';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  useAbortAgentSession,
  useAgentOutputs,
  useAgentSession,
  useAgentSessions,
  useCreateAgentSession,
  useFollowUpAgentSession,
  useSteerAgentSession,
} from '@/hooks/useAgentSessions';
import { useAgentTurnStream } from '@/hooks/useAgentTurnStream';
import type { AgentTurnEvent, AgentTurnStreamChunk } from '@/types/agent';

function eventFromChunk(chunk: AgentTurnStreamChunk): AgentTurnEvent {
  return chunk.event;
}

export function AgentShell() {
  const sessionsQuery = useAgentSessions();
  const createSessionMutation = useCreateAgentSession();
  const steerMutation = useSteerAgentSession();
  const followUpMutation = useFollowUpAgentSession();
  const abortMutation = useAbortAgentSession();
  const turnStream = useAgentTurnStream();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentTurnEvent[]>([]);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<
    Array<{ id: string; text: string; createdAt: string }>
  >([]);

  const sessions = sessionsQuery.data?.data || [];

  useEffect(() => {
    if (activeSessionId) return;
    if (sessions.length === 0) return;
    setActiveSessionId(sessions[0].id);
  }, [activeSessionId, sessions]);

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
  }, [activeSessionId]);

  const entries = sessionDetailQuery.data?.entries || [];
  const outputs =
    outputsQuery.data?.data || sessionDetailQuery.data?.outputs || [];

  const composerDisabled =
    !activeSessionId ||
    createSessionMutation.isPending ||
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

  const handleChunk = (chunk: AgentTurnStreamChunk) => {
    const event = eventFromChunk(chunk);
    setEvents((prev) => [...prev, event]);

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

    if (event.type === 'turn.completed' || event.type === 'turn.failed') {
      void Promise.all([sessionDetailQuery.refetch(), outputsQuery.refetch()]);
      if (event.type === 'turn.completed') {
        setStreamingAssistantText('');
      }

      if (event.type === 'turn.failed') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        const message =
          typeof payload.message === 'string' ? payload.message : '执行失败';
        setErrorText(message);
      }
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

    turnStream.abort();

    try {
      await abortMutation.mutateAsync(activeSessionId);
      await Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        sessionsQuery.refetch(),
      ]);
      setOptimisticUserMessages([]);
      setErrorText('已中断当前会话执行。');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '中断失败');
    }
  };

  const activeStatus = useMemo(() => {
    const session = sessions.find((item) => item.id === activeSessionId);
    return session?.status || 'idle';
  }, [activeSessionId, sessions]);

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

          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`w-full rounded-lg border px-2 py-2 text-left ${
                session.id === activeSessionId
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/40'
              }`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <div className="truncate text-sm font-medium">
                {session.title}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {session.engine} · {session.status}
              </div>
            </button>
          ))}
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
          onSend={handleSend}
          onSteer={handleSteer}
          onFollowUp={handleFollowUp}
          onAbort={handleAbort}
        />
      </div>

      <AgentToolTimeline events={events} />
      <AgentOutputRail outputs={outputs} />
    </div>
  );
}
