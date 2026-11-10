import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Chromium to launch: PW_CHROMIUM_PATH if set, else the sandbox's preinstalled build (which may not match this
// Playwright's expected revision), else Playwright's own download. The swiftshader flags give headless Chromium a
// software WebGL2; --no-sandbox is needed when running as root in a container.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  // Runs against the production build via playwright.preview.config.ts (npm run e2e:preview).
  testIgnore: /preview-build\.spec\.ts/,
  globalSetup: './tests/e2e/global-setup.ts',
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
