// DRIFT GUARD of the blur family (Plan 4 Task 7): every param alone at its min and max, the defaults and combined sets
// through the real compositor, per pixel against the CPU references of blurRef.ts (≤ 3/255: calibrated on SwiftShader,
// where GL and CPU agree to ≤ 1/255; real GPUs filter with ~8-bit fractional weights, ≈ 1/255 more, doubled by sharpen
// amount 2); soft alpha edges
// (15 % / 50 %) keep their straight colour (no premultiplied halo); a rotated phone video blurs upright.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, render } from './harness-helpers';
import { overBackdrops, straight } from './colour-helpers';
import {
  TEXTURE, extremes, floatImage, fx, opaque, rectImage, reference, renderEffects, textureImage, worstDiff, worstVsReference,
} from './blur-helpers';
import type { BlurType, Rect } from './blur-helpers';
import { fitTransform } from '../../src/core/merge';
import type { VideoEffect } from '../../src/core/model';

const dir = ensureFixtures();
const COMBINED: Record<BlurType, Record<string, number>[]> = {
  blur: [{ radius: 30 }, { radius: 3 }],
  sharpen: [{ amount: 1.3, radius: 2.5 }, { amount: 2, radius: 5 }],
  glow: [{ threshold: 0.4, radius: 60, intensity: 1.5 }, { threshold: 0.9, radius: 8, intensity: 2 }],
  pixelate: [{ size: 37 }, { size: 5 }],
};

for (const type of ['blur', 'sharpen', 'glow', 'pixelate'] as const) {
  test(`${type}: each param at its min and max, the defaults and combined sets match the CPU reference per pixel`, async ({ page }) => {
    test.setTimeout(120_000);
    await openHarness(page);
    const m = await textureImage(page);
    const sets = [...extremes(type), {}, ...COMBINED[type]];
    const clips = sets.map((params, i) => clipOf(m, { start: i, out: 1, effects: [fx(type, params)] }));
    const r = await renderEffects(page, project(TEXTURE, [m], clips), sets.map((_, i) => i + 0.5));
    expect(r.error).toBeNull();
    expect(r.unavailable).toEqual([]);
    const [plain] = await render(page, project(TEXTURE, [m], [clipOf(m, { out: 1 })]), [0]);
    const img = opaque(plain);
    let worst = 0;
    for (const [i, params] of sets.entries()) {
      const err = worstVsReference(r.frames[i], reference(type, img, params));
      expect(err, `${type} ${JSON.stringify(params)}: |GL − reference|`).toBeLessThanOrEqual(3);
      worst = Math.max(worst, err);
    }
    console.log(`${type}: max |GL − reference| over ${sets.length} param sets = ${worst.toFixed(3)} / 255`);
  });
}

test('soft 50 % and 15 % alpha edges: blur, sharpen and glow match the reference in straight colour and alpha (no halo)', async ({ page }) => {
  await openHarness(page);
  const C = [200, 120, 60];
  const format = { width: 64, height: 540, fps: 30 };
  const band = (x: number, w: number, a: number): Rect => [x, 0, w, 540, [C[0], C[1], C[2], a]];
  const edge = await rectImage(page, 64, 540, [band(0, 32, 1), band(32, 8, 0.5), band(40, 4, 0.15)]);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 540, [255, 255, 255]));
  const [plainB, plainW] = await Promise.all(overBackdrops(edge, white, [], format).map(async (p) => (await render(page, p, [0]))[0]));
  const input = floatImage(64, 540, (x, y) => straight(plainB, plainW, x, y));
  const cases: [BlurType, Record<string, number>][] = [
    ['blur', { radius: 30 }], ['sharpen', { amount: 1, radius: 5 }], ['glow', { threshold: 0, radius: 30, intensity: 1 }],
  ];
  for (const [type, params] of cases) {
    const effects: VideoEffect[] = [fx(type, params)];
    const [b, w] = await Promise.all(
      overBackdrops(edge, white, effects, format).map(async (p) => (await renderEffects(page, p, [0])).frames[0]),
    );
    const ref = reference(type, input, params);
    let worst = 0;
    for (const y of [10, 270, 530]) {
      for (let x = 0; x < 64; x++) {
        const got = straight(b, w, x, y);
        const i = (y * 64 + x) * 4;
        const a = ref.data[i + 3];
        expect(Math.abs(got.a - a), `${type} alpha at ${x},${y}`).toBeLessThanOrEqual(2 / 255);
        if (a < 0.1) continue;
        for (let k = 0; k < 3; k++) {
          const err = Math.abs(got.rgb[k] - (ref.data[i + k] / a) * 255);
          // Straight colour from RGBA8 premultiplied storage is known to ~±0.5/(255·a) per stored hop (1.5/a in all).
          expect(err, `${type} straight colour at ${x},${y} (alpha ${a.toFixed(3)})`).toBeLessThanOrEqual(1.5 / a + 1);
          worst = Math.max(worst, err * a);
        }
        // Blur and sharpen never change the colour of a uniformly coloured edge (that would be a halo).
        if (type === 'glow') continue;
        for (let k = 0; k < 3; k++) {
          expect(Math.abs(got.rgb[k] - C[k]), `${type} halo at ${x},${y}`).toBeLessThanOrEqual(1.5 / a + 1);
        }
      }
    }
    console.log(`${type} edge: max straight-colour error × alpha = ${worst.toFixed(3)} / 255`);
  }
});

// sharpen and glow composite against the effect's INPUT (u_input through its uv rows): a rotated or mirrored source
// checks those rows (a transposed or untranslated matrix would composite a wrongly oriented picture).
const ORIENTED: [BlurType, Record<string, number>][] = [
  ['blur', { radius: 200 }], ['pixelate', { size: 150 }], ['sharpen', { amount: 2, radius: 5 }],
  ['glow', { threshold: 0.3, radius: 60, intensity: 1 }],
];

for (const file of ['quad-cw90.mp4', 'quad-cw90-hflip.mp4']) {
  test(`a rotated${file.includes('hflip') ? ', mirrored' : ''} phone video: every blur-family effect matches the reference on the upright frame`, async ({ page }) => {
    test.setTimeout(90_000);
    await openHarness(page);
    const [m] = await importPaths(page, [join(dir, file)]);
    const size = { width: m.width!, height: m.height! };
    const p = (effects: VideoEffect[]) =>
      project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
    const [plain] = await render(page, p([]), [0.5]);
    for (const [type, params] of ORIENTED) {
      const r = await renderEffects(page, p([fx(type, params)]), [0.5]);
      expect(r.error).toBeNull();
      const err = worstVsReference(r.frames[0], reference(type, opaque(plain), params));
      console.log(`${file} ${type}: max |GL − reference| = ${err.toFixed(3)} / 255`);
      // The effect really changed the picture (sharpen radius 5 is only 0.6 px at 128 rows: hardly visible there).
      if (type !== 'sharpen') expect(worstDiff(plain, r.frames[0]), `${file} ${type} changed the frame`).toBeGreaterThan(50);
      expect(err, `${file} ${type}`).toBeLessThanOrEqual(3);
    }
  });
}
