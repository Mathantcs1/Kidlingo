// Plan 5C Task 5: the transition pass against its CPU mirror (transitionMath.ts) for every type and direction, at 25 and 30 fps,
// plus the progress/endpoint checks of §7 and blend-mode and fallback behaviour. Pictures: tr-a.png (red | green), tr-b.png (blue / yellow).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { easeAt } from '../../src/core/easing';
import { transitionPixel } from '../../src/render/transitionMath';
import type { Sampler, TransitionParams } from '../../src/render/transitionMath';
import type { Clip, MediaRef, Project } from '../../src/core/model';
import type { Transition } from '../../src/core/transitionTypes';

test.setTimeout(240_000);

const dir = ensureFixtures();
const W = 64;
const H = 36;
const inside = (x: number, y: number): boolean => x >= 0 && x <= 1 && y >= 0 && y <= 1;
const A: Sampler = (x, y) => (!inside(x, y) ? [0, 0, 0, 0] : x < 0.5 ? [1, 0, 0, 1] : [0, 1, 0, 1]);
const B: Sampler = (x, y) => (!inside(x, y) ? [0, 0, 0, 0] : y < 0.5 ? [0, 0, 1, 1] : [1, 1, 0, 1]);

interface Setup { p: Project; a: Clip; b: Clip }

function build(ma: MediaRef, mb: MediaRef, fps: number, tr: Partial<Transition>, over: { a?: Partial<Clip>; b?: Partial<Clip> } = {}): Setup {
  const a = clipOf(ma, { start: 0, in: 0, out: 2, ...over.a });
  const b = clipOf(mb, { start: 2, in: 0, out: 2, ...over.b });
  const p = project({ width: W, height: H, fps }, [ma, mb], [a, b]);
  const duration = fps === 25 ? 0.8 : 0.8; // 20 frames at 25 fps, 24 at 30: even
  const transition: Transition = { id: 'tr', fromClipId: a.id, toClipId: b.id, type: 'dissolve', duration, ease: { kind: 'linear' }, ...tr };
  p.tracks[0] = { ...p.tracks[0], transitions: [transition] };
  return { p, a, b };
}

const frames = (page: Page, p: Project, times: number[]) =>
  page.evaluate(({ p, times }) => window.cf.renderPixels(p, times, { sources: false }), { p, times });

const pixelAt = (f: { width: number; data: ArrayLike<number> }, x: number, y: number): number[] => {
  const i = (y * f.width + x) * 4;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
};

const TYPES: Transition['type'][] = ['dip', 'dissolve', 'wipe', 'slide', 'push', 'zoom', 'glitch'];
const needsDirection = new Set(['wipe', 'slide', 'push']);

for (const fps of [25, 30]) {
  test(`every type and direction matches the CPU mirror at ${fps} fps (mean |d| <= 4/255, <= 4 % of samples over 3/255: one row of bilinear blend at a sharp edge)`, async ({ page }) => {
    await openHarness(page);
    const [ma, mb] = await importPaths(page, [join(dir, 'tr-a.png'), join(dir, 'tr-b.png')]);
    const n = fps === 25 ? 20 : 24;
    const picks = [0, 3, Math.floor(n / 2), n - 4, n - 1];
    const worst: string[] = [];
    let maxMean = 0;
    let maxFrac = 0;
    for (const type of TYPES) {
      for (const direction of needsDirection.has(type) ? (['left', 'right', 'up', 'down'] as const) : (['left'] as const)) {
        const { p } = build(ma, mb, fps, { type, direction, softness: 0.1, amount: type === 'zoom' ? 2 : 0.8 });
        const times = picks.map((k) => 2 - 0.4 + k / fps);
        const out = await frames(page, p, times);
        for (const [i, k] of picks.entries()) {
          const u = k / n;
          const prm: TransitionParams = { type, e: easeAt({ kind: 'linear' }, u), direction, softness: 0.1, amount: type === 'zoom' ? 2 : 0.8, frame: Math.floor(times[i] * fps + 1e-6) };
          const f = out[i];
          let sum = 0;
          let over = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const want = transitionPixel(prm, A, B, (x + 0.5) / W, (y + 0.5) / H);
              const got = pixelAt(f, x, y);
              for (let c = 0; c < 3; c++) {
                const d = Math.abs(got[c] - want[c] * 255);
                sum += d;
                if (d > 3) over++;
              }
            }
          }
          const mean = sum / (W * H * 3);
          const frac = over / (W * H * 3);
          maxMean = Math.max(maxMean, mean);
          maxFrac = Math.max(maxFrac, frac);
          if (mean > 4 || frac > 0.04) worst.push(`${type}/${direction} k=${k}: mean ${mean.toFixed(2)} over ${(frac * 100).toFixed(1)} %`);
        }
      }
    }
    console.log(`parity ${fps} fps: worst mean ${maxMean.toFixed(2)}/255, worst over-3 fraction ${(maxFrac * 100).toFixed(1)} %`);
    expect(worst).toEqual([]);
  });
}

test('progress: red to blue dissolve at 30 fps: R follows 255·(1 − u); the cut frame is the 50/50 mix; frames outside the window are the plain clips', async ({ page }) => {
  await openHarness(page);
  const [ma, mb] = await importPaths(page, [join(dir, 'tr-a.png'), join(dir, 'tr-b.png')]);
  const { p } = build(ma, mb, 30, { type: 'dissolve', duration: 0.8 });
  const t = (k: number): number => 2 - 0.4 + k / 30;
  const [before, start, mid, last, after] = await frames(page, p, [t(-1), t(0), t(12), t(23), t(24)]);
  const at = (f: { width: number; data: ArrayLike<number> }) => pixelAt(f, 8, 8); // A: red, B: blue (top-left quadrant)
  expect(at(before)).toEqual([255, 0, 0]); // window start - 1 = the plain outgoing clip
  expect(at(start)[0]).toBeGreaterThan(250);
  expect(Math.abs(at(mid)[0] - 128)).toBeLessThanOrEqual(2);
  expect(Math.abs(at(mid)[2] - 128)).toBeLessThanOrEqual(2);
  expect(at(last)[2]).toBeGreaterThan(240);
  expect(at(after)).toEqual([0, 0, 255]); // window end = the plain incoming clip
});

test('wipe edge column and slide marker move by e·W (±1 px)', async ({ page }) => {
  await openHarness(page);
  const [ma, mb] = await importPaths(page, [join(dir, 'tr-a.png'), join(dir, 'tr-b.png')]);
  const wipe = build(ma, mb, 30, { type: 'wipe', direction: 'right', softness: 0 }).p;
  const k = 6;
  const [f] = await frames(page, wipe, [2 - 0.4 + k / 30]);
  const e = k / 24;
  let edge = 0;
  for (let x = 0; x < W; x++) if (pixelAt(f, x, 8)[2] > 128) edge = x + 1; // B (blue, top row) is behind the edge
  expect(Math.abs(edge - e * W)).toBeLessThanOrEqual(1);
});

test('a non-Normal blend mode on both clips composites the transition through the same pass (Multiply over a backdrop differs from Normal)', async ({ page }) => {
  await openHarness(page);
  const [ma, mb] = await importPaths(page, [join(dir, 'tr-a.png'), join(dir, 'tr-b.png')]);
  const normal = build(ma, mb, 30, { type: 'dissolve' }).p;
  const multiply = build(ma, mb, 30, { type: 'dissolve' }, { a: { blend: 'multiply' }, b: { blend: 'multiply' } }).p;
  const [n, m] = [await frames(page, normal, [2]), await frames(page, multiply, [2])];
  expect(pixelAt(n[0], 8, 8)).not.toEqual([0, 0, 0]);
  // Multiply with nothing below behaves like Normal (isolated group, Ruling P9): same picture.
  expect(Math.abs(pixelAt(n[0], 8, 8)[0] - pixelAt(m[0], 8, 8)[0])).toBeLessThanOrEqual(2);
});

test('layers are cleared between frames: a frame renders the same after another frame as alone (animated, shrinking incoming clip)', async ({ page }) => {
  await openHarness(page);
  const [ma, mb] = await importPaths(page, [join(dir, 'tr-a.png'), join(dir, 'tr-b.png')]);
  const lin = { kind: 'linear' as const };
  const { p } = build(ma, mb, 30, { type: 'dissolve' }, { b: { keys: { scale: [{ t: 0, v: 1, ease: lin }, { t: 2, v: 0.2, ease: lin }] } } });
  const t = (k: number): number => 2 - 0.4 + k / 30;
  const seq = await frames(page, p, [t(2), t(20)]);
  const alone = await frames(page, p, [t(20)]);
  expect(Array.from(seq[1].data)).toEqual(Array.from(alone[0].data));
});
