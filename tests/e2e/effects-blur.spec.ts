// The blur family (Plan 4 Task 7: blur, sharpen, glow, pixelate) through the real compositor: energy, identity,
// blocks, thresholds and the GL resource bounds. Per-pixel drift guards and alpha edges: effects-blur-reference.spec.ts.
// Radii and block sizes are in pixels of a 1080-row reference picture (blurRadius / pixelBlock in blurMath.ts), so
// fixtures either are 1080 rows tall (radius = working pixels) or the expected size is scaled by height / 1080.
import { test, expect } from '@playwright/test';
import { clipOf, openHarness, project, px, render } from './harness-helpers';
import { gradientImage } from './colour-helpers';
import { effectWorkingSize } from '../../src/render/effects/pipeline';
import type { VideoEffect } from '../../src/core/model';
import { energy, fx, rectImage, renderEffects, worstDiff } from './blur-helpers';
import type { Pixels } from './blur-helpers';

const WHITE = [255, 255, 255, 1] as [number, number, number, number];
const BLACK = [0, 0, 0, 1] as [number, number, number, number];
const GRADIENT = { width: 256, height: 48, fps: 30 };

const row = (f: Pixels, y: number): number[] => Array.from({ length: f.width }, (_, x) => px(f, x, y)[0]);
const col = (f: Pixels, x: number): number[] => Array.from({ length: f.height }, (_, y) => px(f, x, y)[0]);

test('blur widens a 1-px white line but keeps its total luminance within 2 % (both directions, 1080 rows)', async ({ page }) => {
  await openHarness(page);
  const format = { width: 64, height: 1080, fps: 30 };
  const vertical = await rectImage(page, 64, 1080, [[0, 0, 64, 1080, BLACK], [32, 0, 1, 1080, WHITE]]);
  const horizontal = await rectImage(page, 64, 1080, [[0, 0, 64, 1080, BLACK], [0, 540, 64, 1, WHITE]]);
  const clips = [
    clipOf(vertical, { start: 0, out: 1, effects: [fx('blur')] }), clipOf(horizontal, { start: 1, out: 1, effects: [fx('blur')] }),
  ];
  const r = await renderEffects(page, project(format, [vertical, horizontal], clips), [0.5, 1.5]);
  expect(r.error).toBeNull();
  for (const [i, profile, length] of [[0, row(r.frames[0], 540), 1080], [1, col(r.frames[1], 32), 64]] as const) {
    const lineEnergy = 3 * 255 * length;
    const e = energy(r.frames[i]);
    console.log(`blur line ${i}: energy ratio ${(e / lineEnergy).toFixed(4)}`);
    expect(Math.abs(e / lineEnergy - 1), `frame ${i}: energy ${e} vs ${lineEnergy}`).toBeLessThan(0.02);
    // Radius 8 at 1080 rows is sigma 4: the line spreads over ~±9 pixels and its peak drops to ~0.1 of white.
    expect(profile.filter((v) => v > 2).length, `frame ${i} spread: ${profile}`).toBeGreaterThanOrEqual(9);
    expect(Math.max(...profile), `frame ${i} peak`).toBeLessThan(64);
  }
});

test('blur radius 0, sharpen amount 0, glow intensity 0 or radius 0 and pixelate size 1 are the identity (no pass)', async ({ page }) => {
  await openHarness(page);
  const m = await gradientImage(page);
  const stacks = [
    [fx('blur', { radius: 0 })], [fx('sharpen', { amount: 0 })], [fx('glow', { intensity: 0 })],
    [fx('glow', { radius: 0, threshold: 0 })], [fx('pixelate', { size: 1 })],
    [fx('blur', { radius: 0 }), fx('sharpen', { amount: 0 }), fx('glow', { intensity: 0 }), fx('pixelate', { size: 1 })],
  ];
  const clips = stacks.map((effects, i) => clipOf(m, { start: i, out: 1, effects }));
  const r = await renderEffects(page, project(GRADIENT, [m], clips), stacks.map((_, i) => i + 0.5));
  expect(r.error).toBeNull();
  const [plain] = await render(page, project(GRADIENT, [m], [clipOf(m, { out: 1 })]), [0]);
  for (const [i, f] of r.frames.entries()) expect(worstDiff(f, plain), `stack ${i}`).toBeLessThanOrEqual(1);
  expect(r.passes.at(-1)).toBe(0);
});

test('pixelate: every block is constant and takes the colour of its centre pixel, anchored at the top-left', async ({ page }) => {
  await openHarness(page);
  const m = await gradientImage(page);
  // The gradient is 48 rows tall, so size 225 (1080-row pixels) is a block of 225 × 48 / 1080 = 10 working pixels:
  // 256×48 leaves partial last blocks (6 columns, 8 rows), so any other anchoring than the top-left is visible.
  const effects = [fx('pixelate', { size: 225 })];
  const r = await renderEffects(page, project(GRADIENT, [m], [clipOf(m, { out: 1, effects })]), [0]);
  expect(r.error).toBeNull();
  expect(r.passes).toEqual([1]);
  const [plain] = await render(page, project(GRADIENT, [m], [clipOf(m, { out: 1 })]), [0]);
  const f = r.frames[0];
  const wrong: string[] = [];
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 256; x++) {
      const want = px(plain, Math.min(255, x - (x % 10) + 5), Math.min(47, y - (y % 10) + 5));
      if (px(f, x, y).join() !== want.join()) wrong.push(`${x},${y}: ${px(f, x, y)} vs ${want}`);
    }
  }
  expect(wrong.slice(0, 5), `${wrong.length} pixels differ from their block centre`).toEqual([]);
});

test('glow adds light only around pixels brighter than the threshold', async ({ page }) => {
  await openHarness(page);
  // 216 rows: radius 100 (1080-row pixels) is 20 working pixels. A white square (luma 1) and a grey one (luma 0.5).
  const format = { width: 128, height: 216, fps: 30 };
  const m = await rectImage(page, 128, 216, [[0, 0, 128, 216, BLACK], [56, 30, 16, 16, WHITE], [56, 160, 16, 16, [128, 128, 128, 1]]]);
  const effects = [fx('glow', { threshold: 0.7, radius: 100, intensity: 1 })];
  const r = await renderEffects(page, project(format, [m], [clipOf(m, { out: 1, effects })]), [0]);
  expect(r.error).toBeNull();
  const [plain] = await render(page, project(format, [m], [clipOf(m, { out: 1 })]), [0]);
  const f = r.frames[0];
  // Around the white square: brighter than the black it was.
  for (const [x, y] of [[63, 22], [48, 38], [80, 38], [63, 54]]) expect(px(f, x, y)[0], `near white at ${x},${y}`).toBeGreaterThan(20);
  // Around and on the grey square, and far from both: unchanged.
  for (const [x, y] of [[63, 152], [48, 168], [80, 168], [63, 184], [63, 168], [10, 200], [120, 110]]) {
    const before = px(plain, x, y);
    const after = px(f, x, y);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(after[k] - before[k]), `unchanged at ${x},${y}: ${after} vs ${before}`).toBeLessThanOrEqual(1);
    }
  }
  expect(energy(f)).toBeGreaterThan(energy(plain));
});

test('two blurs in a row equal one blur of the combined radius (sqrt(r1² + r2²)); a radius beyond the tap cap still conserves', async ({ page }) => {
  await openHarness(page);
  const format = { width: 16, height: 1080, fps: 30 };
  const m = await rectImage(page, 16, 1080, [[0, 0, 16, 1080, BLACK], [0, 538, 16, 4, WHITE]]);
  const stacks = [
    [fx('blur', { radius: 12 }), fx('blur', { radius: 16 })], [fx('blur', { radius: 20 })], [fx('blur', { radius: 100 })],
  ];
  const clips = stacks.map((effects, i) => clipOf(m, { start: i, out: 1, effects }));
  const r = await renderEffects(page, project(format, [m], clips), [0.5, 1.5, 2.5]);
  expect(r.error).toBeNull();
  const [twice, once, wide] = r.frames.map((f) => col(f, 8));
  let worst = 0;
  for (let y = 0; y < 1080; y++) worst = Math.max(worst, Math.abs(twice[y] - once[y]));
  console.log(`blur 12 then 16 vs blur 20: max difference ${worst} / 255`);
  expect(worst).toBeLessThanOrEqual(2);
  // Radius 100 at 1080 rows is sigma 50: strided taps after a pre-blur, still one smooth bump of the same energy.
  const sum = (c: number[]): number => c.reduce((s, v) => s + v, 0);
  expect(Math.abs(sum(wide) / (4 * 255) - 1)).toBeLessThan(0.02);
  for (let y = 541; y < 700; y++) expect(wide[y], `monotonic at ${y}`).toBeLessThanOrEqual(wide[y - 1]);
  expect(wide[540 + 50]).toBeGreaterThan(0.5 * wide[540]);
});

test('a 1x1 and a 4000x100 image take every effect without error, within the documented target memory', async ({ page }) => {
  await openHarness(page);
  const all: VideoEffect[] = [
    fx('blur', { radius: 100 }), fx('sharpen', { amount: 2, radius: 5 }), fx('glow', { threshold: 0, radius: 100 }),
    fx('pixelate', { size: 200 }),
  ];
  for (const [w, h, fw, fh] of [[1, 1, 16, 16], [4000, 100, 2000, 50]] as const) {
    const format = { width: fw, height: fh, fps: 30 };
    const m = await page.evaluate(({ w, h }) => window.cf.putImageMedia(w, h, [200, 100, 50]), { w, h });
    const r = await renderEffects(page, project(format, [m], [clipOf(m, { out: 1, effects: all })]), [0]);
    expect(r.error, `${w}x${h}`).toBeNull();
    expect(r.unavailable).toEqual([]);
    // The bound: three targets of the working size, which is at most the source size capped at 2x the format's long
    // side (effectWorkingSize with the source as both display and texel size; the decoded image may be smaller).
    const work = effectWorkingSize({ width: w, height: h }, { width: w, height: h }, { width: fw, height: fh });
    console.log(`${w}x${h}: ${JSON.stringify(r.memory[0])}, bound ${3 * work.width * work.height * 4} bytes`);
    expect(r.memory[0].targets, `${w}x${h} targets`).toBeLessThanOrEqual(3);
    expect(r.memory[0].bytes, `${w}x${h} bytes`).toBeLessThanOrEqual(3 * work.width * work.height * 4);
    // A flat picture stays flat under blur, pixelate and glow-free colour (threshold 0 glow brightens it evenly).
    const f = r.frames[0];
    expect(px(f, f.width >> 1, f.height >> 1).join()).toBe(px(f, (f.width >> 1) + 1, f.height >> 1).join());
  }
});

test('a stack of eight blurs stays within three working-size targets', async ({ page }) => {
  await openHarness(page);
  const m = await gradientImage(page);
  const effects = Array.from({ length: 8 }, () => fx('blur', { radius: 60 }));
  const r = await renderEffects(page, project(GRADIENT, [m], [clipOf(m, { out: 1, effects })]), [0, 0.5]);
  expect(r.error).toBeNull();
  expect(r.passes).toEqual([16, 32]);
  for (const mem of r.memory) expect(mem).toEqual({ targets: 3, bytes: 3 * 256 * 48 * 4 });
});
