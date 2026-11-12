// Plan 5 Task 6: transform keyframes in the inspector (stopwatch, key toggle, prev/next, strip) and the keyed
// on-canvas drag. The pip project: a 200×200 lime square ('pip', 0..2 s, scale 1, centred) over a blue background.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { playerState, toast, trackErrors } from './helpers';
import { canvasBox, expectPixel, isBlue, isGreen, setupPip, toPage, undoDepth } from './pip-helpers';
import type { Pt } from './pip-helpers';

test.setTimeout(90_000);

const C = { x: 960, y: 540 };
const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const projectJson = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const pipKeys = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.keys);
const scaleKeys = async (page: Page) => ((await pipKeys(page))?.scale ?? []).map((k) => [k.t, Math.round(k.v * 1000) / 1000]);
const field = (page: Page, key: string) => page.getByTestId(`inspector-${key}`);

async function typeInto(page: Page, key: string, value: string): Promise<void> {
  await field(page, key).fill(value);
  await field(page, key).press('Enter');
}

/** Scale keyed 1 (0.5 s) → 2 (1.5 s) through the UI: stopwatch at 0.5 s, then a typed value at 1.5 s. */
async function keyScale(page: Page): Promise<void> {
  await setTime(page, 0.5);
  const d = await undoDepth(page);
  await page.getByTestId('kf-toggle-scale').click();
  await expect(page.getByTestId('kf-toggle-scale')).toHaveAttribute('aria-pressed', 'true');
  expect(await undoDepth(page)).toBe(d + 1);
  expect(await scaleKeys(page)).toEqual([[0.5, 1]]);
  await setTime(page, 1.5);
  await typeInto(page, 'scale', '200');
  await expect.poll(() => scaleKeys(page)).toEqual([[0.5, 1], [1.5, 2]]);
  expect(await undoDepth(page)).toBe(d + 2);
}

/** A downsampled snapshot of the preview canvas (every 4th pixel, RGB). */
function snapshot(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = c.width;
    o.height = c.height;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 16) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  });
}

const maxDiff = (a: number[], b: number[]): number => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

test('stopwatch, a second typed key, interpolation in the preview and the field, keyed drag, stopwatch off', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyScale(page);

  // Halfway (1.0 s): scale 1.5 => the square's half-size is 150 format px.
  await setTime(page, 1);
  await expect(field(page, 'scale')).toHaveValue('150');
  await expectPixel(page, C.x + 130, C.y, isGreen, 'interpolated size');
  await expectPixel(page, C.x + 170, C.y, isBlue, 'interpolated size');
  // Scrubbing: the field follows the playhead.
  await setTime(page, 0.8);
  await expect(field(page, 'scale')).toHaveValue('130');
  await setTime(page, 1);
  await expect(field(page, 'scale')).toHaveValue('150');

  // On-canvas corner drag at 1.0 s: from the corner (150, 150) out to (200, 200) => scale 2, a THIRD key, ONE step.
  const b = await canvasBox(page);
  const from: Pt = toPage(b, { x: C.x + 150, y: C.y + 150 });
  const to: Pt = toPage(b, { x: C.x + 200, y: C.y + 200 });
  const depth = await undoDepth(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expectPixel(page, C.x + 180, C.y, isGreen, 'live drag preview');
  await page.waitForTimeout(150);
  const live = await snapshot(page);
  expect(await undoDepth(page)).toBe(depth);
  await page.mouse.up();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  const keys = await scaleKeys(page);
  expect(keys.map(([t]) => t)).toEqual([0.5, 1, 1.5]);
  expect(Math.abs(keys[1][1] - 2)).toBeLessThan(0.03);
  await page.waitForTimeout(150);
  expect(maxDiff(live, await snapshot(page)), 'live preview equals the committed frame').toBeLessThanOrEqual(1);

  // Stopwatch off at 0.8 s: the value shown there (1 + 0.6 × (key 2 − 1)) stays, keys go, ONE step; undo restores the
  // keys exactly.
  await setTime(page, 0.8);
  const want = 100 * (1 + 0.6 * (keys[1][1] - 1));
  await expect.poll(async () => Math.abs(Number(await field(page, 'scale').inputValue()) - want)).toBeLessThan(0.1);
  const shown = await field(page, 'scale').inputValue();
  const keyed = await projectJson(page);
  await page.getByTestId('kf-toggle-scale').click();
  await expect(page.getByTestId('kf-toggle-scale')).toHaveAttribute('aria-pressed', 'false');
  expect(await undoDepth(page)).toBe(depth + 2);
  expect(await pipKeys(page)).toBeUndefined();
  await expect(field(page, 'scale')).toHaveValue(shown);
  await setTime(page, 1.5);
  await expect(field(page, 'scale')).toHaveValue(shown);
  await page.getByTestId('btn-undo').click();
  expect(await projectJson(page)).toBe(keyed);
  expect(errors).toEqual([]);
});

test('typing with the playhead off the clip is refused with a toast; a locked layer disables the controls', async ({ page }) => {
  await setupPip(page);
  await keyScale(page);
  await setTime(page, 3);
  const before = await projectJson(page);
  await typeInto(page, 'scale', '50');
  await expect(toast(page)).toContainText('Move the playhead onto the clip to set a keyframe');
  expect(await projectJson(page)).toBe(before);
  await expect(field(page, 'scale')).toHaveValue('200');

  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, locked: true } : t)) }));
  });
  for (const id of ['kf-toggle-scale', 'kf-key-scale', 'kf-toggle-position', 'kf-key-opacity', 'inspector-scale']) {
    await expect(page.getByTestId(id), id).toBeDisabled();
  }
});

test('prev/next, the key toggle and the strip move between keys; Escape cancels a keyed drag', async ({ page }) => {
  await setupPip(page);
  await keyScale(page);
  await setTime(page, 1);
  await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'false');
  const d = await undoDepth(page);
  await page.getByTestId('kf-next-scale').click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeCloseTo(1.5, 6);
  await expect(page.getByTestId('kf-key-scale')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('kf-next-scale')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('kf-prev-scale').click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeCloseTo(0.5, 6);
  await expect(page.getByTestId('kf-prev-scale')).toHaveAttribute('aria-disabled', 'true');
  const strip = page.getByTestId('kf-strip-scale').getByTestId('kf-strip-key');
  await expect(strip).toHaveCount(2);
  await strip.nth(1).click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeCloseTo(1.5, 6);
  expect(await undoDepth(page)).toBe(d);

  // Key toggle at 1.0 s adds a key holding the shown value (picture unchanged), again removes it: one step each.
  await setTime(page, 1);
  await page.getByTestId('kf-key-scale').click();
  await expect.poll(() => scaleKeys(page)).toEqual([[0.5, 1], [1, 1.5], [1.5, 2]]);
  await page.getByTestId('kf-key-scale').click();
  await expect.poll(() => scaleKeys(page)).toEqual([[0.5, 1], [1.5, 2]]);
  expect(await undoDepth(page)).toBe(d + 2);

  // Escape mid-drag: nothing committed, the preview goes back.
  const before = await projectJson(page);
  const b = await canvasBox(page);
  const from = toPage(b, { x: C.x + 150, y: C.y + 150 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 60, { steps: 6 });
  await expectPixel(page, C.x + 170, C.y, isGreen, 'live drag');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expectPixel(page, C.x + 170, C.y, isBlue, 'cancelled drag');
  expect(await projectJson(page)).toBe(before);
  expect(await undoDepth(page)).toBe(d + 2);

  // An edit that replaces only the clip's keys (here: opacity keys) ends the drag: the release commits nothing.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 60, { steps: 6 });
  await page.evaluate(() => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, keys: { ...c.keys, opacity: [{ t: 0, v: 1, ease: { kind: 'linear' as const } }] } } : c)),
      })),
    }));
  });
  await page.mouse.up();
  expect(await undoDepth(page)).toBe(d + 3);
  expect(await scaleKeys(page)).toEqual([[0.5, 1], [1.5, 2]]);

  // Keyed rotation takes multi-turn values in the field.
  await expect(field(page, 'rotation')).toHaveAttribute('aria-valuemax', '180');
  await page.getByTestId('kf-toggle-rotation').click();
  await expect(field(page, 'rotation')).toHaveAttribute('aria-valuemax', '36000');
});

test('Space plays from a mouse-focused stopwatch; adjustment layers offer opacity only, overlays all four', async ({ page }) => {
  await setupPip(page);
  await page.getByTestId('kf-toggle-opacity').click();
  await expect(page.getByTestId('kf-toggle-opacity')).toBeFocused();
  const d = await undoDepth(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(false);
  expect(await undoDepth(page)).toBe(d);
  await expect(page.getByTestId('kf-toggle-opacity')).toHaveAttribute('aria-pressed', 'true');

  await setTime(page, 0.5);
  await page.getByTestId('overlay-add').click();
  await page.getByTestId('overlay-add-adjustment').click();
  await expect(page.getByTestId('kf-toggle-opacity')).toBeVisible();
  for (const prop of ['position', 'scale', 'rotation']) await expect(page.getByTestId(`kf-toggle-${prop}`)).toHaveCount(0);
  await page.getByTestId('overlay-add').click();
  await page.getByTestId('overlay-add-lowerThird').click();
  for (const prop of ['position', 'scale', 'rotation', 'opacity']) await expect(page.getByTestId(`kf-toggle-${prop}`)).toBeVisible();
});
