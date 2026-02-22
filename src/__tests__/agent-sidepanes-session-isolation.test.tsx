import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentOutputRail } from '@/components/agent/AgentOutputRail';
import { AgentToolTimeline } from '@/components/agent/AgentToolTimeline';
import type { AgentOutput, AgentTurnEvent } from '@/types/agent';

describe('Agent side panes session isolation', () => {
  it('tool timeline clears previous session rows after rerender with empty events', () => {
    const events: AgentTurnEvent[] = [
      {
        type: 'tool.call',
        sessionId: 'session-1',
        turnId: 'turn-1',
        timestamp: '2026-02-20T10:00:00.000Z',
        payload: {
          toolName: 'photo_enqueue_generation',
          args: { prompt: 'a' },
        },
      },
      {
        type: 'tool.result',
        sessionId: 'session-1',
        turnId: 'turn-1',
        timestamp: '2026-02-20T10:00:01.000Z',
        payload: {
          toolName: 'photo_enqueue_generation',
          result: { ok: true },
          isError: false,
        },
      },
    ];

    const { rerender } = render(<AgentToolTimeline events={events} />);
    expect(screen.queryByText('调用工具：photo_enqueue_generation')).not.toBeNull();

    rerender(<AgentToolTimeline events={[]} />);
    expect(screen.queryByText('调用工具：photo_enqueue_generation')).toBeNull();
    expect(screen.queryByText('暂无工具事件。')).not.toBeNull();
  });

  it('output rail clears previous session outputs after rerender with empty outputs', () => {
    const outputs: AgentOutput[] = [
      {
        id: 'photo-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
        kind: 'photo',
        refId: null,
        content: {
          artifact: {
            filePath: '/uploads/demo-photo.png',
          },
        },
        createdAt: '2026-02-20T10:00:02.000Z',
      },
      {
        id: 'copy-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
        kind: 'copy',
        refId: null,
        content: {
          content: 'session-1 copy',
        },
        createdAt: '2026-02-20T10:00:03.000Z',
      },
    ];

    const { rerender } = render(<AgentOutputRail outputs={outputs} />);
    expect(screen.queryByText('文案 (1)')).not.toBeNull();
    expect(screen.queryByText('session-1 copy')).not.toBeNull();

    rerender(<AgentOutputRail outputs={[]} />);
    expect(screen.queryByText('session-1 copy')).toBeNull();
    expect(screen.queryByText('照片 (0)')).not.toBeNull();
    expect(screen.queryByText('文案 (0)')).not.toBeNull();
    expect(screen.queryByText('暂无照片产物')).not.toBeNull();
    expect(screen.queryByText('暂无文案产物')).not.toBeNull();
  });
});
