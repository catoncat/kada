import { useCallback, useRef, useState } from 'react';
import { streamAgentTurn } from '@/lib/agent-api';
import type { AgentMention, AgentTurnStreamChunk } from '@/types/agent';

export function useAgentTurnStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const runTurn = useCallback(
    async (input: {
      sessionId: string;
      text: string;
      clientMessageId: string;
      mentions?: AgentMention[];
      onEvent: (chunk: AgentTurnStreamChunk) => void;
    }) => {
      if (isStreaming) {
        throw new Error('当前已有执行中的 turn');
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        await streamAgentTurn({
          sessionId: input.sessionId,
          text: input.text,
          clientMessageId: input.clientMessageId,
          mentions: input.mentions,
          signal: controller.signal,
          onEvent: input.onEvent,
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [isStreaming],
  );

  return {
    isStreaming,
    runTurn,
    abort,
  };
}
