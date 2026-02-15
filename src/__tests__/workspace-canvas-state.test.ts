import { describe, expect, it } from 'vitest';
import {
  applyCanvasOperations,
  commitCanvasSnapshot,
  createCanvasHistoryState,
  redoCanvasState,
  undoCanvasState,
} from '@/components/workspace/canvas-state';
import type { WorkspaceCanvasOperation } from '@/types/workspace';

describe('workspace canvas state', () => {
  it('applies add/move/group/update note operations', () => {
    const history = createCanvasHistoryState({
      nodes: [],
      viewport: { x: 0, y: 0, scale: 1 },
    });

    const ops: WorkspaceCanvasOperation[] = [
      {
        type: 'addNode',
        node: {
          id: 'scene-1',
          type: 'sceneAssetCard',
          title: '海边场景',
          x: 100,
          y: 120,
        },
      },
      {
        type: 'addNode',
        node: {
          id: 'model-1',
          type: 'modelAssetCard',
          title: '模特 A',
          x: 360,
          y: 140,
        },
      },
      {
        type: 'addNode',
        node: {
          id: 'note-1',
          type: 'note',
          title: '备注',
          meta: { content: '初始内容' },
          x: 240,
          y: 320,
        },
      },
      {
        type: 'moveNode',
        nodeId: 'model-1',
        x: 420,
        y: 180,
      },
      {
        type: 'groupNodes',
        nodeIds: ['scene-1', 'model-1'],
        groupId: 'group-1',
        title: '主视觉组合',
      },
      {
        type: 'updateNote',
        nodeId: 'note-1',
        content: '更新后的内容',
        title: '导演备注',
      },
    ];

    const next = commitCanvasSnapshot(history, (snapshot) =>
      applyCanvasOperations(snapshot, ops),
    );

    const scene = next.present.nodes.find((node) => node.id === 'scene-1');
    const model = next.present.nodes.find((node) => node.id === 'model-1');
    const note = next.present.nodes.find((node) => node.id === 'note-1');
    const group = next.present.nodes.find((node) => node.id === 'group-1');

    expect(scene?.groupId).toBe('group-1');
    expect(model?.x).toBe(420);
    expect(model?.y).toBe(180);
    expect(model?.groupId).toBe('group-1');
    expect(group?.type).toBe('group');
    expect(note?.title).toBe('导演备注');
    expect(note?.meta.content).toBe('更新后的内容');
  });

  it('supports undo and redo for committed snapshots', () => {
    const base = createCanvasHistoryState({
      nodes: [],
      viewport: { x: 0, y: 0, scale: 1 },
    });

    const step1 = commitCanvasSnapshot(base, (snapshot) =>
      applyCanvasOperations(snapshot, [
        {
          type: 'addNode',
          node: {
            id: 'node-1',
            type: 'note',
            title: 'note',
            x: 0,
            y: 0,
          },
        },
      ]),
    );

    const step2 = commitCanvasSnapshot(step1, (snapshot) =>
      applyCanvasOperations(snapshot, [
        {
          type: 'moveNode',
          nodeId: 'node-1',
          x: 200,
          y: 220,
        },
      ]),
    );

    const undo = undoCanvasState(step2);
    expect(undo.present.nodes[0]?.x).toBe(0);

    const redo = redoCanvasState(undo);
    expect(redo.present.nodes[0]?.x).toBe(200);
    expect(redo.present.nodes[0]?.y).toBe(220);
  });
});
