import { useCallback, useRef, useState } from 'react';
import { streamAgentTurn } from '@/lib/agent-api';
import type { AgentMention, AgentTurnStreamChunk } from '@/types/agent';

export function useAgentTurnStream() {
  const [streamingCount, setStreamingCount] = useState(0);
  const controllersRef = useRef(new Map<string, AbortController>());

  const abort = useCallback((sessionId?: string | null) => {
    if (sessionId) {
      const controller = controllersRef.current.get(sessionId);
      if (!controller) return;
      controller.abort();
      controllersRef.current.delete(sessionId);
      setStreamingCount((prev) => Math.max(0, prev - 1));
      return;
    }

    const all = [...controllersRef.current.values()];
    if (all.length === 0) return;
    controllersRef.current.clear();
    for (const controller of all) {
      controller.abort();
    }
    setStreamingCount(0);
  }, []);

  const runTurn = useCallback(
    async (input: {
      sessionId: string;
      text: string;
      clientMessageId: string;
      traceId?: string;
      mentions?: AgentMention[];
      onEvent: (chunk: AgentTurnStreamChunk) => void;
    }) => {
      if (controllersRef.current.has(input.sessionId)) {
        throw new Error('当前会话已有执行中的 turn');
      }

      const controller = new AbortController();
      controllersRef.current.set(input.sessionId, controller);
      setStreamingCount((prev) => prev + 1);

      try {
        await streamAgentTurn({
          sessionId: input.sessionId,
          text: input.text,
          clientMessageId: input.clientMessageId,
          traceId: input.traceId,
          mentions: input.mentions,
          signal: controller.signal,
          onEvent: input.onEvent,
        });
      } finally {
        const current = controllersRef.current.get(input.sessionId);
        if (current === controller) {
          controllersRef.current.delete(input.sessionId);
          setStreamingCount((prev) => Math.max(0, prev - 1));
        }
      }
    },
    [],
  );

  const isSessionStreaming = useCallback((sessionId?: string | null) => {
    if (!sessionId) return false;
    return controllersRef.current.has(sessionId);
  }, []);

  return {
    isStreaming: streamingCount > 0,
    isSessionStreaming,
    runTurn,
    abort,
  };
}
