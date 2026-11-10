import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Sandbox has a preinstalled Chromium that may not match this Playwright's expected revision.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
  },
});
