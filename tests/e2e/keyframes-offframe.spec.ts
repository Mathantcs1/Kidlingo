// Ruling P5-6: a split at a playhead that is not a whole number of frames from the clip start leaves the right half's
// keys off its own frame grid. Keys under the playhead are matched by frame window, so `]` / Next reach every key,
// typing at a diamond replaces that key and moves it to the frame start (P5-7: the frame shows exactly the typed value),
// and the key toggle removes it. The pip project: a 200×200 lime square ('pip',
// 0..2 s, scale 1, centred) over a blue background.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isGreen, setupPip, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const C = { x: 960, y: 540 };
const CUT = 0.71; // 21.3 frames at 30 fps
const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const playhead = (page: Page) => page.evaluate(() => window.__clipforge!.getState().playhead);
const field = (page: Page, key: string) => page.getByTestId(`inspector-${key}`);
const rightHalf = (page: Page) =>
  page.evaluate((cut) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => Math.abs(c.start - cut) < 1e-9)!, CUT);
const scaleKeys = async (page: Page) => ((await rightHalf(page)).keys?.scale ?? []).map((k) => [k.t, Math.round(k.v * 1000) / 1000]);

/** Scale keyed 1 (0.5 s) → 1.5 (1.2 s) → 2 (1.7 s), split at 0.71 s with the toolbar; the right half selected. */
async function splitAnimated(page: Page): Promise<void> {
  await setupPip(page);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    const lin = { kind: 'linear' as const };
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, keys: { scale: [{ t: 0.5, v: 1, ease: lin }, { t: 1.2, v: 1.5, ease: lin }, { t: 1.7, v: 2, ease: lin }] } } : c)),
      })),
    }));
  });
  await setTime(page, CUT);
  await page.getByTestId('btn-split').click();
  const id = (await rightHalf(page)).id;
  await page.evaluate((id) => window.__clipforge!.getState().select([id]), id);
  await setTime(page, CUT);
  await expect(page.getByTestId('kf-toggle-scale')).toHaveAttribute('aria-pressed', 'true');
}

test('`]` and Next reach every off-frame key in order and never get stuck; `[` goes back', async ({ page }) => {
  const errors = trackErrors(page);
  await splitAnimated(page);
  await page.getByTestId('btn-split').focus();
  for (const want of [1.2, 1.7]) {
    await page.keyboard.press(']');
    await expect.poll(() => playhead(page)).toBeCloseTo(want, 6);
    await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByTestId('kf-next-scale')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('[');
  await expect.poll(() => playhead(page)).toBeCloseTo(1.2, 6);
  await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'true');
  // The inspector Next from the clip start: the same keys, strictly forward.
  await setTime(page, CUT);
  for (const want of [1.2, 1.7]) {
    await page.getByTestId('kf-next-scale').click();
    await expect.poll(() => playhead(page)).toBeCloseTo(want, 6);
  }
  await page.getByTestId('kf-prev-scale').click();
  await expect.poll(() => playhead(page)).toBeCloseTo(1.2, 6);
  expect(errors).toEqual([]);
});

test('typing at an off-frame diamond replaces that key at the frame start: that frame shows exactly the typed value (P5-7)', async ({ page }) => {
  const errors = trackErrors(page);
  await splitAnimated(page);
  const before = await scaleKeys(page);
  expect(before).toEqual([[0.5, 1], [1.2, 1.5], [1.7, 2]]);
  await page.getByTestId('btn-split').focus();
  await page.keyboard.press(']');
  await expect.poll(() => playhead(page)).toBeCloseTo(1.2, 6);
  await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'true');

  const depth = await undoDepth(page);
  await field(page, 'scale').fill('250');
  await field(page, 'scale').press('Enter');
  // The key moved to its frame's start, CUT + 14 frames (1.1767 s, 0.7 frame earlier), with the typed value.
  const u = CUT + 14 / 30;
  await expect.poll(async () => (await scaleKeys(page)).length).toBe(3);
  const after = await scaleKeys(page);
  expect(after[0]).toEqual([0.5, 1]);
  expect(after[1][0]).toBeCloseTo(u, 9);
  expect(after[1][1]).toBe(2.5);
  expect(after[2]).toEqual([1.7, 2]);
  expect(await undoDepth(page)).toBe(depth + 1);
  // This frame shows EXACTLY the typed value: field 250 and a half-size of 250 format px (edge 1210, +-2 px).
  await expect(field(page, 'scale')).toHaveValue('250');
  await expectPixel(page, C.x + 248, C.y, isGreen, 'typed value at the key frame');
  await expectPixel(page, C.x + 252, C.y, isBlue, 'typed value at the key frame');
  // ... and the next frame continues from it (2.5 at u → 2 at 1.7 s: 2.4682 at u + 1/30), no jump back to the old 1.5.
  await setTime(page, 1.2 + 1 / 30);
  await expect(field(page, 'scale')).toHaveValue('246.82');
  await expectPixel(page, C.x + 245, C.y, isGreen, 'next frame consistent');
  await expectPixel(page, C.x + 249, C.y, isBlue, 'next frame consistent');

  // Back on the diamond: the key toggle removes THAT key (no near-duplicate added), ONE step.
  await setTime(page, 1.2);
  await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('kf-key-scale').click();
  await expect.poll(() => scaleKeys(page)).toEqual([[0.5, 1], [1.7, 2]]);
  expect(await undoDepth(page)).toBe(depth + 2);
  await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
