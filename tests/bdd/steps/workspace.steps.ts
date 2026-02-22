import type { APIRequestContext, Page } from '@playwright/test';
import { expect, Given, Then, When } from './fixtures';

type WorkspaceBddState = Record<string, unknown> & {
  currentSessionId?: string;
  archivedSessionId?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWorkspaceState(input: Record<string, unknown>): WorkspaceBddState {
  return input as WorkspaceBddState;
}

async function getActiveSessionCount(page: Page): Promise<number> {
  const text =
    (await page.getByTestId('agent-active-session-count').textContent()) || '';
  const match = text.match(/(\d+)\s*个活跃线程/);
  if (!match) {
    throw new Error(`无法解析活跃会话数量: ${text}`);
  }
  return Number(match[1]);
}

function getSessionItemLocator(
  page: Page,
  input: {
    sessionId: string;
    bucket?: 'active' | 'archived';
    state?: 'current' | 'idle';
  },
) {
  let selector = `[data-testid="agent-session-item"][data-session-id="${input.sessionId}"]`;
  if (input.bucket) {
    selector += `[data-session-bucket="${input.bucket}"]`;
  }
  if (input.state) {
    selector += `[data-session-state="${input.state}"]`;
  }
  return page.locator(selector).first();
}

async function readCurrentSessionId(page: Page): Promise<string | null> {
  const marker = page.getByTestId('agent-current-session-marker');
  await expect(marker).toBeAttached();
  const sessionId = await marker.getAttribute('data-session-id');
  return sessionId && sessionId.trim() ? sessionId.trim() : null;
}

async function requireCurrentSessionId(page: Page): Promise<string> {
  const sessionId = await readCurrentSessionId(page);
  if (!sessionId) {
    throw new Error('未找到当前会话标识');
  }
  return sessionId;
}

async function openContextMenuForSession(
  page: Page,
  input: {
    sessionId: string;
    bucket?: 'active' | 'archived';
    state?: 'current' | 'idle';
  },
): Promise<void> {
  const sessionItem = getSessionItemLocator(page, input);
  await expect(sessionItem).toBeVisible();
  await sessionItem.click({ button: 'right' });
}

async function clearSessionWith409Handling(
  request: APIRequestContext,
  sessionId: string,
): Promise<void> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const deleteRes = await request.delete(`/api/agent/sessions/${sessionId}`);
    if (deleteRes.ok() || deleteRes.status() === 404) {
      return;
    }

    if (deleteRes.status() === 409) {
      const abortRes = await request.post(`/api/agent/sessions/${sessionId}/abort`, {
        data: {},
      });
      if (!(abortRes.ok() || abortRes.status() === 404 || abortRes.status() === 409)) {
        throw new Error(
          `中断运行中会话失败: sessionId=${sessionId} status=${abortRes.status()} body=${await abortRes.text()}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
      continue;
    }

    throw new Error(
      `删除会话失败: sessionId=${sessionId} status=${deleteRes.status()} body=${await deleteRes.text()}`,
    );
  }

  throw new Error(`删除会话超时: sessionId=${sessionId}`);
}

async function clickContextMenuAction(page: Page, label: string): Promise<void> {
  const action = page
    .locator('[data-slot="context-menu-item"]')
    .filter({ hasText: label })
    .first();
  await expect(action).toBeVisible();
  await action.click();
}

Given('我在 Chat 工作台页面', async ({ page, workspacePath }) => {
  await page.goto(workspacePath);
  await expect(page.getByRole('heading', { name: '会话' })).toBeVisible();
});

Given('Agent 会话列表已清空', async ({ page, request, bddState }) => {
  const state = getWorkspaceState(bddState);
  const listRes = await request.get('/api/agent/sessions');
  expect(listRes.ok()).toBeTruthy();

  const payload = (await listRes.json()) as {
    data?: Array<{ id?: string | null }>;
  };

  for (const session of payload.data || []) {
    if (!session.id) continue;
    await clearSessionWith409Handling(request, session.id);
  }

  state.currentSessionId = undefined;
  state.archivedSessionId = undefined;
  await page.reload();
  await expect.poll(() => getActiveSessionCount(page)).toBe(0);
});

When('我新建一个会话', async ({ page, bddState }) => {
  const state = getWorkspaceState(bddState);
  const before = await getActiveSessionCount(page);
  await page.getByRole('button', { name: '新建' }).click();
  await expect
    .poll(() => getActiveSessionCount(page), {
      message: '等待活跃会话数量增加',
    })
    .toBe(before + 1);

  await expect.poll(() => readCurrentSessionId(page)).not.toBeNull();
  state.currentSessionId = await requireCurrentSessionId(page);
});

Then('会话列表里应该出现 {int} 个活跃会话', async ({ page }, expected) => {
  await expect.poll(() => getActiveSessionCount(page)).toBe(expected);
});

Then('当前状态栏应该显示 {string}', async ({ page }, status) => {
  await expect(page.getByTestId('agent-conversation-status')).toContainText(
    new RegExp(`当前状态：\\s*${escapeRegExp(status)}`),
  );
});

Then('当前会话应被选中', async ({ page, bddState }) => {
  const state = getWorkspaceState(bddState);
  const currentSessionId = await requireCurrentSessionId(page);
  const currentItems = page.locator(
    '[data-testid="agent-session-item"][data-session-state="current"]',
  );
  await expect(currentItems).toHaveCount(1);
  await expect(
    getSessionItemLocator(page, {
      sessionId: currentSessionId,
      state: 'current',
    }),
  ).toBeVisible();
  state.currentSessionId = currentSessionId;
});

When('我把当前会话归档', async ({ page, bddState }) => {
  const state = getWorkspaceState(bddState);
  const currentSessionId = await requireCurrentSessionId(page);
  state.currentSessionId = currentSessionId;
  state.archivedSessionId = currentSessionId;

  await openContextMenuForSession(page, {
    sessionId: currentSessionId,
    state: 'current',
  });
  await clickContextMenuAction(page, '归档');
});

When('我展开已归档会话并恢复当前会话', async ({ page, bddState }) => {
  const state = getWorkspaceState(bddState);
  const targetSessionId = state.archivedSessionId;
  if (!targetSessionId) {
    throw new Error('缺少归档目标会话 ID');
  }

  const archivedToggle = page.getByTestId('agent-archived-toggle');
  await expect(archivedToggle).toBeVisible();
  await archivedToggle.click();

  await openContextMenuForSession(page, {
    sessionId: targetSessionId,
    bucket: 'archived',
  });
  await clickContextMenuAction(page, '取消归档');

  await expect(
    getSessionItemLocator(page, {
      sessionId: targetSessionId,
      bucket: 'active',
    }),
  ).toBeVisible();
  state.currentSessionId = await requireCurrentSessionId(page);
});

When('我删除当前会话', async ({ page, bddState }) => {
  const state = getWorkspaceState(bddState);
  const currentSessionId = await requireCurrentSessionId(page);
  state.currentSessionId = currentSessionId;

  await openContextMenuForSession(page, {
    sessionId: currentSessionId,
    state: 'current',
  });
  await clickContextMenuAction(page, '删除');

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  state.currentSessionId = undefined;
  state.archivedSessionId = undefined;
});

When('我发送消息 {string}', async ({ page }, text) => {
  await page.getByPlaceholder('输入消息').fill(text);
  await page.getByRole('button', { name: '发送任务' }).click();
});

Then('我应该看到错误提示包含 {string}', async ({ page }, keyword) => {
  await expect(page.getByRole('alert')).toContainText(keyword);
});
