// Proves the ClipForge buyer zip really runs: build it, unzip it somewhere else, start its launcher and load the
// app in Chromium. Run with `npm run test:e2e:zip` (needs no WordPress server). CLIPFORGE_PORT overrides the port.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const repoRoot = join(__dirname, '..', '..', '..');
const port = process.env.CLIPFORGE_PORT ?? '8123';
const INSTALL_MESSAGE = 'Install Python 3 (python.org) or Node.js (nodejs.org), then run this again';

let work = '';
let unzipped = '';
let launcher: ChildProcess | undefined;

test.beforeAll(() => {
  test.setTimeout(300_000);
  work = mkdtempSync(join(tmpdir(), 'clipforge-zip-e2e-'));
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'package-clipforge.mjs'), '--version', '1.0.0', '--out', work], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  unzipped = join(work, 'unzipped');
  execFileSync('unzip', ['-q', join(work, 'ClipForge-1.0.0.zip'), '-d', unzipped]);
});

test.afterEach(() => {
  if (launcher?.pid) {
    try {
      process.kill(-launcher.pid, 'SIGTERM'); // the launcher runs in its own process group
    } catch {
      /* already gone */
    }
  }
  launcher = undefined;
});

test.afterAll(() => rmSync(work, { recursive: true, force: true }));

async function waitForServer(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`launcher did not serve ${url}`);
}

test('the unzipped launcher serves an app that loads, shows ClipForge and can write to OPFS', async ({ page }) => {
  launcher = spawn(join(unzipped, 'start-linux.sh'), [], {
    cwd: tmpdir(), // the launcher must work no matter where it is started from
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, CLIPFORGE_NO_OPEN: '1', CLIPFORGE_PORT: port },
  });
  const url = `http://localhost:${port}/`;
  await waitForServer(url);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'ClipForge' })).toBeVisible();
  await expect(page.getByText('Import', { exact: true })).toBeVisible();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('file-input')).toBeEnabled();
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveCount(0);

  const written = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle('zip-check.txt', { create: true });
    const w = await handle.createWritable();
    await w.write('ok');
    await w.close();
    const text = await (await handle.getFile()).text();
    await dir.removeEntry('zip-check.txt');
    return text;
  });
  expect(written).toBe('ok');
  expect(errors).toEqual([]);
});

test('with no Python or Node on PATH the launcher prints the install message and exits non-zero', () => {
  const r = spawnSync(join(unzipped, 'start-linux.sh'), [], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { PATH: '', CLIPFORGE_NO_OPEN: '1', CLIPFORGE_PORT: port },
  });
  expect(r.error).toBeUndefined();
  expect(r.status).not.toBe(0);
  expect(`${r.stdout}${r.stderr}`).toContain(INSTALL_MESSAGE);
});
