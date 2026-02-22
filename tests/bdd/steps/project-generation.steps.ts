import { expect, Given, Then, When } from './fixtures';

type BddState = Record<string, unknown> & {
  sceneId?: string;
  projectId?: string;
  previewPrompt?: string;
  planTaskId?: string;
  planTaskStatus?: string;
  imageTaskId?: string;
  imageTaskStatus?: string;
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

Given('我准备了可用于生成的项目上下文', async ({ request, bddState }) => {
  const state = getState(bddState);

  const sceneRes = await request.post('/api/assets/scenes', {
    data: {
      name: uniqueName('bdd-scene'),
      description: 'BDD 测试场景',
      defaultLighting: '自然侧光',
      isOutdoor: false,
      tags: ['bdd'],
    },
  });
  expect(sceneRes.ok()).toBeTruthy();
  const scene = (await sceneRes.json()) as { id?: string };
  expect(typeof scene.id).toBe('string');

  const projectRes = await request.post('/api/projects', {
    data: {
      title: uniqueName('bdd-project'),
    },
  });
  expect(projectRes.status()).toBe(201);
  const project = (await projectRes.json()) as { id?: string };
  expect(typeof project.id).toBe('string');

  const updateRes = await request.put(`/api/projects/${project.id}`, {
    data: {
      selectedScene: scene.id,
      projectPrompt: '新春温暖电影感儿童写真',
    },
  });
  expect(updateRes.ok()).toBeTruthy();

  state.sceneId = scene.id;
  state.projectId = project.id;
});

When('我预览预案生成提示词', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.projectId).toBe('string');

  const previewRes = await request.post(`/api/projects/${state.projectId}/generate`, {
    data: {
      mode: 'preview',
    },
  });
  expect(previewRes.ok()).toBeTruthy();

  const payload = (await previewRes.json()) as { prompt?: string };
  state.previewPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';
});

Then('预览结果应包含非空 prompt', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.previewPrompt).toBe('string');
  expect((state.previewPrompt || '').trim().length).toBeGreaterThan(20);
});

When('我执行预案生成任务', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.projectId).toBe('string');

  const executeRes = await request.post(`/api/projects/${state.projectId}/generate`, {
    data: {
      mode: 'execute',
    },
  });

  expect([200, 201]).toContain(executeRes.status());
  const payload = (await executeRes.json()) as {
    taskId?: string;
    status?: string;
  };

  state.planTaskId = payload.taskId;
  state.planTaskStatus = payload.status;
});

Then('系统应返回 pending 的预案任务', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.planTaskId).toBe('string');
  expect(state.planTaskStatus).toBe('pending');
});

Then('项目任务列表应包含该预案任务', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.projectId).toBe('string');
  expect(typeof state.planTaskId).toBe('string');

  const listRes = await request.get(`/api/projects/${state.projectId}/tasks`);
  expect(listRes.ok()).toBeTruthy();
  const payload = (await listRes.json()) as {
    tasks?: Array<{ id?: string; type?: string }>;
  };

  const matched = (payload.tasks || []).find(
    (task) => task.id === state.planTaskId && task.type === 'plan-generation',
  );
  expect(Boolean(matched)).toBeTruthy();
});

When('我创建图片生成任务', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.projectId).toBe('string');

  const createRes = await request.post('/api/tasks', {
    data: {
      type: 'image-generation',
      input: {
        prompt: '用于 BDD 的图片任务',
        owner: {
          type: 'planScene',
          id: state.projectId,
          slot: 'scene:0',
        },
      },
      relatedId: state.projectId,
      relatedMeta: JSON.stringify({
        sceneIndex: 0,
      }),
    },
  });

  expect(createRes.status()).toBe(201);
  const payload = (await createRes.json()) as {
    task?: { id?: string; status?: string };
  };

  state.imageTaskId = payload.task?.id;
  state.imageTaskStatus = payload.task?.status;
});

Then('系统应返回 pending 的图片任务', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.imageTaskId).toBe('string');
  expect(state.imageTaskStatus).toBe('pending');
});

Then('图片任务详情的恢复上下文应标记为 {string}', async ({ request, bddState }, expected) => {
  const state = getState(bddState);
  expect(typeof state.imageTaskId).toBe('string');

  const detailRes = await request.get(`/api/tasks/${state.imageTaskId}/detail`);
  expect(detailRes.ok()).toBeTruthy();
  const payload = (await detailRes.json()) as {
    detail?: {
      recoveryContext?: {
        sourceType?: string;
      };
    };
  };

  expect(payload.detail?.recoveryContext?.sourceType).toBe(expected);
});
