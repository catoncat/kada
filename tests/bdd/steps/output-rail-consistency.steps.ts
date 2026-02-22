import { randomUUID } from 'node:crypto';
import { seedAgentOutput } from './helpers/sqlite-db';
import { expect, Given, Then, When } from './fixtures';

type OutputKind = 'photo' | 'copy';

interface OutputItem {
  id: string;
  sessionId: string;
  turnId: string | null;
  kind: OutputKind;
  refId: string | null;
  content: unknown;
}

type BddState = Record<string, unknown> & {
  outputSessionId?: string;
  photoTurnId?: string;
  copyTurnId?: string;
  photoOutputId?: string;
  copyOutputId?: string;
  snapshotOutputs?: OutputItem[];
  outputsByKind?: Partial<Record<OutputKind, OutputItem[]>>;
  outputsByTurn?: {
    photo?: OutputItem[];
    copy?: OutputItem[];
  };
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function toOutputList(value: unknown): OutputItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      if (
        typeof row.id !== 'string' ||
        typeof row.sessionId !== 'string' ||
        (row.kind !== 'photo' && row.kind !== 'copy')
      ) {
        return null;
      }
      return {
        id: row.id,
        sessionId: row.sessionId,
        turnId: typeof row.turnId === 'string' ? row.turnId : null,
        kind: row.kind,
        refId: typeof row.refId === 'string' ? row.refId : null,
        content: row.content ?? null,
      } satisfies OutputItem;
    })
    .filter((item): item is OutputItem => Boolean(item));
}

Given('我准备了一个包含 photo 与 copy 输出的会话', async ({ request, bddState }) => {
  const state = getState(bddState);

  const createRes = await request.post('/api/agent/sessions', {
    data: {
      title: `bdd-output-rail-${Date.now()}`,
    },
  });
  if (!createRes.ok()) {
    throw new Error(
      `创建会话失败: status=${createRes.status()} body=${await createRes.text()}`,
    );
  }

  const sessionPayload = (await createRes.json()) as { id?: string };
  expect(typeof sessionPayload.id).toBe('string');

  const sessionId = sessionPayload.id as string;
  const photoTurnId = `turn-photo-${randomUUID()}`;
  const copyTurnId = `turn-copy-${randomUUID()}`;

  const photoSeed = seedAgentOutput({
    sessionId,
    turnId: photoTurnId,
    kind: 'photo',
    refId: `ga_${randomUUID()}`,
    content: {
      artifactId: `ga_${randomUUID()}`,
      note: 'bdd photo output',
    },
  });

  const copySeed = seedAgentOutput({
    sessionId,
    turnId: copyTurnId,
    kind: 'copy',
    content: {
      text: 'bdd copy output',
      variant: 'A',
    },
  });

  state.outputSessionId = sessionId;
  state.photoTurnId = photoTurnId;
  state.copyTurnId = copyTurnId;
  state.photoOutputId = photoSeed.outputId;
  state.copyOutputId = copySeed.outputId;
  state.snapshotOutputs = [];
  state.outputsByKind = {};
  state.outputsByTurn = {};
});

When('我读取该会话快照与 outputs 列表', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.outputSessionId).toBe('string');
  expect(typeof state.photoTurnId).toBe('string');
  expect(typeof state.copyTurnId).toBe('string');

  const sessionId = state.outputSessionId as string;

  const [snapshotRes, photoRes, copyRes, photoTurnRes, copyTurnRes] =
    await Promise.all([
      request.get(`/api/agent/sessions/${sessionId}`),
      request.get(`/api/agent/sessions/${sessionId}/outputs?kind=photo`),
      request.get(`/api/agent/sessions/${sessionId}/outputs?kind=copy`),
      request.get(
        `/api/agent/sessions/${sessionId}/outputs?turnId=${encodeURIComponent(
          state.photoTurnId || '',
        )}`,
      ),
      request.get(
        `/api/agent/sessions/${sessionId}/outputs?turnId=${encodeURIComponent(
          state.copyTurnId || '',
        )}`,
      ),
    ]);

  for (const response of [snapshotRes, photoRes, copyRes, photoTurnRes, copyTurnRes]) {
    if (!response.ok()) {
      throw new Error(
        `读取 outputs 失败: status=${response.status()} body=${await response.text()}`,
      );
    }
  }

  const snapshotPayload = (await snapshotRes.json()) as { outputs?: unknown };
  const photoPayload = (await photoRes.json()) as { data?: unknown };
  const copyPayload = (await copyRes.json()) as { data?: unknown };
  const photoTurnPayload = (await photoTurnRes.json()) as { data?: unknown };
  const copyTurnPayload = (await copyTurnRes.json()) as { data?: unknown };

  state.snapshotOutputs = toOutputList(snapshotPayload.outputs);
  state.outputsByKind = {
    photo: toOutputList(photoPayload.data),
    copy: toOutputList(copyPayload.data),
  };
  state.outputsByTurn = {
    photo: toOutputList(photoTurnPayload.data),
    copy: toOutputList(copyTurnPayload.data),
  };
});

Then('会话快照中的 outputs 数应为 {int}', async ({ bddState }, expected) => {
  const state = getState(bddState);
  const outputs = state.snapshotOutputs || [];
  expect(outputs.length).toBe(expected);
});

Then('outputs 列表按 kind {string} 过滤应仅返回 {int} 条', async ({ bddState }, kindRaw, expected) => {
  const state = getState(bddState);
  const kind = kindRaw === 'photo' ? 'photo' : 'copy';
  const outputs = state.outputsByKind?.[kind] || [];
  expect(outputs.length).toBe(expected);
  const allMatched = outputs.every((item) => item.kind === kind);
  expect(allMatched).toBeTruthy();
});

Then('outputs 列表按 photo turnId 过滤应返回 {int} 条 photo 输出', async ({ bddState }, expected) => {
  const state = getState(bddState);
  const outputs = state.outputsByTurn?.photo || [];
  expect(outputs.length).toBe(expected);

  const allMatched = outputs.every(
    (item) => item.kind === 'photo' && item.turnId === state.photoTurnId,
  );
  expect(allMatched).toBeTruthy();

  expect(outputs[0]?.id).toBe(state.photoOutputId);
});

Then('outputs 列表按 copy turnId 过滤应返回 {int} 条 copy 输出', async ({ bddState }, expected) => {
  const state = getState(bddState);
  const outputs = state.outputsByTurn?.copy || [];
  expect(outputs.length).toBe(expected);

  const allMatched = outputs.every(
    (item) => item.kind === 'copy' && item.turnId === state.copyTurnId,
  );
  expect(allMatched).toBeTruthy();

  expect(outputs[0]?.id).toBe(state.copyOutputId);
});
