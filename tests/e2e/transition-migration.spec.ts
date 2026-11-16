// Data v10 (Plan 5C Task 3): a hand-built save with a 9 s transition opens clamped; a transition between clips that do not touch
// is dropped; a save from the next version (11) shows the newer-version notice and its stored bytes never change.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { savedProject, writeSaved } from './overlay-helpers';
import { setupPip } from './pip-helpers';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(60_000);

const lin = { kind: 'linear' };
const v2 = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.find((t) => t.id === 'v2')!);

async function reload(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
}

/** The pip project with a second image clip right after 'pip' (0..2 s, then 2..4 s) and the given transitions on 'v2'. */
async function saveWith(page: Page, second: { start: number }, transitions: unknown[], version = CURRENT_VERSION) {
  await setupPip(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = (await savedProject(page))!;
  const tracks = cur.tracks.map((t) => {
    if (t.id !== 'v2') return t;
    const pip = t.clips[0];
    return { ...t, clips: [pip, { ...pip, id: 'pip2', start: second.start }], transitions };
  });
  const hand = { ...cur, version, tracks, futureField: version > CURRENT_VERSION ? { a: 1 } : undefined };
  await writeSaved(page, JSON.parse(JSON.stringify(hand)));
  return hand;
}

test('a 9 s transition opens clamped to the clips, on whole even frames', async ({ page }) => {
  await saveWith(page, { start: 2 }, [{ id: 't1', fromClipId: 'pip', toClipId: 'pip2', type: 'dissolve', duration: 9, ease: lin }]);
  await reload(page);
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  const t = (await v2(page)).transitions!;
  expect(t).toHaveLength(1);
  expect(t[0].duration).toBeLessThanOrEqual(4 + 1e-9); // half the window must fit in each 2 s clip
  expect(Math.round(t[0].duration * 30) % 2).toBe(0);
  expect((await page.evaluate(() => window.__clipforge!.getState().history.present.version))).toBe(CURRENT_VERSION);
});

test('a transition between clips that do not touch is dropped on open', async ({ page }) => {
  await saveWith(page, { start: 3 }, [{ id: 't1', fromClipId: 'pip', toClipId: 'pip2', type: 'dissolve', duration: 1, ease: lin }]);
  await reload(page);
  expect((await v2(page)).transitions).toBeUndefined();
});

test('a save from the next version shows the newer-version notice and its stored bytes never change', async ({ page }) => {
  await saveWith(page, { start: 2 }, [{ id: 't1', fromClipId: 'pip', toClipId: 'pip2', type: 'melt', duration: 1, ease: lin }], CURRENT_VERSION + 1);
  const bytes = JSON.stringify(await savedProject(page));
  await reload(page);
  await expect(page.getByTestId('restore-failed')).toContainText('saved by a newer version');
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.waitForTimeout(1500);
  expect(JSON.stringify(await savedProject(page))).toBe(bytes);
});
