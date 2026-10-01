import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 120000, workers: 1, retries: 0,
  use: { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 }, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 30000 },
  reporter: [['list']],
});
