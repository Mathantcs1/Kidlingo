// Handing the editor between tabs: exactly one tab becomes the editor, in place, with no reload loop — even when
// documents load slowly (the window in which a reload-based handover used to bounce between tabs).
import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { addToTimeline, importFiles, open, withAudio } from './helpers';

const session = (p: Page): Promise<string | null> => p.getByTestId('app').getAttribute('data-session');

function countNavigations(p: Page): { n: number } {
  const c = { n: 0 };
  p.on('framenavigated', (f) => {
    if (f === p.mainFrame()) c.n++;
  });
  return c;
}

async function slowDocuments(context: BrowserContext): Promise<void> {
  await context.route(
    (u) => u.pathname === '/',
    async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    },
  );
}

async function editorWithClip(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
}

async function locked(context: BrowserContext): Promise<Page> {
  const p = await context.newPage();
  await p.goto('/');
  await expect(p.getByTestId('app')).toHaveAttribute('data-session', 'locked');
  return p;
}

test('reloading the editor tab while another tab waits hands over once, without a reload loop', async ({ page, context }) => {
  await editorWithClip(page);
  const b = await locked(context);
  await slowDocuments(context);
  const navA = countNavigations(page);
  const navB = countNavigations(b);
  await page.reload();
  await page.waitForTimeout(4000);
  const states = [await session(page), await session(b)];
  expect(states.filter((s) => s === 'ready')).toHaveLength(1);
  expect(states.filter((s) => s === 'locked')).toHaveLength(1);
  expect(navA.n).toBeLessThanOrEqual(1);
  expect(navB.n).toBeLessThanOrEqual(1);
  const winner = states[0] === 'ready' ? page : b;
  await expect(winner.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(winner.getByTestId('timeline-clip')).not.toHaveAttribute('data-missing', 'true');
});

test('closing the editor with two tabs waiting makes exactly one the editor; the other stays locked and still', async ({ page, context }) => {
  await editorWithClip(page);
  const b = await locked(context);
  const c = await locked(context);
  await slowDocuments(context);
  const navB = countNavigations(b);
  const navC = countNavigations(c);
  await page.close();
  await expect.poll(async () => [await session(b), await session(c)].filter((s) => s === 'ready').length).toBe(1);
  await b.waitForTimeout(3000);
  const states = [await session(b), await session(c)];
  expect([...states].sort()).toEqual(['locked', 'ready']);
  expect(navB.n).toBe(0);
  expect(navC.n).toBe(0);
  const [winner, loser] = states[0] === 'ready' ? [b, c] : [c, b];
  await expect(winner.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(loser.getByTestId('app')).toHaveAttribute('data-session', 'locked');
  await expect(winner.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(winner.getByTestId('file-input')).toBeEnabled();
  await expect(loser.getByTestId('session-locked')).toBeVisible();

  // The next handover works too: closing the winner hands the editor to the remaining tab.
  await winner.close();
  await expect(loser.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(loser.getByTestId('timeline-clip')).toHaveCount(1);
});

test('a tab taking over shows loading (not the locked notice) while it restores', async ({ page, context }) => {
  await editorWithClip(page);
  // Slow restores from now on: reconciling each media file waits 1.5 s.
  await context.addInitScript(() => {
    const real = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (this: FileSystemDirectoryHandle, name: string, opts?: FileSystemGetFileOptions) {
      if (this.name === 'clipforge-media' && !opts?.create) await new Promise((r) => setTimeout(r, 1500));
      return real.call(this, name, opts);
    };
  });
  const b = await locked(context);
  await page.close();
  await expect(b.getByTestId('app')).toHaveAttribute('data-session', 'loading');
  await expect(b.getByTestId('session-locked')).toHaveCount(0);
  await expect(b.getByTestId('file-input')).toBeDisabled();
  await expect(b.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(b.getByTestId('timeline-clip')).toHaveCount(1);
});
