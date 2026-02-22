import type { APIRequestContext } from '@playwright/test';
import { seedImageArtifact } from './helpers/sqlite-db';
import { expect, Given, Then, When } from './fixtures';

const DETERMINISTIC_PROVIDER_ID = '__bdd_deterministic__';

interface StreamEvent {
  type: string;
  turnId: string | null;
  payload: Record<string, unknown>;
}

type BddState = Record<string, unknown> & {
  resourcePrefix?: string;
  projectId?: string;
  sceneId?: string;
  sceneTitle?: string;
  modelId?: string;
  imageArtifactId?: string;
  agentSessionId?: string;
  searchResults?: Array<{ kind?: string; id?: string }>;
  mentionTurnId?: string;
  mentionTurnEvents?: StreamEvent[];
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function buildApiBaseUrl(): string {
  return (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:1420').replace(
    /\/$/,
    '',
  );
}

function buildClientMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

async function readSseEvents(response: Response): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const body = response.body;
  if (!body) return events;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const blockEnd = buffer.indexOf('\n\n');
      if (blockEnd < 0) break;

      const rawBlock = buffer.slice(0, blockEnd);
      buffer = buffer.slice(blockEnd + 2);

      const line = rawBlock
        .split('\n')
        .find((item) => item.startsWith('data:'));
      if (!line) continue;

      const rawPayload = line.replace(/^data:\s*/, '').trim();
      if (!rawPayload) continue;

      try {
        const parsed = JSON.parse(rawPayload) as {
          event?: {
            type?: unknown;
            turnId?: unknown;
            payload?: unknown;
          };
        };

        if (!parsed.event || typeof parsed.event.type !== 'string') {
          continue;
        }

        events.push({
          type: parsed.event.type,
          turnId:
            typeof parsed.event.turnId === 'string' ? parsed.event.turnId : null,
          payload: toRecord(parsed.event.payload),
        });
      } catch {
        // ignore malformed payload
      }
    }
  }

  return events;
}

async function readSessionStatus(
  request: APIRequestContext,
  sessionId: string,
): Promise<string> {
  const response = await request.get(`/api/agent/sessions/${sessionId}`);
  if (!response.ok()) {
    throw new Error(
      `读取会话状态失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as { status?: string };
  if (typeof payload.status !== 'string' || !payload.status) {
    throw new Error('会话状态字段缺失');
  }
  return payload.status;
}

async function fetchTurnUserEntry(request: APIRequestContext, state: BddState) {
  expect(typeof state.agentSessionId).toBe('string');
  expect(typeof state.mentionTurnId).toBe('string');

  const response = await request.get(
    `/api/agent/sessions/${state.agentSessionId}/entries?turnId=${encodeURIComponent(
      state.mentionTurnId || '',
    )}`,
  );

  if (!response.ok()) {
    throw new Error(
      `读取 entries 失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ entryType?: string; payload?: unknown }>;
  };

  const userEntry = (payload.data || []).find((entry) => {
    if (entry.entryType !== 'user') return false;
    const row = toRecord(entry.payload);
    return row.mode === 'turn';
  });

  if (!userEntry) {
    throw new Error('未找到本轮 user turn entry');
  }

  return userEntry;
}

Given('我准备了资源上下文验证数据', async ({ request, bddState }) => {
  const state = getState(bddState);
  const prefix = `bdd-resource-${Date.now()}`;

  const sceneTitle = `${prefix}-scene`;
  const sceneRes = await request.post('/api/assets/scenes', {
    data: {
      name: sceneTitle,
      description: 'BDD mention scene',
      primaryImage: '/uploads/bdd-scene-ref.png',
      defaultLighting: '自然光',
      tags: ['bdd', 'mention'],
      isOutdoor: false,
    },
  });
  if (!sceneRes.ok()) {
    throw new Error(
      `创建场景失败: status=${sceneRes.status()} body=${await sceneRes.text()}`,
    );
  }
  const scenePayload = (await sceneRes.json()) as { id?: string };

  const projectRes = await request.post('/api/projects', {
    data: {
      title: `${prefix}-project`,
    },
  });
  if (!projectRes.ok()) {
    throw new Error(
      `创建项目失败: status=${projectRes.status()} body=${await projectRes.text()}`,
    );
  }
  const projectPayload = (await projectRes.json()) as { id?: string };

  const modelRes = await request.post('/api/assets/models', {
    data: {
      name: `${prefix}-model`,
      gender: 'female',
      appearancePrompt: '短发、自然笑容',
      primaryImage: '/uploads/bdd-model-ref.png',
      referenceImages: ['/uploads/bdd-model-ref.png'],
    },
  });
  if (!modelRes.ok()) {
    throw new Error(
      `创建模特失败: status=${modelRes.status()} body=${await modelRes.text()}`,
    );
  }
  const modelPayload = (await modelRes.json()) as { id?: string };

  const sessionRes = await request.post('/api/agent/sessions', {
    data: {
      title: `${prefix}-session`,
      providerId: DETERMINISTIC_PROVIDER_ID,
      engine: 'coding-agent',
    },
  });
  if (!sessionRes.ok()) {
    throw new Error(
      `创建 Agent 会话失败: status=${sessionRes.status()} body=${await sessionRes.text()}`,
    );
  }
  const sessionPayload = (await sessionRes.json()) as { id?: string };

  expect(typeof scenePayload.id).toBe('string');
  expect(typeof projectPayload.id).toBe('string');
  expect(typeof modelPayload.id).toBe('string');
  expect(typeof sessionPayload.id).toBe('string');

  state.resourcePrefix = prefix;
  state.sceneId = scenePayload.id;
  state.sceneTitle = sceneTitle;
  state.projectId = projectPayload.id;
  state.modelId = modelPayload.id;
  state.imageArtifactId = undefined;
  state.agentSessionId = sessionPayload.id;
  state.searchResults = [];
  state.mentionTurnId = undefined;
  state.mentionTurnEvents = [];
});

Given('我写入一条可检索的图片产物', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.projectId).toBe('string');

  const seeded = seedImageArtifact({
    ownerId: state.projectId || '',
    ownerSlot: 'scene:0',
    prompt: `${state.resourcePrefix || 'bdd'} image artifact`,
  });

  state.imageArtifactId = seeded.artifactId;
});

When('我搜索 Agent 资源关键词', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.resourcePrefix).toBe('string');

  const response = await request.get(
    `/api/agent/resources/search?q=${encodeURIComponent(state.resourcePrefix || '')}&limit=20`,
  );

  if (!response.ok()) {
    throw new Error(
      `搜索资源失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ kind?: string; id?: string }>;
  };

  state.searchResults = Array.isArray(payload.data) ? payload.data : [];
});

Then('搜索结果应包含已创建的 {string} 资源', async ({ bddState }, kind) => {
  const state = getState(bddState);
  const list = state.searchResults || [];

  let expectedId: string | undefined;
  if (kind === 'project') expectedId = state.projectId;
  if (kind === 'scene') expectedId = state.sceneId;
  if (kind === 'model') expectedId = state.modelId;

  expect(typeof expectedId).toBe('string');

  const matched = list.some(
    (item) => item.kind === kind && item.id === expectedId,
  );
  expect(matched).toBeTruthy();
});

When('我发送包含有效与失效 mention 的 turn', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');
  expect(typeof state.sceneId).toBe('string');

  const apiBaseUrl = buildApiBaseUrl();
  const response = await fetch(
    `${apiBaseUrl}/api/agent/sessions/${state.agentSessionId}/turn`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: '请参考我提供的资源继续输出建议',
        clientMessageId: buildClientMessageId('cm-resource'),
        mentions: [
          {
            mentionId: 'm-scene-valid',
            kind: 'scene',
            resourceId: state.sceneId,
            resourceTitle: state.sceneTitle,
            images: [],
          },
          {
            mentionId: 'm-project-missing',
            kind: 'project',
            resourceId: `missing-${Date.now()}`,
            resourceTitle: 'missing-project',
            images: [],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `mention turn 失败: status=${response.status} body=${await response.text()}`,
    );
  }

  const events = await readSseEvents(response);
  state.mentionTurnEvents = events;

  const turnId =
    events.find((event) => event.type === 'turn.started')?.turnId ||
    events.find((event) => typeof event.turnId === 'string')?.turnId ||
    null;

  if (!turnId) {
    throw new Error('无法从 SSE 中解析 turnId');
  }

  state.mentionTurnId = turnId;
});

When('我发送仅包含有效 image mention 的 turn', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');
  expect(typeof state.imageArtifactId).toBe('string');

  const apiBaseUrl = buildApiBaseUrl();
  const response = await fetch(
    `${apiBaseUrl}/api/agent/sessions/${state.agentSessionId}/turn`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: '请只参考这张产物图片继续输出建议',
        clientMessageId: buildClientMessageId('cm-resource-image'),
        mentions: [
          {
            mentionId: 'm-image-valid',
            kind: 'image',
            resourceId: state.imageArtifactId,
            resourceTitle: 'bdd-image',
            images: [],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `image mention turn 失败: status=${response.status} body=${await response.text()}`,
    );
  }

  const events = await readSseEvents(response);
  state.mentionTurnEvents = events;

  const turnId =
    events.find((event) => event.type === 'turn.started')?.turnId ||
    events.find((event) => typeof event.turnId === 'string')?.turnId ||
    null;

  if (!turnId) {
    throw new Error('无法从 SSE 中解析 turnId');
  }

  state.mentionTurnId = turnId;
});

Then('本轮 user entry 应包含 {int} 条解析成功 mention', async ({ request, bddState }, expected) => {
  const state = getState(bddState);
  const userEntry = await fetchTurnUserEntry(request, state);

  const userPayload = toRecord(userEntry.payload);
  const mentions = Array.isArray(userPayload.mentions) ? userPayload.mentions : [];
  expect(mentions.length).toBe(expected);
});

Then(
  '本轮 user entry 应包含 {int} 条 mention drop 且原因包含 {string}',
  async ({ request, bddState }, expectedCount, reasonKeyword) => {
    const state = getState(bddState);
    const userEntry = await fetchTurnUserEntry(request, state);

    const userPayload = toRecord(userEntry.payload);
    const mentionDrops = Array.isArray(userPayload.mentionDrops)
      ? userPayload.mentionDrops
      : [];

    expect(mentionDrops.length).toBe(expectedCount);

    const reasonMatched = mentionDrops.some((item) => {
      const row = toRecord(item);
      return (
        typeof row.reason === 'string' &&
        row.reason.toLowerCase().includes(reasonKeyword.toLowerCase())
      );
    });

    expect(reasonMatched).toBeTruthy();
  },
);

Then('本轮 user entry 应包含 {int} 条 kind 为 {string} 的 mention', async ({ request, bddState }, expectedCount, kind) => {
  const state = getState(bddState);
  const userEntry = await fetchTurnUserEntry(request, state);
  const userPayload = toRecord(userEntry.payload);
  const mentions = Array.isArray(userPayload.mentions) ? userPayload.mentions : [];

  const matched = mentions.filter((item) => {
    const row = toRecord(item);
    return row.kind === kind;
  });

  expect(matched.length).toBe(expectedCount);
});

Then('本轮 user entry mention drop 数应为 {int}', async ({ request, bddState }, expectedCount) => {
  const state = getState(bddState);
  const userEntry = await fetchTurnUserEntry(request, state);
  const userPayload = toRecord(userEntry.payload);
  const mentionDrops = Array.isArray(userPayload.mentionDrops)
    ? userPayload.mentionDrops
    : [];

  expect(mentionDrops.length).toBe(expectedCount);
});

Then('mention 场景执行后会话状态应为 {string}', async ({ request, bddState }, expectedStatus) => {
  const state = getState(bddState);
  expect(typeof state.agentSessionId).toBe('string');

  await expect.poll(async () => readSessionStatus(request, state.agentSessionId || '')).toBe(
    expectedStatus,
  );
});
