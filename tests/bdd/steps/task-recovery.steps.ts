import { markTaskFailed } from './helpers/sqlite-db';
import { expect, Given, Then, When } from './fixtures';

type BddState = Record<string, unknown> & {
  failedTaskId?: string;
  failedTaskStatus?: string;
  replaySourceTaskId?: string;
  replayFirstTaskId?: string;
  replaySecondTaskId?: string;
  replaySecondDeduped?: boolean;
  replayMissingRequestIdStatus?: number;
  retryNonFailedTaskId?: string;
  retryNonFailedStatus?: number;
};

function getState(input: Record<string, unknown>): BddState {
  return input as BddState;
}

function uniqueTitle(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

Given('我准备了一个失败的图片任务', async ({ request, bddState }) => {
  const state = getState(bddState);

  const projectRes = await request.post('/api/projects', {
    data: {
      title: uniqueTitle('bdd-recovery-image-project'),
    },
  });
  if (!projectRes.ok()) {
    throw new Error(
      `创建项目失败: status=${projectRes.status()} body=${await projectRes.text()}`,
    );
  }
  const project = (await projectRes.json()) as { id?: string };
  expect(typeof project.id).toBe('string');

  const createTaskRes = await request.post('/api/tasks', {
    data: {
      type: 'image-generation',
      input: {
        prompt: 'bdd recovery image task',
        owner: {
          type: 'planScene',
          id: project.id,
          slot: 'scene:0',
        },
      },
      relatedId: project.id,
      relatedMeta: JSON.stringify({
        sceneIndex: 0,
      }),
    },
  });

  if (createTaskRes.status() !== 201) {
    throw new Error(
      `创建任务失败: status=${createTaskRes.status()} body=${await createTaskRes.text()}`,
    );
  }

  const payload = (await createTaskRes.json()) as {
    task?: { id?: string };
  };

  expect(typeof payload.task?.id).toBe('string');
  const taskId = payload.task?.id as string;

  markTaskFailed(taskId, 'BDD_MANUAL_FAILURE');
  state.failedTaskId = taskId;
  state.failedTaskStatus = 'failed';
});

When('我重试该失败任务', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.failedTaskId).toBe('string');

  const response = await request.post(`/api/tasks/${state.failedTaskId}/retry`);
  if (!response.ok()) {
    throw new Error(
      `重试任务失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    task?: { status?: string };
  };
  state.failedTaskStatus = payload.task?.status;
});

Then('重试后的任务状态应为 {string}', async ({ bddState }, expectedStatus) => {
  const state = getState(bddState);
  expect(state.failedTaskStatus).toBe(expectedStatus);
});

Then('该任务详情恢复上下文 sourceType 应为 {string}', async ({ request, bddState }, expectedSourceType) => {
  const state = getState(bddState);
  expect(typeof state.failedTaskId).toBe('string');

  const response = await request.get(`/api/tasks/${state.failedTaskId}/detail`);
  if (!response.ok()) {
    throw new Error(
      `读取任务详情失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    detail?: {
      recoveryContext?: {
        sourceType?: string;
      };
    };
  };

  expect(payload.detail?.recoveryContext?.sourceType).toBe(expectedSourceType);
});

Given('我准备了一个可重放的预案任务', async ({ request, bddState }) => {
  const state = getState(bddState);

  const providerRes = await request.post('/api/providers', {
    data: {
      name: uniqueTitle('bdd-replay-provider'),
      format: 'local',
      baseUrl: 'http://localhost/local',
      apiKey: '',
      textModel: 'bdd-text-model',
      imageModel: 'bdd-image-model',
      isDefault: false,
      isBuiltin: false,
    },
  });
  if (providerRes.status() !== 201) {
    throw new Error(
      `创建 provider 失败: status=${providerRes.status()} body=${await providerRes.text()}`,
    );
  }
  const providerPayload = (await providerRes.json()) as {
    provider?: { id?: string };
  };
  expect(typeof providerPayload.provider?.id).toBe('string');
  const providerId = providerPayload.provider?.id as string;

  const projectRes = await request.post('/api/projects', {
    data: {
      title: uniqueTitle('bdd-replay-project'),
    },
  });
  if (!projectRes.ok()) {
    throw new Error(
      `创建项目失败: status=${projectRes.status()} body=${await projectRes.text()}`,
    );
  }

  const project = (await projectRes.json()) as { id?: string };
  expect(typeof project.id).toBe('string');

  const createTaskRes = await request.post('/api/tasks', {
    data: {
      type: 'plan-generation',
      input: {
        projectId: project.id,
        providerId,
      },
      relatedId: project.id,
    },
  });

  if (createTaskRes.status() !== 201) {
    throw new Error(
      `创建可重放任务失败: status=${createTaskRes.status()} body=${await createTaskRes.text()}`,
    );
  }

  const payload = (await createTaskRes.json()) as {
    task?: { id?: string };
  };

  expect(typeof payload.task?.id).toBe('string');
  state.replaySourceTaskId = payload.task?.id;
  state.replayFirstTaskId = undefined;
  state.replaySecondTaskId = undefined;
  state.replaySecondDeduped = undefined;
  state.replayMissingRequestIdStatus = undefined;
});

When('我以 requestId {string} 重放该任务', async ({ request, bddState }, requestId) => {
  const state = getState(bddState);
  expect(typeof state.replaySourceTaskId).toBe('string');

  const response = await request.post(
    `/api/tasks/${state.replaySourceTaskId}/replay`,
    {
      data: {
        requestId,
      },
    },
  );

  if (response.status() !== 201) {
    throw new Error(
      `首次重放任务失败: status=${response.status()} body=${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    task?: { id?: string };
    deduped?: boolean;
  };

  expect(payload.deduped).toBe(false);
  expect(typeof payload.task?.id).toBe('string');
  const firstReplayTaskId = payload.task?.id as string;
  expect(firstReplayTaskId).not.toBe(state.replaySourceTaskId);

  state.replayFirstTaskId = firstReplayTaskId;
});

When(
  '我再次以相同 requestId {string} 重放该任务',
  async ({ request, bddState }, requestId) => {
    const state = getState(bddState);
    expect(typeof state.replaySourceTaskId).toBe('string');

    const response = await request.post(
      `/api/tasks/${state.replaySourceTaskId}/replay`,
      {
        data: {
          requestId,
        },
      },
    );

    if (response.status() !== 200) {
      throw new Error(
        `二次重放任务失败: status=${response.status()} body=${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      task?: { id?: string };
      deduped?: boolean;
    };

    expect(typeof payload.deduped).toBe('boolean');
    expect(payload.deduped).toBe(true);
    expect(typeof payload.task?.id).toBe('string');

    state.replaySecondTaskId = payload.task?.id;
    state.replaySecondDeduped = payload.deduped;
  },
);

Then('第二次重放应返回 deduped 为 true', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.replaySecondDeduped).toBe('boolean');
  expect(state.replaySecondDeduped).toBe(true);
});

Then('两次重放返回的任务 ID 应一致', async ({ bddState }) => {
  const state = getState(bddState);
  expect(typeof state.replayFirstTaskId).toBe('string');
  expect(typeof state.replaySecondTaskId).toBe('string');
  expect(state.replayFirstTaskId).toBe(state.replaySecondTaskId);
});

When('我重放该任务但不传 requestId', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.replaySourceTaskId).toBe('string');

  const response = await request.post(`/api/tasks/${state.replaySourceTaskId}/replay`, {
    data: {},
  });

  state.replayMissingRequestIdStatus = response.status();
});

Then('重放请求应返回 400', async ({ bddState }) => {
  const state = getState(bddState);
  expect(state.replayMissingRequestIdStatus).toBe(400);
});

Given('我准备了一个非 failed 的图片任务', async ({ request, bddState }) => {
  const state = getState(bddState);

  const projectRes = await request.post('/api/projects', {
    data: {
      title: uniqueTitle('bdd-retry-non-failed-project'),
    },
  });
  if (!projectRes.ok()) {
    throw new Error(
      `创建项目失败: status=${projectRes.status()} body=${await projectRes.text()}`,
    );
  }

  const project = (await projectRes.json()) as { id?: string };
  expect(typeof project.id).toBe('string');

  const createTaskRes = await request.post('/api/tasks', {
    data: {
      type: 'image-generation',
      input: {
        prompt: 'bdd retry non failed image task',
        owner: {
          type: 'planScene',
          id: project.id,
          slot: 'scene:0',
        },
      },
      relatedId: project.id,
      relatedMeta: JSON.stringify({
        sceneIndex: 0,
      }),
    },
  });

  if (createTaskRes.status() !== 201) {
    throw new Error(
      `创建任务失败: status=${createTaskRes.status()} body=${await createTaskRes.text()}`,
    );
  }

  const payload = (await createTaskRes.json()) as {
    task?: { id?: string };
  };

  expect(typeof payload.task?.id).toBe('string');
  state.retryNonFailedTaskId = payload.task?.id;
  state.retryNonFailedStatus = undefined;
});

When('我重试该非 failed 任务', async ({ request, bddState }) => {
  const state = getState(bddState);
  expect(typeof state.retryNonFailedTaskId).toBe('string');

  const response = await request.post(`/api/tasks/${state.retryNonFailedTaskId}/retry`);
  state.retryNonFailedStatus = response.status();
});

Then('重试请求应返回 400', async ({ bddState }) => {
  const state = getState(bddState);
  expect(state.retryNonFailedStatus).toBe(400);
});
