import type { Page } from '@playwright/test';
import { expect, Given, Then, When } from './fixtures';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function openContextMenuForFirstSession(page: Page): Promise<void> {
  const firstSession = page.getByTestId('agent-session-item').first();
  await expect(firstSession).toBeVisible();
  await firstSession.click({ button: 'right' });
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

Given('Agent 会话列表已清空', async ({ page, request }) => {
  const listRes = await request.get('/api/agent/sessions');
  expect(listRes.ok()).toBeTruthy();

  const payload = (await listRes.json()) as {
    data?: Array<{ id?: string | null }>;
  };

  for (const session of payload.data || []) {
    if (!session.id) continue;
    const deleteRes = await request.delete(`/api/agent/sessions/${session.id}`);
    expect(deleteRes.ok()).toBeTruthy();
  }

  await page.reload();
  await expect.poll(() => getActiveSessionCount(page)).toBe(0);
});

When('我新建一个会话', async ({ page }) => {
  const before = await getActiveSessionCount(page);
  await page.getByRole('button', { name: '新建' }).click();
  await expect
    .poll(() => getActiveSessionCount(page), {
      message: '等待活跃会话数量增加',
    })
    .toBe(before + 1);
});

Then('会话列表里应该出现 {int} 个活跃会话', async ({ page }, expected) => {
  await expect.poll(() => getActiveSessionCount(page)).toBe(expected);
});

Then('当前状态栏应该显示 {string}', async ({ page }, status) => {
  await expect(page.getByTestId('agent-conversation-status')).toContainText(
    new RegExp(`当前状态：\\s*${escapeRegExp(status)}`),
  );
});

When('我把当前会话归档', async ({ page }) => {
  await openContextMenuForFirstSession(page);
  await clickContextMenuAction(page, '归档');
});

When('我展开已归档会话并恢复当前会话', async ({ page }) => {
  const archivedToggle = page.getByTestId('agent-archived-toggle');
  await expect(archivedToggle).toBeVisible();
  await archivedToggle.click();

  await openContextMenuForFirstSession(page);
  await clickContextMenuAction(page, '取消归档');
});

When('我删除当前会话', async ({ page }) => {
  await openContextMenuForFirstSession(page);
  await clickContextMenuAction(page, '删除');

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

When('我发送消息 {string}', async ({ page }, text) => {
  await page.getByPlaceholder('输入消息').fill(text);
  await page.getByRole('button', { name: '发送任务' }).click();
});

Then('我应该看到错误提示包含 {string}', async ({ page }, keyword) => {
  await expect(page.getByRole('alert')).toContainText(keyword);
});
