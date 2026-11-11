// DRIFT GUARD of the stylise effects (Plan 4 Task 8): every param alone at its min and max (mirror: every mode), the
// defaults and combined sets through the real compositor, per pixel against the CPU references of styliseRef.ts
// (≤ 3/255), on the colour gradient (48 rows: sub-pixel offsets, 1-px cells) and on the 540-row texture (half the
// 1080-row reference); soft alpha edges keep alpha (or move it with the geometry) and their straight colour (no
// halo); a rotated phone video is processed upright.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, px, render } from './harness-helpers';
import { gradientImage, overBackdrops, straight } from './colour-helpers';
import { floatImage, opaque, rectImage, textureImage, worstVsReference } from './blur-helpers';
import type { Rect } from './blur-helpers';
import { STYLISE, driftGuard, renderEffects, sfx, styliseRef } from './stylise-helpers';
import type { StyliseType } from './stylise-helpers';
import { fitTransform } from '../../src/core/merge';
import type { MediaRef, VideoEffect } from '../../src/core/model';

const dir = ensureFixtures();

for (const type of STYLISE) {
  test(`${type}: every param extreme, the defaults and combined sets match the CPU reference per pixel`, async ({ page }) => {
    test.setTimeout(120_000);
    await openHarness(page);
    const worst = [await driftGuard(page, await gradientImage(page), type), await driftGuard(page, await textureImage(page), type)];
    console.log(`${type}: max |GL − reference| = ${worst.map((w) => w.toFixed(3)).join(' (gradient), ')} (texture) / 255`);
  });
}

const C = [200, 120, 60];
const FORMAT = { width: 64, height: 64, fps: 30 };
/** Opaque, 50 % and 15 % alpha bands, then transparent: full-width rows (`rows`) or full-height columns. */
const bands = (rows: boolean): Rect[] => [[0, 32, 1], [32, 8, 0.5], [40, 4, 0.15]].map(([o, w, a]): Rect =>
  (rows ? [0, o, 64, w, [C[0], C[1], C[2], a]] : [o, 0, w, 64, [C[0], C[1], C[2], a]]));

/** Effects whose alpha must be unchanged on the given fixture (horizontal displacement keeps full-width rows). */
const KEEPS_ALPHA: [boolean, StyliseType, Record<string, number>][] = [
  [true, 'invert', { amount: 1 }], [true, 'rgbSplit', { amount: 50, angle: 90 }], [true, 'glitch', { intensity: 1, blockSize: 4 }],
  [true, 'vhs', { scanlines: 1, bleed: 1, noise: 1, wobble: 1 }], [true, 'mirror', { mode: 0 }], [true, 'mirror', { mode: 1 }],
  [false, 'mirror', { mode: 2 }], [false, 'rgbSplit', { amount: 50, angle: 0 }], [false, 'vhs', { scanlines: 1, bleed: 1, noise: 1, wobble: 0 }],
  [false, 'invert', { amount: 0.6 }],
];

test('soft 50 % / 15 % alpha edges: alpha is untouched, straight colour matches the reference, transparency stays', async ({ page }) => {
  test.setTimeout(120_000);
  await openHarness(page);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const fixtures: Record<string, MediaRef> = { rows: await rectImage(page, 64, 64, bands(true)), cols: await rectImage(page, 64, 64, bands(false)) };
  const frame = async (m: MediaRef, effects: VideoEffect[]) =>
    Promise.all(overBackdrops(m, white, effects, FORMAT).map(async (p) => (await renderEffects(page, p, [0.5])).frames[0]));
  const worst = { 0.5: 0, 0.15: 0 };
  for (const [rows, type, params] of KEEPS_ALPHA) {
    const m = fixtures[rows ? 'rows' : 'cols'];
    const [pb, pw] = await frame(m, []);
    const [fb, fw] = await frame(m, [sfx(type, params)]);
    const input = floatImage(64, 64, (x, y) => straight(pb, pw, x, y));
    const ref = styliseRef(type, input, params, 15);
    for (let i = 0; i < 64; i += 3) {
      for (const j of [33, 36, 39, 40, 43]) {
        const [x, y] = rows ? [i, j] : [j, i];
        const before = straight(pb, pw, x, y);
        const after = straight(fb, fw, x, y);
        const what = `${type} ${JSON.stringify(params)} at ${x},${y}`;
        expect(Math.abs(after.a - before.a), `alpha of ${what}`).toBeLessThanOrEqual(1.5 / 255);
        const o = (y * 64 + x) * 4;
        const want = [0, 1, 2].map((k) => (ref.data[o + k] / ref.data[o + 3]) * 255);
        const tol = 1.5 / before.a;
        for (let k = 0; k < 3; k++) {
          const err = Math.abs(after.rgb[k] - want[k]);
          expect(err, `straight colour of ${what}: ${after.rgb} vs ${want}`).toBeLessThanOrEqual(tol);
          const key = before.a > 0.3 ? 0.5 : 0.15;
          worst[key] = Math.max(worst[key], err);
        }
      }
      const [tx, ty] = rows ? [i, 56] : [56, i];
      expect(px(fw, tx, ty), `${type} transparent at ${tx},${ty}`).toEqual([255, 255, 255]);
    }
  }
  console.log(`stylise edges: max straight-colour error = ${worst[0.5].toFixed(3)} (50 %), ${worst[0.15].toFixed(3)} (15 %) / 255`);
});

test('mirror four-way moves alpha with the picture: GL equals the reference in premultiplied RGBA over black', async ({ page }) => {
  await openHarness(page);
  const m = await rectImage(page, 64, 64, bands(false));
  const p = (effects: VideoEffect[]) => project(FORMAT, [m], [clipOf(m, { out: 1, effects })]);
  const [plain] = await render(page, p([]), [0]);
  const fx = (await renderEffects(page, p([sfx('mirror', { mode: 3 })]), [0.5])).frames[0];
  expect(worstVsReference(fx, styliseRef('mirror', opaque(plain), { mode: 3 }, 15))).toBeLessThanOrEqual(1);
  expectNear(px(fx, 60, 5), px(plain, 3, 5), 1, 'opaque left edge mirrored to the right');
});

test('a rotated phone video is mirrored and split upright, matching the reference on the plain render', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'quad-cw90.mp4')]);
  const size = { width: m.width!, height: m.height! };
  const p = (effects: VideoEffect[]) =>
    project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
  const [plain] = await render(page, p([]), [0.5]);
  const img = opaque(plain);
  for (const [type, params] of [['mirror', { mode: 3 }], ['rgbSplit', { amount: 50, angle: 30 }], ['glitch', { intensity: 1 }]] as const) {
    const r = await renderEffects(page, p([sfx(type, params)]), [0.5]);
    expect(r.error).toBeNull();
    expect(r.passes).toEqual([1]);
    expect(worstVsReference(r.frames[0], styliseRef(type, img, params, 15)), `${type} on a rotated video`).toBeLessThanOrEqual(3);
  }
});
