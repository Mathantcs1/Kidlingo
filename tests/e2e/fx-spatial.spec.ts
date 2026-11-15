// Plan 4 Task 5: blur, sharpen, glow and pixelate (multi-pass and neighbourhood effects).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ROTATED, ensureFixtures } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, render } from './harness-helpers';
import type { Frame } from './harness-helpers';
import { centre, flat, fx, image, pixelAt } from './fx-helpers';
import { fitTransform } from '../../src/core/merge';
import { newTrack } from '../../src/core/model';
import type { MediaRef, Project } from '../../src/core/model';

test.setTimeout(240_000);
const dir = ensureFixtures();

const row = (f: Frame, y: number): number[] => Array.from({ length: f.width }, (_, x) => f.data[(y * f.width + x) * 4]);

/** Width in output pixels between the 10 % and 90 % crossings of a rising edge (0 -> 255), linearly interpolated. */
function edgeWidth(values: number[]): number {
  const cross = (level: number): number => {
    const i = values.findIndex((v) => v >= level);
    if (i <= 0) return i;
    return i - 1 + (level - values[i - 1]) / (values[i] - values[i - 1]);
  };
  return cross(229.5) - cross(25.5);
}

const halves = (page: Parameters<typeof flat>[0], n: number): Promise<MediaRef> => image(page, n, n, [0, 0, 0], { right: [255, 255, 255] });
const sq = (n: number) => ({ width: n, height: n, fps: 10 });
const one = (m: MediaRef, n: number, stack: ReturnType<typeof fx>[]): Project => project(sq(n), [m], [clipOf(m, { out: 2, fx: stack })]);

test('blur: edge width follows radius, flat areas stay put, and the look does not depend on the render size', async ({ page }) => {
  await openHarness(page);
  const m = await halves(page, 640);
  const p = one(m, 640, [fx('blur', { radius: 20 })]);
  const widths: number[] = [];
  for (const canvas of [160, 640]) {
    const [f] = await render(page, p, [0.5], { canvas: { width: canvas, height: canvas } });
    widths.push(edgeWidth(row(f, canvas / 2)) / (canvas / 640));
    expectNear(pixelAt(f, canvas / 2, canvas / 2), [127, 127, 127], 14, `edge centre @${canvas}`);
    const far = Math.round((40 / 640) * canvas);
    expectNear(pixelAt(f, far, canvas / 2), [0, 0, 0], 2, `flat area @${canvas}`);
  }
  for (const w of widths) expect(Math.abs(w - 2.563 * 20) / (2.563 * 20), `edge width ${w} source px`).toBeLessThan(0.25);
  expect(Math.abs(widths[0] - widths[1]) / widths[1]).toBeLessThan(0.25);

  const [none] = await render(page, one(m, 640, []), [0.5], { canvas: { width: 160, height: 160 } });
  const [zero] = await render(page, one(m, 640, [fx('blur', { radius: 0 })]), [0.5], { canvas: { width: 160, height: 160 } });
  for (const x of [10, 70, 79, 80, 90, 150]) expectNear(pixelAt(zero, x, 80), pixelAt(none, x, 80), 1, `radius 0 @${x}`);
  const small = edgeWidth(row((await render(page, one(m, 640, [fx('blur', { radius: 5 })]), [0.5], { canvas: { width: 640, height: 640 } }))[0], 320));
  expect(small).toBeLessThan(widths[1] * 0.5);
});

test('blur: a huge radius on a 4K-sized image renders without error and the target pool stays bounded', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 3840, 2160, [0, 0, 0], { right: [255, 255, 255] });
  const p = project({ width: 3840, height: 2160, fps: 10 }, [m], [clipOf(m, { out: 2, fx: [fx('blur', { radius: 100 })] })]);
  const s = await page.evaluate((p) => window.cf.renderStats(p, [0, 0.1, 0.2, 0.3], { width: 960, height: 540 }), p);
  expect(s.glError).toBe(0);
  expect(s.after.fxTargets).toBeLessThanOrEqual(6);
  const [f] = await render(page, p, [0.5], { canvas: { width: 960, height: 540 } });
  const mid = pixelAt(f, 480, 270)[0];
  expect(mid).toBeGreaterThan(90);
  expect(mid).toBeLessThan(165);
});

test('sharpen: raises local contrast at a soft edge and leaves flat areas alone', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 128, 128, [80, 80, 80], { right: [170, 170, 170] });
  const soft = fx('blur', { radius: 3 });
  const [blurred] = await render(page, one(m, 128, [soft]), [0.5]);
  const [sharp] = await render(page, one(m, 128, [soft, fx('sharpen', { amount: 3, radius: 3 })]), [0.5]);
  const r = row(sharp, 64);
  expect(Math.min(...r)).toBeLessThan(80 - 4);
  expect(Math.max(...r)).toBeGreaterThan(170 + 4);
  const b = row(blurred, 64);
  expect(Math.min(...b)).toBeGreaterThanOrEqual(78);
  expectNear(pixelAt(sharp, 3, 64), [80, 80, 80], 1, 'flat dark area');
  expectNear(pixelAt(sharp, 124, 64), [170, 170, 170], 1, 'flat light area');
  const [off] = await render(page, one(m, 128, [fx('sharpen', { amount: 0 })]), [0.5]);
  expectNear(pixelAt(off, 20, 64), [80, 80, 80], 1, 'amount 0');
});

test('glow: a bright dot spreads light nearby and nothing far away', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 128, 128, [0, 0, 0], { dot: 8 });
  const [none] = await render(page, one(m, 128, []), [0.5]);
  const [glow] = await render(page, one(m, 128, [fx('glow', { threshold: 0.5, radius: 10, intensity: 1.5 })]), [0.5]);
  expect(pixelAt(glow, 74, 64)[0] - pixelAt(none, 74, 64)[0]).toBeGreaterThanOrEqual(10);
  expect(pixelAt(glow, 4, 4)[0]).toBeLessThan(2);
  expect(pixelAt(glow, 64, 64)[0]).toBeGreaterThanOrEqual(250);
  const [high] = await render(page, one(m, 128, [fx('glow', { threshold: 1, radius: 10, intensity: 2 })]), [0.5]);
  expect(pixelAt(high, 74, 64)[0]).toBeLessThan(2);
});

test('pixelate: blocks are flat, neighbouring blocks differ, and a rotated phone clip stays upright', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 64, 64, [255, 255, 255], { stripes: 3 });
  const [f] = await render(page, one(m, 64, [fx('pixelate', { size: 16 })]), [0.5]);
  for (const [bx, by] of [[0, 0], [16, 0], [32, 16], [48, 48]]) {
    const base = pixelAt(f, bx, by);
    for (const [dx, dy] of [[1, 1], [7, 3], [15, 15], [0, 9]]) expectNear(pixelAt(f, bx + dx, by + dy), base, 1, `block ${bx},${by} +${dx},${dy}`);
  }
  expect(Math.abs(pixelAt(f, 0, 0)[0] - pixelAt(f, 16, 0)[0])).toBeGreaterThan(20);

  const [rot] = await importPaths(page, [join(dir, ROTATED[90])]);
  const size = { width: rot.width!, height: rot.height! };
  const clip = (stack: ReturnType<typeof fx>[]) => clipOf(rot, { transform: fitTransform(size, size, 'fit'), fx: stack });
  const [plain] = await render(page, project({ ...size, fps: 30 }, [rot], [clip([])]), [0.5]);
  const [pix] = await render(page, project({ ...size, fps: 30 }, [rot], [clip([fx('pixelate', { size: 10 })])]), [0.5]);
  for (const [x, y] of [[8, 8], [size.width - 9, 8], [8, size.height - 9], [size.width - 9, size.height - 9]]) {
    expectNear(pixelAt(pix, x, y), pixelAt(plain, x, y), 8, `corner ${x},${y}`);
  }
});

test('translucent pixels get no fringes from blur, sharpen, glow or pixelate', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 64, 64, [200, 100, 40], { right: [40, 100, 200], alpha: 0.5 });
  for (const stack of [[fx('blur', { radius: 8 })], [fx('sharpen', { amount: 2 })], [fx('glow', { threshold: 1 })], [fx('pixelate', { size: 8 })]]) {
    const [f] = await render(page, one(m, 64, stack), [0.5]);
    for (const x of [2, 30, 33, 61]) for (const v of pixelAt(f, x, 32)) expect(v, `${stack[0].type} @${x}`).toBeLessThanOrEqual(129);
  }
});

test('six layers of blur + invert + sharpen keep the target pool bounded', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [90, 160, 220]);
  const clips = Array.from({ length: 6 }, (_, i) => ({ ...clipOf(m, { out: 2, fx: [fx('blur', { radius: 4 }), fx('invert'), fx('sharpen')] }), id: `L${i}` }));
  const p: Project = { ...project({ width: 32, height: 32, fps: 10 }, [m], []), tracks: [...clips.map((c, i) => ({ ...newTrack('video'), id: `v${i}`, clips: [c] })), { ...newTrack('audio'), id: 'a' }] };
  const s = await page.evaluate((p) => window.cf.renderStats(p, Array.from({ length: 100 }, (_, i) => i / 100)), p);
  expect(s.after.fxTargets).toBeLessThanOrEqual(6);
  expect(s.after.fxTargets).toBe(s.mid.fxTargets);
  expect(s.glError).toBe(0);
  expect(centre((await render(page, p, [0.5]))[0]).every((v) => v >= 0)).toBe(true);
});
