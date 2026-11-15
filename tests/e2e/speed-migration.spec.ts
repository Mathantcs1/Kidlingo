// Data v9 (Plan 5D Task 3): a v8 save opens unchanged as v9; speed fields in a v9 save survive a reload and a hand-edited
// out-of-range speed is repaired keeping the clip's duration; a save from the next version (10) shows the
// newer-version notice and its stored bytes never change.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PPS, clipEl, trackErrors } from './helpers';
import { savedProject, writeSaved } from './overlay-helpers';
import { setupPip } from './pip-helpers';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(60_000);

const tone = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'tone')!);

async function reload(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
}

test('a v8 save opens as v9 with the same clips and no speed fields, and is re-saved as v9', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = await savedProject(page);
  expect(cur?.version).toBe(CURRENT_VERSION);
  const v8 = { ...cur!, version: 8 };
  await writeSaved(page, v8);
  await reload(page);
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  const p = await page.evaluate(() => window.__clipforge!.getState().history.present);
  expect(p.version).toBe(CURRENT_VERSION);
  expect(p.tracks).toEqual(v8.tracks);
  for (const c of p.tracks.flatMap((t) => t.clips)) for (const k of ['speed', 'reverse', 'speedKeys', 'preservePitch', 'freeze']) expect(k in c).toBe(false);
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  expect((await savedProject(page))?.version).toBe(CURRENT_VERSION);
  expect(errors).toEqual([]);
});

test('speed fields in a v9 save survive a reload; the timeline length follows the speed', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const before = await tone(page); // 0..2 s of footage at speed 1
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'tone' ? { ...c, speed: 2, reverse: true as const } : c)) })) })));
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await reload(page);
  const after = await tone(page);
  expect([after.speed, after.reverse, after.in, after.out]).toEqual([2, true, before.in, before.out]);
  // The 2 s of footage at 2x lasts 1 s: the clip's drawn width on the timeline (60 px per second), not a recomputation.
  const box = await clipEl(page, 'tone').boundingBox();
  expect(box!.width / PPS).toBeCloseTo(1, 1);
  expect(errors).toEqual([]);
});

test('a hand-edited speed above 4 opens clamped to 4 with the same duration', async ({ page }) => {
  await setupPip(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = await savedProject(page);
  // 2 s of footage at "speed 10" lasts 0.2 s; clamped to 4x it must still last 0.2 s: 0.8 s of footage.
  const hand = { ...cur!, tracks: cur!.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'tone' ? { ...c, speed: 10 } : c)) })) };
  await writeSaved(page, hand);
  await reload(page);
  const c = await tone(page);
  expect(c.speed).toBe(4);
  expect(c.in).toBe(0);
  expect(c.out).toBeCloseTo(0.8, 9);
});

test('a save from the next version shows the newer-version notice and its stored bytes never change', async ({ page }) => {
  await setupPip(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = await savedProject(page);
  const future = { ...cur!, version: CURRENT_VERSION + 1, futureField: { a: 1 }, tracks: cur!.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, speed: 99, reverse: 'maybe' })) })) };
  await writeSaved(page, future);
  const bytes = JSON.stringify(await savedProject(page));
  await reload(page);
  await expect(page.getByTestId('restore-failed')).toContainText('saved by a newer version');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.waitForTimeout(1500);
  expect(JSON.stringify(await savedProject(page))).toBe(bytes);
});
