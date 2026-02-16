import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentMessageList } from '@/components/agent/AgentMessageList';
import type { AgentEntry, AgentTurnEvent } from '@/types/agent';

function makeEntry(input: {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt?: string;
}): AgentEntry {
  return {
    id: input.id,
    sessionId: 'session-1',
    entryType: input.role,
    parentEntryId: null,
    payload: {
      text: input.text,
      turnId: `turn-${input.id}`,
      stopReason: 'stop',
    },
    createdAt: input.createdAt ?? '2026-02-16T10:00:00.000Z',
  };
}

function setScrollMetrics(
  element: HTMLElement,
  input: { scrollTop: number; scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: input.scrollTop,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    writable: true,
    value: input.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    writable: true,
    value: input.clientHeight,
  });
}

describe('AgentMessageList scroll behavior', () => {
  it('does not force-scroll when user is reading history (not near bottom)', async () => {
    const firstEntries = [
      makeEntry({ id: '1', role: 'user', text: 'hello' }),
      makeEntry({ id: '2', role: 'assistant', text: 'world' }),
    ];

    const { rerender } = render(
      <AgentMessageList entries={firstEntries} streamingAssistantText="" />,
    );

    const scroller = screen.getByTestId('agent-message-scroll');
    setScrollMetrics(scroller, {
      scrollTop: 120,
      scrollHeight: 1000,
      clientHeight: 400,
    });

    fireEvent.scroll(scroller);

    const nextEntries = [
      ...firstEntries,
      makeEntry({ id: '3', role: 'assistant', text: 'new message' }),
    ];

    rerender(<AgentMessageList entries={nextEntries} streamingAssistantText="" />);

    await waitFor(() => {
      expect(scroller.scrollTop).toBe(120);
    });

    expect(screen.getByRole('button', { name: '回到底部' })).toBeTruthy();
  });

  it('auto-scrolls when user is already near bottom', async () => {
    const firstEntries = [
      makeEntry({ id: '11', role: 'user', text: 'hello' }),
      makeEntry({ id: '12', role: 'assistant', text: 'world' }),
    ];

    const { rerender } = render(
      <AgentMessageList entries={firstEntries} streamingAssistantText="" />,
    );

    const scroller = screen.getByTestId('agent-message-scroll');
    setScrollMetrics(scroller, {
      scrollTop: 620,
      scrollHeight: 1000,
      clientHeight: 400,
    });

    fireEvent.scroll(scroller);

    // 模拟新消息后容器高度增长
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      writable: true,
      value: 1200,
    });

    const nextEntries = [
      ...firstEntries,
      makeEntry({ id: '13', role: 'assistant', text: 'new message at bottom' }),
    ];

    rerender(<AgentMessageList entries={nextEntries} streamingAssistantText="" />);

    await waitFor(() => {
      expect(scroller.scrollTop).toBe(1200);
    });

    expect(screen.queryByRole('button', { name: '回到底部' })).toBeNull();
  });

  it('uses max-height tool stream container and keeps it briefly after stream stops', () => {
    vi.useFakeTimers();
    const events: AgentTurnEvent[] = [
      {
        type: 'turn.started',
        sessionId: 'session-1',
        turnId: 'turn-stream-1',
        timestamp: '2026-02-16T10:00:00.000Z',
        payload: {},
      },
      {
        type: 'tool.progress',
        sessionId: 'session-1',
        turnId: 'turn-stream-1',
        timestamp: '2026-02-16T10:00:01.000Z',
        payload: { message: '处理中...' },
      },
    ];

    const { rerender } = render(
      <AgentMessageList
        entries={[]}
        streamingAssistantText=""
        events={events}
        streaming
      />,
    );

    const toolArticle = screen.getByTestId('agent-stream-tools');
    const toolScroll = screen.getByTestId('agent-stream-tools-scroll');
    expect(toolArticle).toBeTruthy();
    expect(toolScroll.className).toContain('max-h-[clamp(84px,22vh,168px)]');

    rerender(
      <AgentMessageList
        entries={[]}
        streamingAssistantText=""
        events={events}
        streaming={false}
      />,
    );

    // 结束后先短暂保留，再自动收敛
    expect(screen.queryByTestId('agent-stream-tools')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(420);
    });
    expect(screen.queryByTestId('agent-stream-tools')).toBeNull();

    vi.useRealTimers();
  });
});
