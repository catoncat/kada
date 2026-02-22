import { Bug, Image as ImageIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useAbortAgentSession,
  useAgentCapabilities,
  useAgentOutputs,
  useAgentSession,
  useFollowUpAgentSession,
  usePromoteFollowUpToSteerAgentSession,
  useSteerAgentSession,
} from '@/hooks/useAgentSessions';
import type { useAgentTurnStream } from '@/hooks/useAgentTurnStream';
import { AgentApiError, listAgentEvents } from '@/lib/agent-api';
import { agentTraceClient } from '@/lib/agent-trace-client';
import type {
  AgentSessionSummary,
  AgentTurnEvent,
  AgentTurnStreamChunk,
} from '@/types/agent';

interface QueuedFollowUpItem {
  clientMessageId: string;
  text: string;
  mode: 'follow-up' | 'steer';
  state: 'queued' | 'promoted' | 'applied' | 'persisted' | 'dropped';
  createdAt: string;
  appliedAt?: string;
}

function eventFromChunk(chunk: AgentTurnStreamChunk): AgentTurnEvent {
  return chunk.event;
}

function statusLabel(status: string): string {
  if (status === 'running') return '运行中';
  if (status === 'failed') return '失败';
  if (status === 'aborted') return '空闲';
  return '空闲';
}

function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cm_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function createTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function toErrorText(message: string, traceId?: string | null): string {
  const normalized = message.trim() || '请求失败';
  if (!traceId) return normalized;
  return `${normalized}（traceId: ${traceId}）`;
}

function extractTraceIdFromError(error: unknown): string | null {
  if (!(error instanceof AgentApiError)) return null;
  const details = error.details;
  if (!details || typeof details !== 'object') return null;
  const value = (details as Record<string, unknown>).traceId;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function isPendingForSession(
  mutation: { isPending: boolean; variables?: unknown },
  sessionId: string | null,
): boolean {
  if (!mutation.isPending || !sessionId) return false;
  const variables =
    mutation.variables && typeof mutation.variables === 'object'
      ? (mutation.variables as Record<string, unknown>)
      : null;
  return variables?.sessionId === sessionId;
}

interface AgentConversationPaneProps {
  activeSessionId: string | null;
  activeSession: AgentSessionSummary | null;
  turnStream: ReturnType<typeof useAgentTurnStream>;
  refreshSessions: () => Promise<unknown>;
}

export function AgentConversationPane({
  activeSessionId,
  activeSession,
  turnStream,
  refreshSessions,
}: AgentConversationPaneProps) {
  const capabilitiesQuery = useAgentCapabilities();
  const steerMutation = useSteerAgentSession();
  const followUpMutation = useFollowUpAgentSession();
  const promoteFollowUpMutation = usePromoteFollowUpToSteerAgentSession();
  const abortMutation = useAbortAgentSession();

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

  const activeSessionIdRef = useRef<string | null>(null);
  const lastAckSeqRef = useRef(0);
  const pollingRef = useRef<AbortController | null>(null);
  const enhancedRefreshTimerRef = useRef<number | null>(null);
  const insertionSeqRef = useRef(0);
  const streamingAssistantTextRef = useRef('');
  const activeTurnTraceIdRef = useRef<string | null>(null);

  // Keep latest session id in sync for event handlers/mutations that may outlive a render.
  activeSessionIdRef.current = activeSessionId;

  const sessionDetailQuery = useAgentSession(activeSessionId, {
    enabled: Boolean(activeSessionId),
  });
  const outputsQuery = useAgentOutputs(activeSessionId, undefined, {
    enabled: Boolean(activeSessionId),
  });

  useEffect(() => {
    pollingRef.current?.abort();
    pollingRef.current = null;
    if (enhancedRefreshTimerRef.current) {
      window.clearTimeout(enhancedRefreshTimerRef.current);
      enhancedRefreshTimerRef.current = null;
    }
    setEvents([]);
    setStreamingAssistantText('');
    streamingAssistantTextRef.current = '';
    setStreamingInsertions([]);
    setErrorText(null);
    setOptimisticUserMessages([]);
    setQueuedFollowUps([]);
    lastAckSeqRef.current = 0;
    insertionSeqRef.current = 0;
    activeTurnTraceIdRef.current = null;
  }, [activeSessionId]);

  const entries = sessionDetailQuery.data?.entries || [];
  const outputs =
    outputsQuery.data?.data || sessionDetailQuery.data?.outputs || [];
  const currentSessionStreaming = turnStream.isSessionStreaming(activeSessionId);

  const abortPendingForActive = isPendingForSession(abortMutation, activeSessionId);
  const steerPendingForActive = isPendingForSession(steerMutation, activeSessionId);
  const followUpPendingForActive = isPendingForSession(
    followUpMutation,
    activeSessionId,
  );
  const promotePendingForActive = isPendingForSession(
    promoteFollowUpMutation,
    activeSessionId,
  );

  const composerDisabled =
    !activeSessionId ||
    Boolean(activeSession?.archivedAt) ||
    abortPendingForActive;

  const setStreamingText = useCallback((value: string | ((prev: string) => string)) => {
    const next =
      typeof value === 'function'
        ? value(streamingAssistantTextRef.current)
        : value;
    streamingAssistantTextRef.current = next;
    setStreamingAssistantText(next);
  }, []);

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

  const appendStreamingInsertion = (
    clientMessageId: string,
    text: string,
  ): string => {
    const id = `stream-insert-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const position = streamingAssistantTextRef.current.length;
    insertionSeqRef.current += 1;
    const seq = insertionSeqRef.current;
    setStreamingInsertions((prev) => [
      ...prev,
      {
        id,
        clientMessageId,
        text,
        position,
        seq,
        createdAt: new Date().toISOString(),
      },
    ]);
    return id;
  };

  const removeStreamingInsertion = (id: string) => {
    setStreamingInsertions((prev) => prev.filter((item) => item.id !== id));
  };

  const handleEvent = useCallback(
    (event: AgentTurnEvent, seq?: number) => {
      const visibleSessionId = activeSessionIdRef.current;
      const isBackgroundSessionEvent =
        visibleSessionId &&
        event.sessionId &&
        event.sessionId !== visibleSessionId;
      if (isBackgroundSessionEvent) {
        if (
          event.type === 'turn.completed' ||
          event.type === 'turn.failed' ||
          event.type === 'session.aborted'
        ) {
          void refreshSessions();
        }
        return;
      }

      if (typeof seq === 'number') {
        if (seq <= lastAckSeqRef.current) {
          return;
        }
        lastAckSeqRef.current = seq;
      }

      setEvents((prev) => [...prev, event]);

      if (event.type === 'turn.started') {
        setStreamingText('');
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
        const stopReason =
          typeof payload.stopReason === 'string' ? payload.stopReason : null;
        const traceId = activeTurnTraceIdRef.current;
        if (traceId) {
          if (text.trim()) {
            agentTraceClient.log({
              traceId,
              sessionId: event.sessionId,
              turnId: event.turnId || null,
              channel: 'render',
              event: 'render.assistant_message_commit',
              data: {
                textLen: text.length,
                stopReason,
              },
            });
          } else if (stopReason === 'stop') {
            agentTraceClient.log({
              traceId,
              sessionId: event.sessionId,
              turnId: event.turnId || null,
              channel: 'render',
              event: 'render.empty_stop_hidden',
              level: 'warn',
              data: {
                textLen: text.length,
                stopReason,
                usage:
                  payload.usage && typeof payload.usage === 'object'
                    ? payload.usage
                    : null,
              },
            });
          }
        }
        setStreamingText(text);
        return;
      }

      if (event.type === 'tool.result.enhanced') {
        if (enhancedRefreshTimerRef.current) {
          window.clearTimeout(enhancedRefreshTimerRef.current);
        }
        enhancedRefreshTimerRef.current = window.setTimeout(() => {
          enhancedRefreshTimerRef.current = null;
          void sessionDetailQuery.refetch();
        }, 280);
        return;
      }

      if (event.type === 'queue.updated') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        const mode = typeof payload.mode === 'string' ? payload.mode : '';
        const queueAction =
          typeof payload.queueAction === 'string' ? payload.queueAction : '';
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        const clientMessageId =
          typeof payload.clientMessageId === 'string'
            ? payload.clientMessageId
            : '';

        if (mode === 'follow-up' && queueAction === 'queued' && text && clientMessageId) {
          setQueuedFollowUps((prev) => {
            const exists = prev.some((item) => item.clientMessageId === clientMessageId);
            if (exists) return prev;
            return [
              ...prev,
              {
                clientMessageId,
                text,
                mode: 'follow-up',
                state: 'queued',
                createdAt: event.timestamp,
              },
            ];
          });
          return;
        }

        if (queueAction === 'promoted' && clientMessageId) {
          setQueuedFollowUps((prev) =>
            prev.map((item) =>
              item.clientMessageId === clientMessageId
                ? {
                    ...item,
                    mode: 'steer',
                    state: 'promoted',
                  }
                : item,
            ),
          );
        }
        return;
      }

      if (event.type === 'steer.applied' || event.type === 'followup.applied') {
        const payload = (event.payload || {}) as Record<string, unknown>;
        const clientMessageId =
          typeof payload.clientMessageId === 'string'
            ? payload.clientMessageId
            : '';
        if (clientMessageId) {
          setQueuedFollowUps((prev) =>
            prev.filter((item) => item.clientMessageId !== clientMessageId),
          );
        }
        return;
      }

      if (event.type === 'turn.completed' || event.type === 'turn.failed') {
        activeTurnTraceIdRef.current = null;
        void Promise.all([
          sessionDetailQuery.refetch(),
          outputsQuery.refetch(),
          refreshSessions(),
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
            // Keep temporary stream states when refresh fails.
          },
        );

        if (event.type === 'turn.failed') {
          const payload = (event.payload || {}) as Record<string, unknown>;
          const message =
            typeof payload.message === 'string' ? payload.message : '执行失败';
          setErrorText(message);
        }
        return;
      }

      if (event.type === 'session.aborted') {
        activeTurnTraceIdRef.current = null;
        setQueuedFollowUps([]);
        setStreamingInsertions([]);
        insertionSeqRef.current = 0;
        setOptimisticUserMessages([]);
        setErrorText(null);
        setStreamingText('');
        void refreshSessions();
      }
    },
    [
      outputsQuery.refetch,
      refreshSessions,
      sessionDetailQuery.refetch,
      setStreamingText,
    ],
  );

  useEffect(() => {
    return () => {
      if (enhancedRefreshTimerRef.current) {
        window.clearTimeout(enhancedRefreshTimerRef.current);
        enhancedRefreshTimerRef.current = null;
      }
    };
  }, []);

  const handleChunk = useCallback(
    (chunk: AgentTurnStreamChunk) => {
      const event = eventFromChunk(chunk);
      handleEvent(event, chunk.cursor);
    },
    [handleEvent],
  );

  useEffect(() => {
    const cursor = sessionDetailQuery.data?.cursor;
    if (typeof cursor !== 'number') return;
    if (cursor > lastAckSeqRef.current) {
      lastAckSeqRef.current = cursor;
    }
  }, [sessionDetailQuery.data?.cursor]);

  useEffect(() => {
    if (!activeSessionId) return;
    const initialCursor = sessionDetailQuery.data?.cursor;
    if (typeof initialCursor !== 'number') return;
    if (initialCursor > lastAckSeqRef.current) {
      lastAckSeqRef.current = initialCursor;
    }
    const controller = new AbortController();
    pollingRef.current = controller;

    const pollOnce = async () => {
      if (controller.signal.aborted) return;
      let keepPulling = true;
      while (keepPulling && !controller.signal.aborted) {
        const res = await listAgentEvents({
          sessionId: activeSessionId,
          cursor: lastAckSeqRef.current,
          limit: 200,
        });

        for (const row of res.data) {
          handleEvent(
            {
              type: row.eventType as AgentTurnEvent['type'],
              sessionId: row.sessionId,
              turnId: row.turnId,
              timestamp: row.createdAt || new Date().toISOString(),
              payload: row.payload,
            },
            row.seq,
          );
        }

        keepPulling = res.data.length >= 200;
      }
    };

    const run = async () => {
      try {
        await pollOnce();
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Agent] events polling failed:', message);
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, currentSessionStreaming ? 1200 : 3000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [
    activeSessionId,
    currentSessionStreaming,
    handleEvent,
    sessionDetailQuery.data?.cursor,
  ]);

  const handleSend = async ({ text, mentions }: AgentComposerSubmitPayload) => {
    const traceId = createTraceId();
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      agentTraceClient.log({
        traceId,
        channel: 'ui',
        event: 'ui.submit_blocked',
        level: 'warn',
        data: {
          action: 'turn',
          reason: 'NO_ACTIVE_SESSION',
        },
      });
      setErrorText(toErrorText('请先创建会话', traceId));
      return;
    }

    const clientMessageId = createClientMessageId();
    activeTurnTraceIdRef.current = traceId;

    agentTraceClient.log({
      traceId,
      sessionId,
      clientMessageId,
      channel: 'ui',
      event: 'ui.submit_click',
      data: {
        action: 'turn',
        textLen: text.length,
        mentionsCount: mentions?.length ?? 0,
      },
    });

    const optimisticId = appendOptimisticUserMessage(text);

    setErrorText(null);
    setStreamingText('');
    setStreamingInsertions([]);
    insertionSeqRef.current = 0;
    setQueuedFollowUps([]);

    try {
      await turnStream.runTurn({
        sessionId,
        text,
        clientMessageId,
        traceId,
        mentions,
        onEvent: handleChunk,
      });
      await Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        refreshSessions(),
      ]);
      removeOptimisticUserMessage(optimisticId);
    } catch (error) {
      if (
        error instanceof AgentApiError &&
        error.code === 'SESSION_RUNNING' &&
        capabilitiesQuery.data?.autoFollowUpOnSessionRunning !== false
      ) {
        agentTraceClient.log({
          traceId,
          sessionId,
          clientMessageId,
          channel: 'ui',
          event: 'ui.submit_blocked',
          level: 'info',
          data: {
            action: 'turn',
            reason: 'SESSION_RUNNING_AUTO_FOLLOW_UP',
          },
        });

        try {
          await followUpMutation.mutateAsync({
            sessionId,
            text,
            clientMessageId,
            mentions,
            traceId,
          });
          removeOptimisticUserMessage(optimisticId);
          setErrorText(null);
          return;
        } catch (fallbackError) {
          removeOptimisticUserMessage(optimisticId);
          const fallbackTraceId = extractTraceIdFromError(fallbackError) || traceId;
          setErrorText(
            toErrorText(
              fallbackError instanceof Error
                ? fallbackError.message
                : '发送失败',
              fallbackTraceId,
            ),
          );
          return;
        }
      }
      removeOptimisticUserMessage(optimisticId);
      const resolvedTraceId = extractTraceIdFromError(error) || traceId;
      setErrorText(
        toErrorText(
          error instanceof Error ? error.message : '发送失败',
          resolvedTraceId,
        ),
      );
    }
  };

  const handleSteer = async ({
    text,
    mentions,
  }: AgentComposerSubmitPayload) => {
    const traceId = createTraceId();
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      agentTraceClient.log({
        traceId,
        channel: 'ui',
        event: 'ui.submit_blocked',
        level: 'warn',
        data: {
          action: 'steer',
          reason: 'NO_ACTIVE_SESSION',
        },
      });
      return;
    }
    const clientMessageId = createClientMessageId();
    agentTraceClient.log({
      traceId,
      sessionId,
      clientMessageId,
      channel: 'ui',
      event: 'ui.submit_click',
      data: {
        action: 'steer',
        textLen: text.length,
        mentionsCount: mentions?.length ?? 0,
      },
    });

    const insertionId = currentSessionStreaming
      ? appendStreamingInsertion(clientMessageId, text)
      : null;
    const optimisticId =
      currentSessionStreaming ? null : appendOptimisticUserMessage(text);
    try {
      await steerMutation.mutateAsync({
        sessionId,
        text,
        clientMessageId,
        mentions,
        traceId,
      });
      setErrorText(null);
    } catch (error) {
      if (insertionId) removeStreamingInsertion(insertionId);
      if (optimisticId) removeOptimisticUserMessage(optimisticId);
      const resolvedTraceId = extractTraceIdFromError(error) || traceId;
      setErrorText(
        toErrorText(
          error instanceof Error ? error.message : 'Steer 失败',
          resolvedTraceId,
        ),
      );
    }
  };

  const handleFollowUp = async ({
    text,
    mentions,
  }: AgentComposerSubmitPayload) => {
    const traceId = createTraceId();
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      agentTraceClient.log({
        traceId,
        channel: 'ui',
        event: 'ui.submit_blocked',
        level: 'warn',
        data: {
          action: 'follow-up',
          reason: 'NO_ACTIVE_SESSION',
        },
      });
      return;
    }
    const clientMessageId = createClientMessageId();
    agentTraceClient.log({
      traceId,
      sessionId,
      clientMessageId,
      channel: 'ui',
      event: 'ui.submit_click',
      data: {
        action: 'follow-up',
        textLen: text.length,
        mentionsCount: mentions?.length ?? 0,
      },
    });

    const queuedAt = new Date().toISOString();
    setQueuedFollowUps((prev) => [
      ...prev,
      {
        clientMessageId,
        text,
        mode: 'follow-up',
        state: 'queued',
        createdAt: queuedAt,
      },
    ]);
    try {
      await followUpMutation.mutateAsync({
        sessionId,
        text,
        clientMessageId,
        mentions,
        traceId,
      });
      setErrorText(null);
    } catch (error) {
      setQueuedFollowUps((prev) =>
        prev.filter((item) => item.clientMessageId !== clientMessageId),
      );
      const resolvedTraceId = extractTraceIdFromError(error) || traceId;
      setErrorText(
        toErrorText(
          error instanceof Error ? error.message : 'Follow-up 失败',
          resolvedTraceId,
        ),
      );
    }
  };

  const handleAbort = async () => {
    const traceId = createTraceId();
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      agentTraceClient.log({
        traceId,
        channel: 'ui',
        event: 'ui.submit_blocked',
        level: 'warn',
        data: {
          action: 'abort',
          reason: 'NO_ACTIVE_SESSION',
        },
      });
      return;
    }

    agentTraceClient.log({
      traceId,
      sessionId,
      channel: 'ui',
      event: 'ui.submit_click',
      data: {
        action: 'abort',
      },
    });

    try {
      await abortMutation.mutateAsync({ sessionId, traceId });
      turnStream.abort(sessionId);
      await Promise.all([
        sessionDetailQuery.refetch(),
        outputsQuery.refetch(),
        refreshSessions(),
      ]);
      setOptimisticUserMessages([]);
      setStreamingInsertions([]);
      insertionSeqRef.current = 0;
      setQueuedFollowUps([]);
      setErrorText(null);
      setStreamingText('');
    } catch (error) {
      const resolvedTraceId = extractTraceIdFromError(error) || traceId;
      setErrorText(
        toErrorText(
          error instanceof Error ? error.message : '中断失败',
          resolvedTraceId,
        ),
      );
    }
  };

  const handleSteerQueuedFollowUp = async (
    clientMessageId: string,
    text: string,
  ) => {
    const traceId = createTraceId();
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      agentTraceClient.log({
        traceId,
        channel: 'ui',
        event: 'ui.submit_blocked',
        level: 'warn',
        data: {
          action: 'follow-up.promote',
          reason: 'NO_ACTIVE_SESSION',
        },
      });
      return;
    }
    if (!currentSessionStreaming) {
      agentTraceClient.log({
        traceId,
        sessionId,
        clientMessageId,
        channel: 'ui',
        event: 'ui.submit_blocked',
        level: 'warn',
        data: {
          action: 'follow-up.promote',
          reason: 'SESSION_NOT_RUNNING',
        },
      });
      setErrorText(toErrorText('当前未在执行中，不能发送 steer。', traceId));
      return;
    }

    agentTraceClient.log({
      traceId,
      sessionId,
      clientMessageId,
      channel: 'ui',
      event: 'ui.submit_click',
      data: {
        action: 'follow-up.promote',
        textLen: text.length,
      },
    });

    const currentQueue = queuedFollowUps;
    const removedIndex = currentQueue.findIndex(
      (item) => item.clientMessageId === clientMessageId,
    );
    if (removedIndex === -1) return;
    const removedItem = currentQueue[removedIndex];

    setQueuedFollowUps((prev) =>
      prev.filter((item) => item.clientMessageId !== clientMessageId),
    );
    const insertionId = appendStreamingInsertion(clientMessageId, text);

    try {
      await promoteFollowUpMutation.mutateAsync({
        sessionId,
        clientMessageId,
        text,
        traceId,
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
      const resolvedTraceId = extractTraceIdFromError(error) || traceId;
      setErrorText(
        toErrorText(
          error instanceof Error ? error.message : 'Steer 失败',
          resolvedTraceId,
        ),
      );
    }
  };

  const activeStatus = useMemo(() => {
    if (currentSessionStreaming) return statusLabel('running');
    if (activeSession?.archivedAt) return '已归档';
    if (activeSession?.status === 'aborted') return statusLabel('idle');
    return statusLabel(activeSession?.status || 'idle');
  }, [activeSession, currentSessionStreaming]);

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

  return (
    <>
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
          key={activeSessionId || 'no-session'}
          sessionId={activeSessionId}
          entries={entries}
          streamingAssistantText={streamingAssistantText}
          optimisticUserMessages={optimisticUserMessages}
          streamingInsertions={streamingInsertions}
          events={events}
          streaming={currentSessionStreaming}
        />

        <AgentComposer
          sessionId={activeSessionId}
          disabled={composerDisabled}
          streaming={currentSessionStreaming}
          steerPending={steerPendingForActive || promotePendingForActive}
          followUpPending={followUpPendingForActive}
          abortPending={abortPendingForActive}
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
    </>
  );
}
