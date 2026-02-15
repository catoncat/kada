import type {
  WorkspaceCanvasOperation,
  WorkspaceNode,
  WorkspaceNodeType,
  WorkspaceViewport,
} from '@/types/workspace';

export interface CanvasSnapshot {
  nodes: WorkspaceNode[];
  viewport: WorkspaceViewport;
}

export interface CanvasHistoryState {
  past: CanvasSnapshot[];
  present: CanvasSnapshot;
  future: CanvasSnapshot[];
  maxHistory: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    viewport: { ...snapshot.viewport },
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      meta: isRecord(node.meta) ? { ...node.meta } : {},
    })),
  };
}

export function cloneCanvasSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return cloneSnapshot(snapshot);
}

export function createCanvasHistoryState(options: {
  nodes: WorkspaceNode[];
  viewport: WorkspaceViewport;
  maxHistory?: number;
}): CanvasHistoryState {
  return {
    past: [],
    present: {
      nodes: options.nodes,
      viewport: options.viewport,
    },
    future: [],
    maxHistory: Math.max(1, options.maxHistory ?? 50),
  };
}

function toNodeType(value: unknown): WorkspaceNodeType {
  if (value === 'sceneAssetCard') return 'sceneAssetCard';
  if (value === 'modelAssetCard') return 'modelAssetCard';
  if (value === 'group') return 'group';
  if (value === 'note') return 'note';
  return 'note';
}

function normalizeNode(input: Partial<WorkspaceNode> & { type: WorkspaceNodeType }): WorkspaceNode {
  return {
    id: input.id || crypto.randomUUID(),
    type: toNodeType(input.type),
    title: typeof input.title === 'string' ? input.title : '',
    x: typeof input.x === 'number' ? input.x : 0,
    y: typeof input.y === 'number' ? input.y : 0,
    width: typeof input.width === 'number' ? Math.max(80, input.width) : 220,
    height: typeof input.height === 'number' ? Math.max(60, input.height) : 160,
    zIndex: typeof input.zIndex === 'number' ? Math.max(0, input.zIndex) : 1,
    groupId: typeof input.groupId === 'string' ? input.groupId : null,
    meta: isRecord(input.meta) ? input.meta : {},
  };
}

function withNodes(snapshot: CanvasSnapshot, nodes: WorkspaceNode[]): CanvasSnapshot {
  return {
    ...snapshot,
    nodes,
  };
}

function nextHistoryState(state: CanvasHistoryState, nextPresent: CanvasSnapshot): CanvasHistoryState {
  const past = [...state.past, cloneSnapshot(state.present)];
  while (past.length > state.maxHistory) {
    past.shift();
  }

  return {
    ...state,
    past,
    present: cloneSnapshot(nextPresent),
    future: [],
  };
}

function applyOperation(nodes: WorkspaceNode[], operation: WorkspaceCanvasOperation): WorkspaceNode[] {
  if (operation.type === 'addNode') {
    const node = normalizeNode(operation.node);
    return [...nodes, node];
  }

  if (operation.type === 'moveNode') {
    return nodes.map((node) =>
      node.id === operation.nodeId
        ? {
            ...node,
            x: operation.x,
            y: operation.y,
          }
        : node,
    );
  }

  if (operation.type === 'groupNodes') {
    const groupId = operation.groupId || crypto.randomUUID();

    const members = nodes.filter((node) => operation.nodeIds.includes(node.id));
    if (members.length < 2) return nodes;

    const grouped = nodes.map((node) =>
      operation.nodeIds.includes(node.id) ? { ...node, groupId } : node,
    );

    const groupExists = grouped.some((node) => node.id === groupId);
    if (groupExists) return grouped;

    const minX = Math.min(...members.map((node) => node.x));
    const minY = Math.min(...members.map((node) => node.y));
    const maxX = Math.max(...members.map((node) => node.x + node.width));
    const maxY = Math.max(...members.map((node) => node.y + node.height));

    return [
      ...grouped,
      {
        id: groupId,
        type: 'group',
        title: operation.title || '新分组',
        x: minX - 24,
        y: minY - 24,
        width: Math.max(180, maxX - minX + 48),
        height: Math.max(120, maxY - minY + 48),
        zIndex: 0,
        groupId: null,
        meta: {},
      },
    ];
  }

  if (operation.type === 'updateNote') {
    return nodes.map((node) => {
      if (node.id !== operation.nodeId || node.type !== 'note') return node;
      return {
        ...node,
        title: operation.title || node.title,
        meta: {
          ...(isRecord(node.meta) ? node.meta : {}),
          content: operation.content,
        },
      };
    });
  }

  return nodes;
}

export function applyCanvasOperations(
  snapshot: CanvasSnapshot,
  operations: WorkspaceCanvasOperation[],
): CanvasSnapshot {
  let nodes = snapshot.nodes;
  for (const operation of operations) {
    nodes = applyOperation(nodes, operation);
  }
  return withNodes(snapshot, nodes);
}

export function commitCanvasSnapshot(
  state: CanvasHistoryState,
  updater: (snapshot: CanvasSnapshot) => CanvasSnapshot,
): CanvasHistoryState {
  const nextPresent = updater(cloneSnapshot(state.present));
  return nextHistoryState(state, nextPresent);
}

export function commitExternalCanvasSnapshot(
  state: CanvasHistoryState,
  snapshot: CanvasSnapshot,
): CanvasHistoryState {
  return nextHistoryState(state, snapshot);
}

export function replaceCanvasPresent(
  state: CanvasHistoryState,
  snapshot: CanvasSnapshot,
): CanvasHistoryState {
  return {
    ...state,
    present: cloneSnapshot(snapshot),
  };
}

export function updateViewport(
  state: CanvasHistoryState,
  viewport: WorkspaceViewport,
): CanvasHistoryState {
  return {
    ...state,
    present: {
      ...state.present,
      viewport,
    },
  };
}

export function undoCanvasState(state: CanvasHistoryState): CanvasHistoryState {
  if (state.past.length === 0) return state;

  const past = [...state.past];
  const previous = past.pop();
  if (!previous) return state;

  return {
    ...state,
    past,
    present: previous,
    future: [cloneSnapshot(state.present), ...state.future],
  };
}

export function redoCanvasState(state: CanvasHistoryState): CanvasHistoryState {
  if (state.future.length === 0) return state;

  const [next, ...rest] = state.future;
  if (!next) return state;

  return {
    ...state,
    past: [...state.past, cloneSnapshot(state.present)],
    present: next,
    future: rest,
  };
}

export function removeNodes(snapshot: CanvasSnapshot, nodeIds: string[]): CanvasSnapshot {
  const idSet = new Set(nodeIds);
  return withNodes(
    snapshot,
    snapshot.nodes.filter((node) => !idSet.has(node.id)),
  );
}

export function moveNodes(
  snapshot: CanvasSnapshot,
  nodeIds: string[],
  deltaX: number,
  deltaY: number,
): CanvasSnapshot {
  const idSet = new Set(nodeIds);
  return withNodes(
    snapshot,
    snapshot.nodes.map((node) =>
      idSet.has(node.id)
        ? {
            ...node,
            x: node.x + deltaX,
            y: node.y + deltaY,
          }
        : node,
    ),
  );
}
