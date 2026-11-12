// Keyframed transforms through the real compositor (Plan 5 Task 5): solid-colour fixtures, measured at frame times.
// Opacity, position (incl. a hold step exactly at the key's frame), scale and rotation; static scale 0 draws nothing.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { easeAt } from '../../src/core/easing';
import { snapToFrame } from '../../src/core/fps';
import { openHarness } from './harness-helpers';
import { frames, imageClip, key, mean, pos, shape, solid, stack } from './keyframe-helpers';
import { overlayClip } from './overlay-helpers';

const FMT = { width: 320, height: 180, fps: 30 };
const WIDE = { width: 640, height: 360, fps: 30 };

/** Collects page errors and console errors (a NaN in a uniform or matrix surfaces as a GL/console error). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('opacity keys 0 -> 1 over 1 s: half at 0.5 s (linear) and easeAt at 0.25 s (easeIn), within 2/255', async ({ page }) => {
  await openHarness(page);
  const white = await solid(page, 320, 180, [255, 255, 255]);
  const linear = imageClip(white, { keys: { opacity: [key(0, 0), key(1, 1)] } });
  const easeIn = imageClip(white, { keys: { opacity: [key(0, 0, 'easeIn'), key(1, 1)] } });
  const [lin0, linMid, linEnd, eased] = await frames(page, [
    stack(FMT, [[linear]], [white]), stack(FMT, [[linear]], [white]), stack(FMT, [[linear]], [white]), stack(FMT, [[easeIn]], [white]),
  ], [0, 0.5, 1, 0.25]);
  const expected = 255 * easeAt({ kind: 'easeIn' }, snapToFrame(0.25, FMT.fps));
  console.log(`opacity: ${mean(lin0)}, ${mean(linMid)}, ${mean(linEnd)}; easeIn at 0.25 s ${mean(eased).toFixed(2)} (expected ${expected.toFixed(2)})`);
  expect(mean(lin0)).toBeLessThanOrEqual(1);
  expect(Math.abs(mean(linMid) - 127.5)).toBeLessThanOrEqual(2);
  expect(mean(linEnd)).toBeGreaterThanOrEqual(254);
  expect(Math.abs(mean(eased) - expected)).toBeLessThanOrEqual(2);
  expect(Math.abs(mean(eased) - 255 * 0.25)).toBeGreaterThan(20); // the ease really applies (linear would be ~59)
});

test('position keys move a 100 px square: centroid at 3 frame times (±1 px), and a hold jumps exactly at the key frame', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const moving = imageClip(lime, { keys: { position: [pos(0, -200, -60), pos(1, 200, 60)] } });
  const held = imageClip(lime, { keys: { position: [pos(0, -200, 0, 'hold'), pos(0.5, 200, 0)] } });
  const times = [0, 0.5, 0.8];
  const p = stack(WIDE, [[moving]], [lime]);
  const h = stack(WIDE, [[held]], [lime]);
  const got = await frames(page, [p, p, p, h, h, h, h], [...times, 14 / 30, 0.5 - 0.001, 0.5, 0.9]);
  times.forEach((t, i) => {
    const s = shape(got[i]);
    const x = 320 + -200 + 400 * t;
    const y = 180 + -60 + 120 * t;
    console.log(`position at ${t}s: centroid (${s.cx.toFixed(2)}, ${s.cy.toFixed(2)}), expected (${x}, ${y})`);
    expect(Math.abs(s.cx - x)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.cy - y)).toBeLessThanOrEqual(1);
    expect(s.r - s.l + 1).toBe(100);
  });
  const [frame14, between, frame15, after] = got.slice(3).map((f) => shape(f).cx);
  expect(frame14).toBeCloseTo(120, 5);
  expect(between).toBeCloseTo(120, 5); // 0.499 s is still frame 14
  expect(frame15).toBeCloseTo(520, 5); // the jump lands exactly on the key's frame
  expect(after).toBeCloseTo(520, 5);
});

test('scale and rotation keys: bounding boxes at 0, 0.5 and 1 s', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const bar = await solid(page, 160, 40, [255, 255, 255]);
  const scaled = stack(WIDE, [[imageClip(lime, { keys: { scale: [key(0, 0.5), key(1, 2)] } })]], [lime]);
  const turned = stack(WIDE, [[imageClip(bar, { keys: { rotation: [key(0, 0), key(1, 90)] } })]], [bar]);
  const got = await frames(page, [scaled, scaled, scaled, turned, turned, turned], [0, 0.5, 1, 0, 0.5, 1]);
  const size = got.map((f) => {
    const s = shape(f);
    return [s.r - s.l + 1, s.b - s.t + 1];
  });
  console.log(`scale boxes ${JSON.stringify(size.slice(0, 3))}; rotation boxes ${JSON.stringify(size.slice(3))}`);
  [50, 125, 200].forEach((w, i) => {
    expect(Math.abs(size[i][0] - w)).toBeLessThanOrEqual(2);
    expect(Math.abs(size[i][1] - w)).toBeLessThanOrEqual(2);
  });
  expect(size[3]).toEqual([160, 40]);
  const diag = (160 + 40) / Math.SQRT2; // 45°: a square box of (w + h)/√2
  expect(Math.abs(size[4][0] - diag)).toBeLessThanOrEqual(2);
  expect(Math.abs(size[4][1] - diag)).toBeLessThanOrEqual(2);
  expect(Math.abs(size[5][0] - 40)).toBeLessThanOrEqual(1);
  expect(Math.abs(size[5][1] - 160)).toBeLessThanOrEqual(1);
});

test('a static scale of 0 (and keys ending at 0) draws nothing, with no GL or page errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openHarness(page);
  const white = await solid(page, 320, 180, [255, 255, 255]);
  const zero = { x: 0, y: 0, scale: 0, rotation: 30, opacity: 1 };
  const projects = [
    stack(FMT, [[imageClip(white, { transform: zero })]], [white]),
    stack(FMT, [[imageClip(white, { keys: { scale: [key(0, 1), key(1, 0)] } })]], [white]),
    stack(FMT, [[overlayClip('sticker', 0, 2, { transform: zero })]], []),
    stack(FMT, [[imageClip(white, { transform: { ...zero, x: 1e7, y: -1e7 } })]], [white]),
    stack(FMT, [[imageClip(white, { keys: { scale: [key(0, 1), key(1, 0)] } })]], [white]),
  ];
  const got = await frames(page, projects, [0.5, 1, 0.5, 0.5, 0.5]);
  console.log(`scale 0 frame means ${JSON.stringify(got.map(mean))}`);
  got.slice(0, 4).forEach((f, i) => {
    expect(f.glError, `frame ${i}`).toBe(0);
    expect(mean(f), `frame ${i}`).toBe(0);
  });
  expect(mean(got[4])).toBeGreaterThan(50); // the same keys halfway: visible (the frame above is not trivially black)
  expect(errors).toEqual([]);
});
