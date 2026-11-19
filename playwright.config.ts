import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      url: 'http://127.0.0.1:3101/health/ready',
      env: {
        NODE_ENV: 'production',
        PORT: '3101',
        SCAN_MODE: 'demo',
        ETHEREUM_RPC_URL: '',
        TRUSTED_PROXY_CIDRS: '',
        LOG_LEVEL: 'error',
        WEB_ORIGIN: 'http://127.0.0.1:3100',
      },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @wps/web start',
      url: 'http://127.0.0.1:3100',
      env: {
        NODE_ENV: 'production',
        API_PROXY_TARGET: 'http://127.0.0.1:3101',
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: '3100',
        HOSTNAME: '127.0.0.1',
      },
      reuseExistingServer: false,
    },
  ],
});
