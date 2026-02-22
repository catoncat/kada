import { expect } from '@playwright/test';
import { createBdd, test as base } from 'playwright-bdd';

export const test = base.extend<{
  workspacePath: string;
  bddState: Record<string, unknown>;
}>({
  workspacePath: async ({ page: _page }, use) => {
    await use('/workspace');
  },
  bddState: async ({ page: _page }, use) => {
    await use({});
  },
});

export const { Given, When, Then } = createBdd(test);
export { expect };
