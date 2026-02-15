import { apiUrl } from '@/lib/api-config';
import type {
  WorkspaceApplyActionsResponse,
  WorkspaceCanvasOperation,
  WorkspaceExportPayload,
  WorkspaceMessageListResponse,
  WorkspacePostMessageResponse,
  WorkspaceSessionDetail,
  WorkspaceSessionListResponse,
  WorkspaceSessionStatus,
  WorkspaceViewport,
  WorkspaceNode,
} from '@/types/workspace';

interface ApiErrorPayload {
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export class WorkspaceApiError extends Error {
  status: number;
  code: string | null;
  details: unknown;

  constructor(options: {
    message: string;
    status: number;
    code?: string | null;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'WorkspaceApiError';
    this.status = options.status;
    this.code = options.code ?? null;
    this.details = options.details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toApiError(response: Response, body: unknown, fallback: string) {
  const payload = isRecord(body) ? (body as ApiErrorPayload) : null;
  return new WorkspaceApiError({
    message:
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : fallback,
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : null,
    details: body,
  });
}

export function isWorkspaceApiError(error: unknown): error is WorkspaceApiError {
  return error instanceof WorkspaceApiError;
}

export async function listWorkspaceSessions(): Promise<WorkspaceSessionListResponse> {
  const res = await fetch(apiUrl('/api/workspace/sessions'));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取工作台会话失败');
  }
  return data as WorkspaceSessionListResponse;
}

export async function createWorkspaceSession(input?: {
  title?: string;
}): Promise<WorkspaceSessionDetail> {
  const res = await fetch(apiUrl('/api/workspace/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '创建工作台会话失败');
  }
  return data as WorkspaceSessionDetail;
}

export async function getWorkspaceSession(id: string): Promise<WorkspaceSessionDetail> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${id}`));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取工作台会话失败');
  }
  return data as WorkspaceSessionDetail;
}

export async function updateWorkspaceSession(
  id: string,
  input: { title?: string; status?: WorkspaceSessionStatus },
): Promise<WorkspaceSessionDetail> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '更新工作台会话失败');
  }
  return data as WorkspaceSessionDetail;
}

export async function deleteWorkspaceSession(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${id}`), {
    method: 'DELETE',
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '删除工作台会话失败');
  }
}

export async function listWorkspaceMessages(
  sessionId: string,
): Promise<WorkspaceMessageListResponse> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${sessionId}/messages`));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取会话消息失败');
  }
  return data as WorkspaceMessageListResponse;
}

export async function postWorkspaceMessage(input: {
  sessionId: string;
  content: string;
  selectedNodeIds?: string[];
  mentions?: {
    scenes?: string[];
    models?: string[];
  };
}): Promise<WorkspacePostMessageResponse> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${input.sessionId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: input.content,
      selectedNodeIds: input.selectedNodeIds,
      mentions: input.mentions,
    }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '发送消息失败');
  }
  return data as WorkspacePostMessageResponse;
}

export async function saveWorkspaceCanvas(input: {
  sessionId: string;
  revision: number;
  viewport: WorkspaceViewport;
  nodes: WorkspaceNode[];
}): Promise<WorkspaceSessionDetail> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${input.sessionId}/canvas`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: input.revision,
      viewport: input.viewport,
      nodes: input.nodes,
    }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '保存画布失败');
  }
  return data as WorkspaceSessionDetail;
}

export async function applyWorkspaceActions(input: {
  sessionId: string;
  revision: number;
  operations: WorkspaceCanvasOperation[];
}): Promise<WorkspaceApplyActionsResponse> {
  const res = await fetch(
    apiUrl(`/api/workspace/sessions/${input.sessionId}/actions/apply`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: input.revision,
        operations: input.operations,
      }),
    },
  );
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '应用动作卡失败');
  }
  return data as WorkspaceApplyActionsResponse;
}

export async function exportWorkspaceSession(
  sessionId: string,
): Promise<WorkspaceExportPayload> {
  const res = await fetch(apiUrl(`/api/workspace/sessions/${sessionId}/export`));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '导出会话失败');
  }
  return data as WorkspaceExportPayload;
}

export async function importWorkspaceSession(payload: WorkspaceExportPayload): Promise<WorkspaceSessionDetail> {
  const res = await fetch(apiUrl('/api/workspace/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '导入会话失败');
  }
  return data as WorkspaceSessionDetail;
}
