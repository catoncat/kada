import { expect } from '@playwright/test';
import { createBdd, test as base } from 'playwright-bdd';

export const test = base.extend<{
  workspacePath: string;
}>({
  workspacePath: async ({ page: _page }, use) => {
    await use('/workspace');
  },
});

export const { Given, When, Then } = createBdd(test);
export { expect };
