import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// PW_CHROMIUM_PATH if set, else the sandbox's preinstalled Chromium, else Playwright's own download.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(preinstalled) ? preinstalled : undefined);

const port = process.env.WP_PORT ?? '8888';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    launchOptions: {
      executablePath,
    },
  },
  webServer: {
    command: 'npm run wp:start',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
