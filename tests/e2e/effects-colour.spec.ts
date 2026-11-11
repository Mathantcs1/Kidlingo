// The fused colour effect (Plan 4 Task 4) through the real compositor, checked against the CPU reference colourPixel.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, px, render } from './harness-helpers';
import { PARAM_EXTREMES, colour, edgeImage, expected, gradientImage, overBackdrops, straight } from './colour-helpers';
import type { Rgb } from './colour-helpers';
import { fitTransform } from '../../src/core/merge';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';

const dir = ensureFixtures();
const FORMAT = { width: 64, height: 64, fps: 30 };

const SAMPLES: Record<string, number>[] = [
  { brightness: 0.2, contrast: 0.3, saturation: -0.4 },
  { exposure: 1, temperature: 0.6, tint: -0.5 },
  { exposure: -1.3, hue: 120, shadows: 0.7, highlights: -0.6 },
  { contrast: -0.5, saturation: 0.8, hue: -45, brightness: -0.1, temperature: -0.8, tint: 0.4 },
];

function renderEffects(page: Page, p: Project, times: number[]) {
  return page.evaluate(({ p, times }) => window.cf.renderEffects(p, times), { p, times });
}

const imageProject = (m: MediaRef, effects: VideoEffect[]): Project =>
  project(FORMAT, [m], [clipOf(m, { out: 1, effects })]);

function worstDiff(a: number[], b: number[]): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

test('defaults leave solid red, mid-grey and white unchanged (one pass each)', async ({ page }) => {
  await openHarness(page);
  for (const rgb of [[255, 0, 0], [128, 128, 128], [255, 255, 255]] as Rgb[]) {
    const m = await page.evaluate((rgb) => window.cf.putImageMedia(64, 64, rgb), rgb);
    const r = await renderEffects(page, imageProject(m, [colour()]), [0]);
    expect(r.error).toBeNull();
    expect(r.passes).toEqual([1]);
    const [plain] = await render(page, imageProject(m, []), [0]);
    expect(worstDiff(r.frames[0].data, plain.data), `defaults on ${rgb}`).toBeLessThanOrEqual(1);
    expectNear(px(r.frames[0], 32, 32), rgb, 1, `defaults on ${rgb}`);
  }
});

test('sample params match the CPU reference within 3/255 on every pixel, upright', async ({ page }) => {
  await openHarness(page);
  const TL: Rgb = [200, 40, 10];
  const m = await page.evaluate((TL) => window.cf.putImageMedia(64, 64, TL, { right: [10, 120, 250], bottom: [128, 128, 128] }), TL);
  const [plain] = await render(page, imageProject(m, []), [0]);
  let worst = 0;
  for (const params of SAMPLES) {
    const r = await renderEffects(page, imageProject(m, [colour(params)]), [0]);
    expect(r.error).toBeNull();
    const f = r.frames[0];
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const want = expected(px(plain, x, y), params);
        const got = px(f, x, y);
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(got[k] - want[k]));
      }
    }
    expect(worst, `GL vs colourPixel for ${JSON.stringify(params)}`).toBeLessThanOrEqual(3);
  }
  console.log(`colour effect: max |GL − colourPixel| = ${worst.toFixed(3)} / 255`);
});

test('every param alone at its min and max, and the combined sets, match the reference over a gradient', async ({ page }) => {
  await openHarness(page);
  const m = await gradientImage(page);
  const format = { width: 256, height: 48, fps: 30 };
  const sets = [...PARAM_EXTREMES, ...SAMPLES, {}];
  // One clip per param set, one after the other: a single compositor renders them all (one frame each).
  const clips = sets.map((params, i) => clipOf(m, { start: i, out: 1, effects: [colour(params)] }));
  const r = await renderEffects(page, project(format, [m], clips), sets.map((_, i) => i + 0.5));
  expect(r.error).toBeNull();
  const [plain] = await render(page, project(format, [m], [clipOf(m, { out: 1 })]), [0]);
  // Identity at defaults over the whole grey ramp: all 256 levels within 1/255 (and the fixture is the ramp).
  const identity = r.frames[sets.length - 1];
  for (let x = 0; x < 256; x++) {
    expectNear(px(plain, x, 8), [x, x, x], 1, `ramp level ${x}`);
    expectNear(px(identity, x, 8), px(plain, x, 8), 1, `defaults at level ${x}`);
  }
  let worst = 0;
  for (const [i, params] of sets.entries()) {
    let setWorst = 0;
    for (let y = 0; y < 48; y += 2) {
      for (let x = 0; x < 256; x++) {
        const want = expected(px(plain, x, y), params);
        const got = px(r.frames[i], x, y);
        for (let k = 0; k < 3; k++) setWorst = Math.max(setWorst, Math.abs(got[k] - want[k]));
      }
    }
    expect(setWorst, `GL vs colourPixel over the gradient for ${JSON.stringify(params)}`).toBeLessThanOrEqual(3);
    worst = Math.max(worst, setWorst);
  }
  console.log(`colour effect gradient: max |GL − colourPixel| over ${sets.length} param sets = ${worst.toFixed(3)} / 255`);
});

test('a 50 %- and a 15 %-alpha edge keep their colour and alpha: no premultiplied halo', async ({ page }) => {
  await openHarness(page);
  const C: Rgb = [200, 120, 60];
  const edge = await edgeImage(page, C);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const params = { brightness: 0.15, contrast: 0.3, exposure: 0.5, temperature: 0.3 };
  const plain = overBackdrops(edge, white, [], FORMAT);
  const fxd = overBackdrops(edge, white, [colour(params)], FORMAT);
  const [plainB] = await render(page, plain[0], [0]);
  const [plainW] = await render(page, plain[1], [0]);
  const fxB = (await renderEffects(page, fxd[0], [0])).frames[0];
  const fxW = (await renderEffects(page, fxd[1], [0])).frames[0];
  const worst = { 0.5: 0, 0.15: 0 };
  for (const y of [4, 32, 60]) {
    // Opaque interior: the reference applied to the measured input.
    expectNear(px(fxB, 16, y), expected(px(plainB, 16, y), params), 3, `opaque interior at y=${y}`);
    for (const [x, alpha] of [[33, 0.5], [36, 0.5], [39, 0.5], [40, 0.15], [43, 0.15]] as const) {
      const before = straight(plainB, plainW, x, y);
      const after = straight(fxB, fxW, x, y);
      expect(Math.abs(before.a - alpha), `fixture alpha at ${x}`).toBeLessThan(0.03);
      expect(Math.abs(after.a - before.a), `alpha at ${x},${y}`).toBeLessThanOrEqual(1.5 / 255);
      // RGBA8 premultiplied storage keeps c·a to ±0.5/255, so straight colour is known to ~±0.5/(255·a) per texture
      // hop, and the black/white read-back adds as much again: the tolerance is 1.5/a (3/255 at 50 %, 10/255 at 15 %).
      const want = expected(before.rgb, params);
      expectNear(after.rgb, want, 1.5 / alpha, `edge colour at ${x},${y} (alpha ${alpha})`);
      for (let k = 0; k < 3; k++) worst[alpha] = Math.max(worst[alpha], Math.abs(after.rgb[k] - want[k]));
    }
    // Fully transparent stays transparent: the white backdrop shows through untouched.
    expectNear(px(fxW, 56, y), [255, 255, 255], 0, `transparent at y=${y}`);
  }
  console.log(`colour effect edge: max straight-colour error = ${worst[0.5].toFixed(3)} (50 %), ${worst[0.15].toFixed(3)} (15 %) / 255`);
});

test('a rotated phone video stays upright under a colour effect and matches the reference', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'quad-cw90.mp4')]);
  const size = { width: m.width!, height: m.height! };
  const params = SAMPLES[2];
  const p = (effects: VideoEffect[]) =>
    project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
  const fxd = await renderEffects(page, p([colour(params)]), [0.5]);
  expect(fxd.error).toBeNull();
  expect(fxd.passes).toEqual([1]);
  const [plain] = await render(page, p([]), [0.5]);
  const { width: w, height: h } = size;
  for (const [x, y] of [[w / 4, h / 4], [(3 * w) / 4, h / 4], [w / 4, (3 * h) / 4], [(3 * w) / 4, (3 * h) / 4]]) {
    const at = [Math.floor(x), Math.floor(y)] as const;
    expectNear(px(fxd.frames[0], ...at), expected(px(plain, ...at), params), 3, `quadrant at ${at}`);
  }
  // The four quadrants stay distinct after the effect (no flip collapsed them onto each other).
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => px(fxd.frames[0], x, y).join());
  expect(new Set(corners).size).toBe(4);
});
