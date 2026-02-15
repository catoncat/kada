export type WorkspaceSessionStatus = 'active' | 'archived';

export type WorkspaceNodeType =
  | 'sceneAssetCard'
  | 'modelAssetCard'
  | 'note'
  | 'group';

export interface WorkspaceViewport {
  x: number;
  y: number;
  scale: number;
}

export interface WorkspaceNode {
  id: string;
  type: WorkspaceNodeType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  groupId: string | null;
  meta: Record<string, unknown>;
}

export interface WorkspaceCanvasOperationAddNode {
  type: 'addNode';
  node: Partial<WorkspaceNode> & { type: WorkspaceNodeType };
}

export interface WorkspaceCanvasOperationMoveNode {
  type: 'moveNode';
  nodeId: string;
  x: number;
  y: number;
}

export interface WorkspaceCanvasOperationGroupNodes {
  type: 'groupNodes';
  nodeIds: string[];
  groupId?: string;
  title?: string;
}

export interface WorkspaceCanvasOperationUpdateNote {
  type: 'updateNote';
  nodeId: string;
  content: string;
  title?: string;
}

export type WorkspaceCanvasOperation =
  | WorkspaceCanvasOperationAddNode
  | WorkspaceCanvasOperationMoveNode
  | WorkspaceCanvasOperationGroupNodes
  | WorkspaceCanvasOperationUpdateNote;

export interface WorkspaceActionCard {
  id: string;
  kind: 'addNode' | 'moveNode' | 'groupNodes' | 'updateNote';
  title: string;
  reason: string;
  operations: WorkspaceCanvasOperation[];
}

export interface WorkspaceSessionSummary {
  id: string;
  title: string;
  status: WorkspaceSessionStatus;
  revision: number;
  nodeCount: number;
  lastMessageAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  viewport: WorkspaceViewport;
}

export interface WorkspaceSessionDetail extends WorkspaceSessionSummary {
  nodes: WorkspaceNode[];
}

export interface WorkspaceMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actionCards: WorkspaceActionCard[];
  meta: Record<string, unknown>;
  createdAt: string | null;
}

export interface WorkspaceSessionListResponse {
  data: WorkspaceSessionSummary[];
  total: number;
}

export interface WorkspaceMessageListResponse {
  data: WorkspaceMessage[];
  total: number;
}

export interface WorkspacePostMessageResponse {
  userMessage: WorkspaceMessage | null;
  assistantMessage: WorkspaceMessage | null;
}

export interface WorkspaceApplyActionsResponse {
  revision: number;
  nodes: WorkspaceNode[];
  appliedOperationCount: number;
}

export interface WorkspaceExportPayload {
  version: number;
  exportedAt: string;
  session: {
    id: string;
    title: string;
    status: WorkspaceSessionStatus;
    revision: number;
    viewport: WorkspaceViewport;
    createdAt: string | null;
    updatedAt: string | null;
  };
  nodes: WorkspaceNode[];
  messages: WorkspaceMessage[];
}
