import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Production-bundle check: builds the site and serves dist/ with `vite preview` on port 4173. Same Chromium launch
// settings as playwright.config.ts.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /preview-build\.spec\.ts/,
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
