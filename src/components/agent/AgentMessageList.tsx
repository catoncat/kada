import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentStableMessageList,
} from '@/components/agent/AgentStableMessageList';
import {
  AgentStreamingMessageContainer,
} from '@/components/agent/AgentStreamingMessageContainer';
import type { StreamingInsertion } from '@/components/agent/agent-message-view-model';
import { Button } from '@/components/ui/button';
import type { AgentEntry, AgentTurnEvent } from '@/types/agent';

const AUTO_SCROLL_THRESHOLD = 72;

function isNearBottom(element: HTMLDivElement): boolean {
  const remaining =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  return remaining <= AUTO_SCROLL_THRESHOLD;
}

function scrollToBottom(element: HTMLDivElement) {
  element.scrollTop = element.scrollHeight;
}

export function AgentMessageList({
  sessionId,
  entries,
  streamingAssistantText,
  optimisticUserMessages,
  streamingInsertions,
  events,
  streaming,
}: {
  sessionId?: string | null;
  entries: AgentEntry[];
  streamingAssistantText: string;
  optimisticUserMessages?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  streamingInsertions?: StreamingInsertion[];
  events?: AgentTurnEvent[];
  streaming?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentVersionRef = useRef('');
  const [nearBottom, setNearBottom] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const contentVersion = useMemo(() => {
    const stableLast = entries[entries.length - 1];
    const stableTail = stableLast
      ? `${stableLast.id}:${stableLast.entryType}:${stableLast.turnId || ''}:${stableLast.createdAt || ''}`
      : 'none';

    const optimisticLast =
      optimisticUserMessages && optimisticUserMessages.length > 0
        ? optimisticUserMessages[optimisticUserMessages.length - 1]
        : null;
    const optimisticTail = optimisticLast
      ? `${optimisticLast.id}:${optimisticLast.createdAt}`
      : 'none';

    const insertionLast =
      streamingInsertions && streamingInsertions.length > 0
        ? streamingInsertions[streamingInsertions.length - 1]
        : null;
    const insertionTail = insertionLast
      ? `${insertionLast.id}:${insertionLast.position}:${insertionLast.seq}`
      : 'none';

    const eventLast = events && events.length > 0 ? events[events.length - 1] : null;
    const eventTail = eventLast
      ? `${eventLast.type}:${eventLast.turnId || ''}:${eventLast.timestamp}`
      : 'none';

    return [
      `stable:${entries.length}:${stableTail}`,
      `optimistic:${optimisticUserMessages?.length || 0}:${optimisticTail}`,
      `stream:${streamingAssistantText.length}`,
      `insert:${streamingInsertions?.length || 0}:${insertionTail}`,
      `events:${events?.length || 0}:${eventTail}`,
      `running:${streaming ? 1 : 0}`,
    ].join('|');
  }, [
    entries,
    events,
    optimisticUserMessages,
    streaming,
    streamingAssistantText.length,
    streamingInsertions,
  ]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onScroll = () => {
      const nextNearBottom = isNearBottom(element);
      setNearBottom(nextNearBottom);
      if (nextNearBottom) {
        setShowScrollToBottom(false);
      }
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      element.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (contentVersion === contentVersionRef.current) return;
    contentVersionRef.current = contentVersion;

    if (nearBottom) {
      scrollToBottom(element);
      setShowScrollToBottom(false);
      return;
    }

    setShowScrollToBottom(true);
  }, [contentVersion, nearBottom]);

  const handleScrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollToBottom(scrollRef.current);
    setNearBottom(true);
    setShowScrollToBottom(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="agent-message-scroll"
        className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-3 py-4"
      >
        <AgentStableMessageList
          entries={entries}
          optimisticUserMessages={optimisticUserMessages}
        />

        <AgentStreamingMessageContainer
          sessionId={sessionId}
          streamingAssistantText={streamingAssistantText}
          streamingInsertions={streamingInsertions}
          events={events}
          streaming={streaming}
        />
      </div>

      {showScrollToBottom ? (
        <div className="pointer-events-none absolute bottom-3 right-3">
          <Button
            size="sm"
            className="pointer-events-auto"
            onClick={handleScrollToBottom}
          >
            回到底部
          </Button>
        </div>
      ) : null}
    </div>
  );
}
