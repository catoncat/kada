import { defineConfig, devices } from '@playwright/test';
import { cucumberReporter, defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  featuresRoot: 'tests/bdd',
  features: 'tests/bdd/features/**/*.feature',
  steps: 'tests/bdd/steps/**/*.ts',
  missingSteps: 'fail-on-gen',
  aiFix: {
    promptAttachment: true,
  },
});

export default defineConfig({
  testDir,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    cucumberReporter('json', {
      outputFile: 'test-results/cucumber-bdd.json',
    }),
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'bash -lc "rm -rf .tmp/bdd-data && mkdir -p .tmp/bdd-data && DATA_DIR=$PWD/.tmp/bdd-data pnpm dev:all"',
    url: 'http://localhost:1420/workspace',
    timeout: 180_000,
    reuseExistingServer: process.env.BDD_REUSE_SERVER === '1',
  },
});
