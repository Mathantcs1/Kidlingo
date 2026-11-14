// Animation presets through the real compositor (Plan 5B Task 6): solid-colour fixtures, every preset family checked
// against the core resolver (the same `resolveClip` the compositor calls) and against hand-computed values.
import { test, expect } from '@playwright/test';
import { openHarness } from './harness-helpers';
import { adjustmentClip, at, frames, hash, imageClip, mean, shape, solid, stack } from './keyframe-helpers';
import type { Frame } from './keyframe-helpers';
import { LINEAR, drawn, emphasis, loop, use } from './preset-helpers';
import { defaultParams } from '../../src/core/videoEffects';

test.setTimeout(120_000);

const FMT = { width: 320, height: 180, fps: 30 };
const WIDE = { width: 640, height: 360, fps: 30 };

const box = (f: Frame): [number, number] => {
  const s = shape(f);
  return [s.r - s.l + 1, s.b - s.t + 1];
};

test('Fade In: mean pixel at 25/50/75 % of the window equals the resolved opacity (±2/255); default ease differs from linear', async ({ page }) => {
  await openHarness(page);
  const white = await solid(page, 320, 180, [255, 255, 255]);
  const lin = imageClip(white, { motion: { in: use('fade', 'in', { duration: 1, ease: LINEAR }) } });
  const eased = imageClip(white, { motion: { in: use('fade', 'in', { duration: 1 }) } });
  const out = imageClip(white, { motion: { out: use('fade', 'out', { duration: 1, ease: LINEAR }) } });
  const times = [0, 0.25, 0.5, 0.75, 1];
  const ps = [...times.map(() => stack(FMT, [[lin]], [white])), stack(FMT, [[eased]], [white]), stack(FMT, [[out]], [white]), stack(FMT, [[out]], [white])];
  const ts = [...times, 0.25, 1.5, 1.99];
  const got = await frames(page, ps, ts);
  const clips = [...times.map(() => lin), eased, out, out];
  got.forEach((f, i) => {
    const expected = 255 * drawn(clips[i], ts[i], FMT).opacity;
    console.log(`fade frame ${i} at ${ts[i]}s: ${mean(f).toFixed(2)} (expected ${expected.toFixed(2)})`);
    expect(Math.abs(mean(f) - expected), `frame ${i}`).toBeLessThanOrEqual(2);
  });
  // Hand values: linear p = snapped time (frames 7, 15, 22), 0 at the start, opaque after the window.
  expect(mean(got[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(mean(got[2]) - 127.5)).toBeLessThanOrEqual(2);
  expect(mean(got[4])).toBeGreaterThanOrEqual(254);
  expect(Math.abs(mean(got[5]) - mean(got[1]))).toBeGreaterThan(20); // easeOut is not linear
  expect(Math.abs(mean(got[6]) - 127.5)).toBeLessThanOrEqual(2); // Fade Out halfway through its last second
});

test('Slide In from the left: centroid at three frames (±1 px) on the resolver and the hand formula', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const c = imageClip(lime, { motion: { in: use('slide', 'in', { duration: 1, ease: LINEAR, params: { direction: 0, distance: 0.5 } }) } });
  const ts = [0.25, 0.5, 0.75];
  const got = await frames(page, [stack(WIDE, [[c]], [lime])], ts);
  ts.forEach((t, i) => {
    const s = shape(got[i]);
    const p = Math.floor(t * 30 + 1e-9) / 30;
    const hand = 320 - 0.5 * 640 * (1 - p);
    const core = 320 + drawn(c, t, WIDE).x;
    console.log(`slide at ${t}s: centroid ${s.cx.toFixed(2)} (core ${core.toFixed(2)}, hand ${hand.toFixed(2)})`);
    expect(Math.abs(s.cx - core)).toBeLessThanOrEqual(1);
    expect(Math.abs(core - hand)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(s.cy - 180)).toBeLessThanOrEqual(1);
  });
});

test('Pop overshoot frame, Spin corners and Drop bounce frame match the resolver', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const bar = await solid(page, 160, 40, [255, 255, 255], { right: [255, 0, 0] });
  const pop = imageClip(lime, { motion: { in: use('pop', 'in') } });
  const spin = imageClip(bar, { motion: { in: use('spin', 'in', { duration: 1, ease: LINEAR }) } });
  const drop = imageClip(lime, { motion: { in: use('drop', 'in') } });
  const frameT = (f: number) => f / 30;
  // Pop: the frame with the largest drawn scale (the spring overshoot).
  const popFrames = Array.from({ length: 16 }, (_, f) => f);
  const peak = popFrames.reduce((b, f) => (drawn(pop, frameT(f), WIDE).scale > drawn(pop, frameT(b), WIDE).scale ? f : b), 0);
  const peakScale = drawn(pop, frameT(peak), WIDE).scale;
  // Drop: the first frame that touches the rest place, then the top of the following bounce.
  const dy = (f: number) => drawn(drop, frameT(f), WIDE).y;
  let touch = 1;
  while (Math.abs(dy(touch + 1)) < Math.abs(dy(touch))) touch++;
  let bounce = touch + 1;
  while (Math.abs(dy(bounce + 1)) > Math.abs(dy(bounce))) bounce++;
  const ps = [pop, pop, spin, drop, drop].map((c) => stack(WIDE, [[c]], [lime, bar]));
  const [p0, pPeak, sMid, dTouch, dBounce] = await frames(page, ps, [0, frameT(peak), 0.5, frameT(touch), frameT(bounce)]);
  console.log(`pop peak frame ${peak} scale ${peakScale.toFixed(4)} box ${box(pPeak)}; spin box ${box(sMid)}; drop touch ${touch} bounce ${bounce}`);
  expect(shape(p0).count).toBe(0); // Pop starts at scale 0
  expect(peakScale).toBeGreaterThan(1.1);
  for (const v of box(pPeak)) expect(Math.abs(v - 100 * peakScale)).toBeLessThanOrEqual(2);
  // Spin In at p = 0.5 (linear, 0.5 turns): rotation −90°, scale 0.75 ⇒ a 30 × 120 box, the red (right) end on top.
  const [w, h] = box(sMid);
  expect(Math.abs(w - 30)).toBeLessThanOrEqual(2);
  expect(Math.abs(h - 120)).toBeLessThanOrEqual(2);
  let redY = 0, redN = 0;
  for (let y = 0; y < sMid.height; y++) for (let x = 0; x < sMid.width; x++) {
    const [r, g] = at(sMid, x, y);
    if (r > 200 && g < 60) { redY += y; redN++; }
  }
  expect(redY / redN).toBeLessThan(180 - 20);
  for (const [f, frame] of [[touch, dTouch], [bounce, dBounce]] as const) {
    expect(Math.abs(shape(frame).cy - (180 + dy(f)))).toBeLessThanOrEqual(1);
  }
  expect(shape(dBounce).cy).toBeLessThan(shape(dTouch).cy - 5); // it really bounces back up
});

test('Ken Burns zooms in log space (√(z0·z1) at mid-clip) and Pulse peaks at 1 + intensity', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 200, 200, [0, 255, 0]);
  const kb = imageClip(lime, { motion: { loop: loop('kenBurns', { params: { from: 1, to: 2, distance: 0 } }) } });
  const pulse = imageClip(lime, { motion: { emphasis: emphasis('pulse', 0.5) } });
  const [k0, kMid, pMid, pAfter] = await frames(page, [kb, kb, pulse, pulse].map((c) => stack(WIDE, [[c]], [lime])), [0, 1, 0.8, 1.2]);
  console.log(`ken burns boxes ${box(k0)} / ${box(kMid)} (expected ${200 * Math.SQRT2}); pulse ${box(pMid)} / ${box(pAfter)}`);
  expect(box(k0)).toEqual([200, 200]);
  for (const v of box(kMid)) expect(Math.abs(v - 200 * Math.SQRT2)).toBeLessThanOrEqual(1.5);
  expect(drawn(kb, 1, WIDE).scale).toBeCloseTo(Math.SQRT2, 12);
  for (const v of box(pMid)) expect(Math.abs(v - 230)).toBeLessThanOrEqual(2);
  expect(box(pAfter)).toEqual([200, 200]); // identity after the window
});

test('Shake is deterministic (two fresh compositors equal) and follows the resolver', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const c = imageClip(lime, { motion: { emphasis: emphasis('shake', 0.2, { params: { intensity: 0.1, seed: 12345 } }) } });
  const ts = [0.3, 0.4, 0.5, 0.6, 0.7];
  const p = stack(FMT, [[c]], [lime]);
  const a = await frames(page, [p], ts);
  const b = await frames(page, [p], ts);
  expect(b.map(hash)).toEqual(a.map(hash));
  let moved = 0;
  ts.forEach((t, i) => {
    const s = shape(a[i]);
    const d = drawn(c, t, FMT);
    expect(Math.abs(s.cx - (160 + d.x))).toBeLessThanOrEqual(1);
    expect(Math.abs(s.cy - (90 + d.y))).toBeLessThanOrEqual(1);
    moved = Math.max(moved, Math.hypot(d.x, d.y));
  });
  console.log(`shake: largest offset ${moved.toFixed(2)} px; hashes ${a.map(hash).join(',')}`);
  expect(moved).toBeGreaterThan(4);
});

test('Blink on an adjustment layer switches the effect on and off with the cycle', async ({ page }) => {
  await openHarness(page);
  const red = await solid(page, 320, 180, [200, 30, 30]);
  const invert = { id: 'inv', type: 'invert' as const, enabled: true, params: { ...defaultParams('invert'), amount: 1 } };
  const adj = adjustmentClip({ effects: [invert], motion: { loop: loop('blink', { duration: 1, params: { duty: 0.5 } }) } });
  const p = stack(FMT, [[imageClip(red)], [adj]], [red]);
  const ts = [0.2, 0.7, 1.2, 1.8];
  const got = await frames(page, [p], ts);
  console.log(`blink pixels ${got.map((f) => at(f, 10, 10).join('/')).join(' ')}`);
  const inverted = [55, 225, 225];
  const original = [200, 30, 30];
  [inverted, original, inverted, original].forEach((want, i) => {
    at(got[i], 10, 10).forEach((v, k) => expect(Math.abs(v - want[k]), `t=${ts[i]}`).toBeLessThanOrEqual(1));
    expect(drawn(adj, ts[i], FMT).opacity).toBe(want === inverted ? 1 : 0);
  });
});
