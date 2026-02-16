import { apiUrl } from '@/lib/api-config';
import type {
  AgentMention,
  AgentCapabilities,
  AgentMentionImageRef,
  AgentMentionKind,
  AgentOutput,
  AgentResourceSearchItem,
  AgentSessionDetail,
  AgentSessionSummary,
  AgentTurnStreamChunk,
} from '@/types/agent';

interface ApiErrorPayload {
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export class AgentApiError extends Error {
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
    this.name = 'AgentApiError';
    this.status = options.status;
    this.code = options.code ?? null;
    this.details = options.details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(response: Response, body: unknown, fallback: string) {
  const payload = isRecord(body) ? (body as ApiErrorPayload) : null;
  return new AgentApiError({
    message:
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : fallback,
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : null,
    details: body,
  });
}

export async function listAgentSessions(): Promise<{
  data: AgentSessionSummary[];
  total: number;
}> {
  const res = await fetch(apiUrl('/api/agent/sessions'));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取 Agent 会话列表失败');
  }
  return data as { data: AgentSessionSummary[]; total: number };
}

export async function createAgentSession(input?: {
  title?: string;
  providerId?: string;
  engine?: 'coding-agent' | 'agent-core';
}): Promise<AgentSessionSummary> {
  const res = await fetch(apiUrl('/api/agent/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '创建 Agent 会话失败');
  }
  return data as AgentSessionSummary;
}

export async function getAgentSession(
  sessionId: string,
): Promise<AgentSessionDetail> {
  const res = await fetch(apiUrl(`/api/agent/sessions/${sessionId}`));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取 Agent 会话失败');
  }
  return data as AgentSessionDetail;
}

export async function updateAgentSession(
  sessionId: string,
  input: {
    title?: string;
    archived?: boolean;
  },
): Promise<AgentSessionSummary> {
  const res = await fetch(apiUrl(`/api/agent/sessions/${sessionId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '更新 Agent 会话失败');
  }
  return data as AgentSessionSummary;
}

export async function deleteAgentSession(sessionId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/agent/sessions/${sessionId}`), {
    method: 'DELETE',
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '删除 Agent 会话失败');
  }
}

export async function steerAgentSession(
  sessionId: string,
  text: string,
  clientMessageId: string,
  mentions?: AgentMention[],
): Promise<void> {
  const res = await fetch(apiUrl(`/api/agent/sessions/${sessionId}/steer`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, clientMessageId, mentions }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, 'Steer 失败');
  }
}

export async function followUpAgentSession(
  sessionId: string,
  text: string,
  clientMessageId: string,
  mentions?: AgentMention[],
): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/agent/sessions/${sessionId}/follow-up`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, clientMessageId, mentions }),
    },
  );
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, 'Follow-up 失败');
  }
}

export async function promoteFollowUpToSteerAgentSession(
  sessionId: string,
  input: {
    clientMessageId: string;
    text?: string;
  },
): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/agent/sessions/${sessionId}/follow-up/promote`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientMessageId: input.clientMessageId,
        text: input.text,
      }),
    },
  );
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, 'Follow-up 插入失败');
  }
}

export async function abortAgentSession(sessionId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/agent/sessions/${sessionId}/abort`), {
    method: 'POST',
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '中断会话失败');
  }
}

export async function listAgentEvents(input: {
  sessionId: string;
  cursor?: number;
  limit?: number;
}): Promise<{
  data: Array<{
    id: string;
    sessionId: string;
    turnId: string | null;
    seq: number;
    eventType: string;
    payload: unknown;
    createdAt: string | null;
  }>;
  cursor: number;
  total: number;
}> {
  const params = new URLSearchParams();
  if (typeof input.cursor === 'number' && Number.isFinite(input.cursor)) {
    params.set('cursor', String(Math.floor(input.cursor)));
  }
  if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(input.limit))));
  }

  const url = apiUrl(
    `/api/agent/sessions/${input.sessionId}/events?${params.toString()}`,
  );
  const res = await fetch(url);
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取 Agent 事件失败');
  }

  return data as {
    data: Array<{
      id: string;
      sessionId: string;
      turnId: string | null;
      seq: number;
      eventType: string;
      payload: unknown;
      createdAt: string | null;
    }>;
    cursor: number;
    total: number;
  };
}

export async function listAgentOutputs(input: {
  sessionId: string;
  kind?: 'photo' | 'copy';
}): Promise<{ data: AgentOutput[]; total: number }> {
  const params = new URLSearchParams();
  if (input.kind) params.set('kind', input.kind);

  const res = await fetch(
    apiUrl(
      `/api/agent/sessions/${input.sessionId}/outputs?${params.toString()}`,
    ),
  );
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取 Agent 产物失败');
  }

  return data as { data: AgentOutput[]; total: number };
}

function parseSseChunk(chunk: string): AgentTurnStreamChunk[] {
  const blocks = chunk.split('\n\n');
  const parsed: AgentTurnStreamChunk[] = [];

  for (const block of blocks) {
    const line = block.split('\n').find((entry) => entry.startsWith('data:'));
    if (!line) continue;

    const raw = line.replace(/^data:\s*/, '').trim();
    if (!raw) continue;

    try {
      const value = JSON.parse(raw) as AgentTurnStreamChunk;
      if (
        value &&
        typeof value === 'object' &&
        typeof value.cursor === 'number' &&
        value.event &&
        typeof value.event.type === 'string'
      ) {
        parsed.push(value);
      }
    } catch {
      // ignore malformed event chunk
    }
  }

  return parsed;
}

export async function streamAgentTurn(input: {
  sessionId: string;
  text: string;
  clientMessageId: string;
  mentions?: AgentMention[];
  signal?: AbortSignal;
  onEvent: (chunk: AgentTurnStreamChunk) => void;
}): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/agent/sessions/${input.sessionId}/turn`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input.text,
        clientMessageId: input.clientMessageId,
        mentions: input.mentions,
      }),
      signal: input.signal,
    },
  );

  if (!res.ok) {
    const body = await readJson(res);
    throw toApiError(res, body, '启动 Agent turn 失败');
  }

  if (!res.body) {
    throw new Error('Agent turn 流式响应为空');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const events = parseSseChunk(buffer);
    const lastSeparator = buffer.lastIndexOf('\n\n');
    if (lastSeparator >= 0) {
      buffer = buffer.slice(lastSeparator + 2);
    }

    for (const chunk of events) {
      input.onEvent(chunk);
    }
  }

  const rest = decoder.decode();
  if (rest) {
    const events = parseSseChunk(buffer + rest);
    for (const chunk of events) {
      input.onEvent(chunk);
    }
  }
}

export async function getAgentCapabilities(): Promise<AgentCapabilities> {
  const res = await fetch(apiUrl('/api/agent/capabilities'));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, '获取 Agent 能力配置失败');
  }
  return data as AgentCapabilities;
}

export async function searchAgentResources(input: {
  q: string;
  kinds?: AgentMentionKind[];
  limit?: number;
}): Promise<{ data: AgentResourceSearchItem[]; total: number }> {
  const params = new URLSearchParams();
  params.set('q', input.q || '');
  if (Array.isArray(input.kinds) && input.kinds.length > 0) {
    params.set('kinds', input.kinds.join(','));
  }
  if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(input.limit))));
  }

  const res = await fetch(apiUrl(`/api/agent/resources/search?${params.toString()}`));
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, 'Agent 资源搜索失败');
  }

  return data as { data: AgentResourceSearchItem[]; total: number };
}

export async function listAgentResourceImages(input: {
  kind: AgentMentionKind;
  id: string;
  limit?: number;
}): Promise<{
  data: AgentMentionImageRef[];
  total: number;
  resourceTitle?: string | null;
}> {
  const params = new URLSearchParams();
  if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(input.limit))));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    apiUrl(`/api/agent/resources/${input.kind}/${input.id}/images${suffix}`),
  );
  const data = await readJson(res);
  if (!res.ok) {
    throw toApiError(res, data, 'Agent 资源图片加载失败');
  }

  return data as {
    data: AgentMentionImageRef[];
    total: number;
    resourceTitle?: string | null;
  };
}
