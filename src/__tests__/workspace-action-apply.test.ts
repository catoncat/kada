import { describe, expect, it } from 'vitest';
import { applyCanvasOperations } from '@/components/workspace/canvas-state';
import type { CanvasSnapshot } from '@/components/workspace/canvas-state';
import type { WorkspaceCanvasOperation } from '@/types/workspace';

function createSnapshot(): CanvasSnapshot {
  return {
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [
      {
        id: 'n1',
        type: 'note',
        title: 'n1',
        x: 0,
        y: 0,
        width: 200,
        height: 140,
        zIndex: 1,
        groupId: null,
        meta: { content: 'a' },
      },
    ],
  };
}

describe('workspace action apply', () => {
  it('keeps deterministic result with the same operation sequence', () => {
    const operations: WorkspaceCanvasOperation[] = [
      {
        type: 'moveNode',
        nodeId: 'n1',
        x: 120,
        y: 180,
      },
      {
        type: 'updateNote',
        nodeId: 'n1',
        content: 'updated',
        title: '新标题',
      },
    ];

    const once = applyCanvasOperations(createSnapshot(), operations);
    const twice = applyCanvasOperations(once, operations);

    expect(once.nodes[0]?.x).toBe(120);
    expect(once.nodes[0]?.meta.content).toBe('updated');
    expect(twice.nodes[0]?.x).toBe(120);
    expect(twice.nodes[0]?.meta.content).toBe('updated');
  });

  it('respects operation order', () => {
    const addThenMove: WorkspaceCanvasOperation[] = [
      {
        type: 'addNode',
        node: {
          id: 'scene-1',
          type: 'sceneAssetCard',
          title: 'scene',
          x: 10,
          y: 10,
        },
      },
      {
        type: 'moveNode',
        nodeId: 'scene-1',
        x: 400,
        y: 300,
      },
    ];

    const moved = applyCanvasOperations(createSnapshot(), addThenMove);
    const node = moved.nodes.find((item) => item.id === 'scene-1');

    expect(node?.x).toBe(400);
    expect(node?.y).toBe(300);
  });
});
