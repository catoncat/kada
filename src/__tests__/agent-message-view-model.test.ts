import { describe, expect, it } from 'vitest';
import { buildAgentMessageRows } from '@/components/agent/agent-message-view-model';
import type { AgentEntry } from '@/types/agent';

function entry(input: {
  id: string;
  entryType: AgentEntry['entryType'];
  payload: unknown;
  turnId?: string | null;
  createdAt?: string | null;
}): AgentEntry {
  return {
    id: input.id,
    sessionId: 's1',
    turnId: input.turnId ?? null,
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

  it('maps toolResult entries into compact summary rows', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'tool-result-copy',
          entryType: 'toolResult',
          payload: {
            toolName: 'copy_generate_variants',
            isError: false,
            result: {
              content: [{ type: 'text', text: '标题：测试标题\n\n正文...' }],
            },
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      category: 'tool',
      level: 'info',
      title: '标题：测试标题',
    });
  });

  it('prefers backend readable summary/detail for toolResult rows', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'tool-result-readable',
          entryType: 'toolResult',
          payload: {
            toolName: 'photo_get_generation_status',
            isError: false,
            summary: 'succeeded abc12345',
            readableDetail: 'status: succeeded\ntaskId: abc12345',
            result: {
              content: [{ type: 'text', text: '{"status":"succeeded","taskId":"abc12345"}' }],
            },
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      category: 'tool',
      level: 'info',
      title: 'succeeded abc12345',
      detail: 'status: succeeded\ntaskId: abc12345',
    });
  });

  it('prefers enhanced summary/detail over readable fields', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'tool-result-enhanced',
          entryType: 'toolResult',
          payload: {
            toolName: 'resource_get_project_context',
            isError: false,
            summary: '旧摘要',
            readableDetail: '旧详情',
            enhancedSummary: '增强后摘要',
            enhancedDetail: '状态正常\n耗时 120ms',
            result: {
              content: [{ type: 'text', text: '{"status":"ok"}' }],
            },
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      category: 'tool',
      level: 'info',
      title: '增强后摘要',
      detail: '状态正常\n耗时 120ms',
    });
  });

  it('formats object fallback detail into readable lines instead of raw json', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'tool-result-fallback-lines',
          entryType: 'toolResult',
          payload: {
            toolName: 'unknown_tool',
            isError: false,
            result: {
              foo: {
                bar: 1,
              },
              items: ['a'],
            },
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      kind: 'summary',
      category: 'tool',
      level: 'info',
    });
    if (row.kind !== 'summary') {
      throw new Error('unexpected row kind');
    }
    expect(row.detail).toContain('foo.bar: 1');
    expect(row.detail).not.toContain('{"foo"');
  });

  it('maps errored toolResult entries into error summary rows', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'tool-result-error',
          entryType: 'toolResult',
          payload: {
            toolName: 'resource_get_project_context',
            isError: true,
            result: {
              content: [{ type: 'text', text: '项目不存在: 222' }],
            },
          },
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'summary',
      category: 'tool',
      level: 'error',
      title: '项目不存在: 222',
    });
  });

  it('prefers entry.turnId over payload.turnId when grouping assistant turns', () => {
    const rows = buildAgentMessageRows({
      entries: [
        entry({
          id: 'assistant-tooluse',
          entryType: 'assistant',
          turnId: 'turn-from-column',
          payload: { turnId: 'turn-from-payload', text: '', stopReason: 'toolUse' },
        }),
        entry({
          id: 'assistant-final',
          entryType: 'assistant',
          turnId: 'turn-from-column',
          payload: { turnId: 'turn-from-payload', text: '最终回复', stopReason: 'stop' },
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
});
