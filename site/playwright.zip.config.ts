import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Config for the ClipForge buyer-zip check only (npm run test:e2e:zip). Unlike playwright.config.ts it starts no
// WordPress server: the test unzips the package and runs its own launcher.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync(preinstalled) ? preinstalled : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /zip-runs\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
