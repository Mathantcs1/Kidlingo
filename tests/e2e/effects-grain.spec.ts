// The grain effect (Plan 4 Task 5) through the real compositor: deterministic per clip-relative frame (D6), zero-mean,
// and equal to the CPU reference grainPixel (hash included) pixel for pixel.
import { test, expect } from '@playwright/test';
import { clipOf, expectNear, openHarness, project, px } from './harness-helpers';
import { edgeImage, overBackdrops, straight } from './colour-helpers';
import { look, refLook, renderEffects } from './look-helpers';

const FORMAT = { width: 64, height: 64, fps: 30 };
const GREY = 128;

async function grey(page: import('@playwright/test').Page) {
  return page.evaluate((g) => window.cf.putImageMedia(64, 64, [g, g, g]), GREY);
}

test('the same frame renders byte-identically twice; frames within one project frame match; another frame differs', async ({ page }) => {
  await openHarness(page);
  const m = await grey(page);
  const p = project(FORMAT, [m], [clipOf(m, { out: 2, effects: [look('grain', { amount: 0.3 })] })]);
  const a = await renderEffects(page, p, [0.5]);
  const b = await renderEffects(page, p, [0.5]);
  expect(a.error).toBeNull();
  expect(a.passes).toEqual([1]);
  expect(a.frames[0].data).toEqual(b.frames[0].data);
  // 0.5 s and 0.51 s are both frame 15 at 30 fps: snapped to the frame start, so identical.
  const same = await renderEffects(page, p, [0.51]);
  expect(same.frames[0].data).toEqual(a.frames[0].data);
  const next = await renderEffects(page, p, [0.5 + 1 / 30]);
  let differing = 0;
  for (let i = 0; i < a.frames[0].data.length; i += 4) if (a.frames[0].data[i] !== next.frames[0].data[i]) differing++;
  expect(differing, 'pixels that changed on the next frame').toBeGreaterThan(64 * 64 * 0.5);
});

test('grain is clip-relative: the same clip-relative frame at a different timeline start looks the same', async ({ page }) => {
  await openHarness(page);
  const m = await grey(page);
  const at = (start: number) => project(FORMAT, [m], [clipOf(m, { start, out: 1, effects: [look('grain', { amount: 0.3 })] })]);
  const a = await renderEffects(page, at(0), [0.5]);
  const b = await renderEffects(page, at(3), [3.5]);
  expect(b.frames[0].data).toEqual(a.frames[0].data);
});

test('the mean luminance over a flat area stays within 2 % of the input (zero-mean noise)', async ({ page }) => {
  await openHarness(page);
  const m = await grey(page);
  for (const amount of [0.15, 0.5]) {
    const p = project(FORMAT, [m], [clipOf(m, { out: 1, effects: [look('grain', { amount })] })]);
    const r = await renderEffects(page, p, [0, 0.5]);
    for (const f of r.frames) {
      let sum = 0;
      for (let i = 0; i < f.data.length; i += 4) sum += f.data[i];
      const mean = sum / (f.data.length / 4);
      expect(Math.abs(mean - GREY) / GREY, `mean ${mean} at amount ${amount}`).toBeLessThan(0.02);
    }
  }
});

test('grain matches the CPU reference (hash, cell size, frame) on every pixel', async ({ page }) => {
  await openHarness(page);
  const m = await grey(page);
  const sets: Record<string, number>[] = [{}, { amount: 1 }, { amount: 0.4, size: 1 }, { amount: 0.4, size: 2 }, { amount: 0.4, size: 4 }, { amount: 0.4, size: 1.5 }];
  const clips = sets.map((params, i) => clipOf(m, { start: i, out: 1, effects: [look('grain', params)] }));
  const r = await renderEffects(page, project(FORMAT, [m], clips), sets.map((_, i) => i + 0.5));
  expect(r.error).toBeNull();
  let worst = 0;
  for (const [i, params] of sets.entries()) {
    let setWorst = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const want = refLook('grain', [GREY, GREY, GREY], params, x, y, FORMAT, 15);
        const got = px(r.frames[i], x, y);
        for (let k = 0; k < 3; k++) setWorst = Math.max(setWorst, Math.abs(got[k] - want[k]));
      }
    }
    expect(setWorst, `GL vs grainPixel for ${JSON.stringify(params)}`).toBeLessThanOrEqual(2);
    worst = Math.max(worst, setWorst);
  }
  console.log(`grain: max |GL − grainPixel| over ${sets.length} param sets = ${worst.toFixed(3)} / 255`);
});

test('amount 0 is the identity and grain leaves alpha and transparent pixels alone', async ({ page }) => {
  await openHarness(page);
  const m = await grey(page);
  const none = await renderEffects(page, project(FORMAT, [m], [clipOf(m, { out: 1, effects: [look('grain', { amount: 0 })] })]), [0.5]);
  for (const [x, y] of [[0, 0], [20, 33], [63, 63]]) expectNear(px(none.frames[0], x, y), [GREY, GREY, GREY], 1, `amount 0 at ${x},${y}`);
  const edge = await edgeImage(page, [200, 120, 60]);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const [plainB, plainW] = overBackdrops(edge, white, [], FORMAT);
  const [fxB, fxW] = overBackdrops(edge, white, [look('grain', { amount: 0.5 })], FORMAT);
  const pb = (await renderEffects(page, plainB, [0.5])).frames[0];
  const pw = (await renderEffects(page, plainW, [0.5])).frames[0];
  const gb = (await renderEffects(page, fxB, [0.5])).frames[0];
  const gw = (await renderEffects(page, fxW, [0.5])).frames[0];
  for (const y of [4, 32, 60]) {
    for (const x of [33, 36, 39, 40, 43]) {
      expect(Math.abs(straight(gb, gw, x, y).a - straight(pb, pw, x, y).a), `alpha at ${x},${y}`).toBeLessThanOrEqual(1.5 / 255);
    }
    expectNear(px(gw, 56, y), [255, 255, 255], 0, `transparent at y=${y}`);
  }
});
