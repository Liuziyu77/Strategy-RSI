import { defineConfig } from '@playwright/test';
const executablePath = process.env.CHROMIUM_PATH;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:3931',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3931/api/health',
    timeout: 60000,
    reuseExistingServer: false,
    env: { PORT: '3931', HOST: '127.0.0.1', DATA_DIR: `/tmp/sanguosha-e2e-${Date.now()}` },
  },
});
