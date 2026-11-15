// Plan 4 Task 6: RGB split, glitch, VHS, mirror and film grain (stylise and time-driven effects).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ROTATED, ensureFixtures, ffmpegFrame } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, render } from './harness-helpers';
import type { Frame } from './harness-helpers';
import { fx, image, pixelAt } from './fx-helpers';
import { fitTransform } from '../../src/core/merge';
import type { MediaRef, Project, VisualEffect } from '../../src/core/model';

test.setTimeout(240_000);
const dir = ensureFixtures();
const N = 128;
const sq = (n: number) => ({ width: n, height: n, fps: 10 });
const one = (m: MediaRef, n: number, stack: VisualEffect[], id?: string): Project =>
  project(sq(n), [m], [{ ...clipOf(m, { out: 2, fx: stack }), id: id ?? 'fixed-clip' }]);
const bytes = (f: Frame): number => f.data.length;
const same = (a: Frame, b: Frame): boolean => a.data.every((v, i) => v === b.data[i]);
const meanAbsDiff = (a: Frame, b: Frame): number => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let k = 0; k < 3; k++, n++) sum += Math.abs(a.data[i + k] - b.data[i + k]);
  return sum / n;
};
const stats = (f: Frame): { mean: number; std: number } => {
  const v: number[] = [];
  for (let i = 0; i < f.data.length; i += 4) v.push(f.data[i + 1]);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return { mean, std: Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length) };
};
/** Column where channel `ch` first reaches 128 along row `y` (linearly interpolated). */
function crossing(f: Frame, y: number, ch: number): number {
  const at = (x: number): number => f.data[(y * f.width + x) * 4 + ch];
  for (let x = 1; x < f.width; x++) if (at(x) >= 128) return x - 1 + (128 - at(x - 1)) / (at(x) - at(x - 1));
  return -1;
}

test('rgbsplit: red and blue separate along the angle, green stays', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 64, 64, [0, 0, 0], { right: [255, 255, 255] });
  const [f] = await render(page, one(m, 64, [fx('rgbsplit', { amount: 6, angle: 0 })]), [0.5]);
  const [none] = await render(page, one(m, 64, []), [0.5]);
  const base = crossing(none, 32, 1);
  expect(Math.abs(crossing(f, 32, 1) - base)).toBeLessThan(1);
  expect(crossing(f, 32, 0) - base).toBeGreaterThan(5);
  expect(crossing(f, 32, 0) - base).toBeLessThan(7);
  expect(base - crossing(f, 32, 2)).toBeGreaterThan(5);
  expect(base - crossing(f, 32, 2)).toBeLessThan(7);
  const [zero] = await render(page, one(m, 64, [fx('rgbsplit', { amount: 0 })]), [0.5]);
  expectNear(pixelAt(zero, 10, 10), pixelAt(none, 10, 10), 1, 'amount 0');
});

test('mirror: all five modes are symmetric, also on a rotated phone video (in display orientation)', async ({ page }) => {
  await openHarness(page);
  const [quad, rot] = await importPaths(page, [join(dir, 'quad.mp4'), join(dir, ROTATED[90])]);
  for (const m of [quad, rot]) {
    const size = { width: m.width!, height: m.height! };
    const fmt = { ...size, fps: 30 };
    for (const mode of [0, 1, 2, 3, 4]) {
      const clip = clipOf(m, { transform: fitTransform(size, size, 'fit'), fx: [fx('mirror', { mode })] });
      const [f] = await render(page, project(fmt, [m], [clip]), [0.5]);
      const W = f.width;
      const H = f.height;
      for (const [x, y] of [[5, 7], [W / 4, H / 5], [W / 3 + 1, H / 2 - 4], [10, H - 12]].map(([a, b]) => [Math.floor(a), Math.floor(b)])) {
        const mx = W - 1 - x;
        const my = H - 1 - y;
        const horizontal = mode === 0 || mode === 1 || mode === 4;
        const vertical = mode === 2 || mode === 3 || mode === 4;
        if (horizontal && x !== mx) expectNear(pixelAt(f, x, y), pixelAt(f, mx, y), 3, `mode ${mode} horizontal @${x},${y}`);
        if (vertical && y !== my) expectNear(pixelAt(f, x, y), pixelAt(f, x, my), 3, `mode ${mode} vertical @${x},${y}`);
      }
    }
  }
});

test('grain: amount 0 is the identity; noise is zero-mean, repeatable per frame and different between frames and clips', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, N, N, [128, 128, 128]);
  const [plain] = await render(page, one(m, N, []), [0.5]);
  const [off] = await render(page, one(m, N, [fx('grain', { amount: 0 })]), [0.5]);
  expectNear(pixelAt(off, 20, 20), pixelAt(plain, 20, 20), 1, 'amount 0');
  const g = [fx('grain', { amount: 0.5, size: 1 })];
  const [a, a2] = await render(page, one(m, N, g), [0.5, 0.5]);
  const [again] = await render(page, one(m, N, g), [0.5]);
  const [next] = await render(page, one(m, N, g), [0.6]);
  const [other] = await render(page, one(m, N, g, 'another-clip'), [0.5]);
  const s = stats(a);
  expect(Math.abs(s.mean - 128)).toBeLessThanOrEqual(2);
  expect(s.std).toBeGreaterThanOrEqual(6);
  expect(same(a, a2)).toBe(true);
  expect(same(a, again)).toBe(true);
  expect(same(a, next)).toBe(false);
  expect(same(a, other)).toBe(false);
  expect(bytes(a)).toBe(N * N * 4);
});

test('glitch and vhs: amount 0 is the identity, repeat renders match, other frames differ; vhs bleeds red to the right of an edge', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, N, N, [220, 30, 30], { right: [0, 0, 0] });
  const [plain] = await render(page, one(m, N, []), [0.5]);
  for (const type of ['glitch', 'vhs'] as const) {
    const [zero] = await render(page, one(m, N, [fx(type, { amount: 0 })]), [0.5]);
    expectNear(pixelAt(zero, 30, 40), pixelAt(plain, 30, 40), 1, `${type} amount 0`);
    const on = [fx(type, { amount: 1, speed: 1 })];
    const [a, b] = await render(page, one(m, N, on), [0.5, 0.5]);
    const [c] = await render(page, one(m, N, on), [0.9]);
    expect(same(a, b), `${type} repeat`).toBe(true);
    expect(same(a, c), `${type} other frame`).toBe(false);
    expect(meanAbsDiff(a, plain), `${type} changes the picture`).toBeGreaterThan(0.5);
  }
  const [vhs] = await render(page, one(m, N, [fx('vhs', { amount: 1 })]), [0.5]);
  expect(pixelAt(vhs, 68, 64)[0] - pixelAt(plain, 68, 64)[0]).toBeGreaterThanOrEqual(10);
});

test('translucent pixels get no fringes from the stylise effects', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 64, 64, [200, 100, 40], { right: [40, 100, 200], alpha: 0.5 });
  const stacks = [[fx('rgbsplit', { amount: 4 })], [fx('mirror', { mode: 4 })], [fx('grain', { amount: 0.4 })], [fx('glitch', { amount: 1 })], [fx('vhs', { amount: 0.8 })]];
  for (const stack of stacks) {
    const [f] = await render(page, one(m, 64, stack), [0.5]);
    for (const x of [2, 20, 40, 61]) for (const v of pixelAt(f, x, 32)) expect(v, `${stack[0].type} @${x}`).toBeLessThanOrEqual(135);
  }
});

test('preview frames equal exported frames for a grain + vhs stack (same compositor, deterministic time)', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 160, 160, [120, 160, 200], { right: [200, 120, 80] });
  const p = one(m, 160, [fx('grain', { amount: 0.25, size: 1 }), fx('vhs', { amount: 0.4 })]);
  const b64 = await page.evaluate((p) => window.cf.exportBase64(p, 160), p);
  const out = join(process.cwd(), 'test-results', 'fx-parity');
  mkdirSync(out, { recursive: true });
  const file = join(out, 'grain-vhs.mp4');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  const frames = await render(page, p, [0.3, 0.5]);
  for (const [i, t] of [[3, 0], [5, 1]] as const) {
    const exp = ffmpegFrame(file, i);
    expect(exp.width).toBe(160);
    let sum = 0;
    let n = 0;
    for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) for (let k = 0; k < 3; k++, n++) sum += Math.abs(exp.rgb[(y * 160 + x) * 3 + k] - frames[t].data[(y * 160 + x) * 4 + k]);
    expect(sum / n, `frame ${i}`).toBeLessThanOrEqual(4);
  }
});
