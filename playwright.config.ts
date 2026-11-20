import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:3210',
    channel: process.env.CAMPUS_TEST_BROWSER_CHANNEL,
    viewport: { width: 1366, height: 768 },
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: 'npm run start -- --hostname 127.0.0.1 --port 3210',
      url: 'http://127.0.0.1:3210/api/health',
      env: { AI_API_KEY: '', AI_MODEL: '' },
    },
    {
      command: 'npm run start -- --hostname 127.0.0.1 --port 3211',
      url: 'http://127.0.0.1:3211/api/health',
      env: { AI_API_KEY: 'playwright-placeholder', AI_MODEL: 'e2e', AI_API_BASE_URL: 'http://127.0.0.1:3212/v1' },
    },
  ],
});
