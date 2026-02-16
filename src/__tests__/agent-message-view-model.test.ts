import { describe, expect, it } from 'vitest';
import { buildAgentMessageRows } from '@/components/agent/agent-message-view-model';
import type { AgentEntry } from '@/types/agent';

function entry(input: {
  id: string;
  entryType: AgentEntry['entryType'];
  payload: unknown;
  createdAt?: string | null;
}): AgentEntry {
  return {
    id: input.id,
    sessionId: 's1',
    entryType: input.entryType,
    parentEntryId: null,
    payload: input.payload,
    createdAt: input.createdAt ?? '2026-02-16T10:00:00.000Z',
  };
}

describe('agent message view model', () => {
  it('hides toolUse interim assistant rows when same turn has final text', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'assistant-tooluse',
          entryType: 'assistant',
          payload: { turnId: 'turn-1', text: '', stopReason: 'toolUse' },
        }),
        entry({
          id: 'assistant-final',
          entryType: 'assistant',
          payload: { turnId: 'turn-1', text: '最终回复', stopReason: 'stop' },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'message',
      role: 'assistant',
      text: '最终回复',
    });
  });

  it('keeps toolUse summary when no final assistant text exists for the turn', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'assistant-tooluse',
          entryType: 'assistant',
          payload: { turnId: 'turn-2', text: '', stopReason: 'toolUse' },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      title: '工具调用中',
      level: 'info',
    });
  });

  it('maps empty error assistant rows into error summary cards', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'assistant-error',
          entryType: 'assistant',
          payload: {
            turnId: 'turn-3',
            text: '',
            stopReason: 'error',
            errorMessage: 'Connection error.',
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      level: 'error',
      title: '回合失败：Connection error.',
    });
  });

  it('maps empty aborted assistant rows into neutral summary cards', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'assistant-aborted',
          entryType: 'assistant',
          payload: {
            turnId: 'turn-4',
            text: '',
            stopReason: 'aborted',
            message: 'user aborted',
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      level: 'info',
      title: '回合已停止',
    });
  });

  it('ignores empty assistant rows with unrelated stopReason', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'assistant-empty-stop',
          entryType: 'assistant',
          payload: {
            turnId: 'turn-5',
            text: '',
            stopReason: 'stop',
          },
        }),
      ],
    });

    expect(rows).toHaveLength(0);
  });
});
