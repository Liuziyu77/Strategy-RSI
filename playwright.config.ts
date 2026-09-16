import { defineConfig } from '@playwright/test';
const executablePath = process.env.CHROMIUM_PATH;
const port = process.env.E2E_PORT ?? '3931';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${port}/api/health`,
    timeout: 60000,
    reuseExistingServer: false,
    env: { PORT: port, HOST: '127.0.0.1', DATA_DIR: `/tmp/sanguosha-e2e-${Date.now()}` },
  },
});
