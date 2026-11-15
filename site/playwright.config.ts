import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// PW_CHROMIUM_PATH if set, else the sandbox's preinstalled Chromium, else Playwright's own download.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(preinstalled) ? preinstalled : undefined);

const port = process.env.WP_PORT ?? '8888';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /zip-runs\.spec\.ts/, // needs no WordPress; run via playwright.zip.config.ts (npm run test:e2e:zip)
  timeout: 60_000,
  retries: 0,
  workers: 1, // specs that edit site content (home.spec.ts) share one WordPress; run files one at a time

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
