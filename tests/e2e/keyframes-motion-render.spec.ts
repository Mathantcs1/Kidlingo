// Plan 5B keyed motion through the real compositor (Task 6): spring eases, key loops, curved paths and orient along
// path match the core evaluators (evalKeys / evalPosition / pathHeading); 5A-only keyed projects render byte-identically
// to the code before Task 6 (hash literals recorded on that code, asserted only on the GL they were recorded on).
import { test, expect } from '@playwright/test';
import { evalKeys } from '../../src/core/keyLoops';
import { snapToFrame } from '../../src/core/fps';
import { evalPosition, pathHeading } from '../../src/core/spatialPath';
import { defaultParams } from '../../src/core/videoEffects';
import type { Keyframe, PositionKeyframe } from '../../src/core/model';
import type { Ease } from '../../src/core/easing';
import { openHarness } from './harness-helpers';
import { adjustmentClip, at, frames, hash, imageClip, key, pos, shape, solid, stack } from './keyframe-helpers';
import type { Frame } from './keyframe-helpers';
import { overlayClip } from './overlay-helpers';
import { STATIC_HASHES_GL, glIdentity } from './preset-helpers';

test.setTimeout(120_000);

const FMT = { width: 320, height: 180, fps: 30 };
const WIDE = { width: 640, height: 360, fps: 30 };
const BOUNCY: Ease = { kind: 'spring', spring: { stiffness: 180, damping: 12, mass: 1 } };
const u = (t: number) => snapToFrame(t, 30);
const box = (f: Frame): [number, number] => {
  const s = shape(f);
  return [s.r - s.l + 1, s.b - s.t + 1];
};

test('spring-eased position and opacity keys: centroid and mean equal evalPosition / evalKeys at the frame', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const position: PositionKeyframe[] = [{ t: 0, x: -200, y: 0, ease: BOUNCY }, { t: 1, x: 150, y: 0, ease: { kind: 'linear' } }];
  const opacity: Keyframe[] = [{ t: 0, v: 0.2, ease: BOUNCY }, { t: 1, v: 1, ease: { kind: 'linear' } }];
  const c = imageClip(lime, { keys: { position, opacity } });
  const ts = [0.2, 0.4, 0.6, 0.8];
  const got = await frames(page, [stack(WIDE, [[c]], [lime])], ts);
  let overshoot = false;
  ts.forEach((t, i) => {
    const x = 320 + evalPosition(position, undefined, u(t)).x;
    const g = 255 * evalKeys(opacity, undefined, u(t), 0, 1);
    const s = shape(got[i], 0);
    const lit = at(got[i], Math.round(s.cx), 180)[1];
    console.log(`spring at ${t}s: centroid ${s.cx.toFixed(2)} (expected ${x.toFixed(2)}), green ${lit} (expected ${g.toFixed(1)})`);
    expect(Math.abs(s.cx - x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lit - g)).toBeLessThanOrEqual(2);
    if (x > 320 + 150) overshoot = true;
  });
  expect(overshoot).toBe(true); // the bouncy spring really overshoots the last key on some checked frame
});

test('key loops: repeat, ping-pong, count and offset frames equal evalKeys / evalPosition', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 100, 100, [0, 255, 0]);
  const scale = [key(0, 0.5), key(0.5, 1)];
  const xs = [pos(0, -250, 0), pos(0.5, -150, 0)];
  const repeat = imageClip(lime, { keys: { scale, loops: { scale: { mode: 'repeat', count: null } } } });
  const ping = imageClip(lime, { keys: { scale, loops: { scale: { mode: 'pingPong', count: null } } } });
  const once = imageClip(lime, { keys: { scale, loops: { scale: { mode: 'repeat', count: 1 } } } });
  const offset = imageClip(lime, { keys: { position: xs, loops: { position: { mode: 'offset', count: null } } } });
  const ps = [repeat, ping, once, once, offset].map((c) => stack(WIDE, [[c]], [lime]));
  const ts = [0.6, 0.6, 0.6, 1.25, 1.3];
  const got = await frames(page, ps, ts);
  const sizes = got.slice(0, 4).map((f) => box(f)[0]);
  console.log(`loop boxes ${sizes}; offset centroid ${shape(got[4]).cx.toFixed(2)}`);
  const want = [
    evalKeys(scale, { mode: 'repeat', count: null }, u(0.6), 0, Infinity),
    evalKeys(scale, { mode: 'pingPong', count: null }, u(0.6), 0, Infinity),
    evalKeys(scale, { mode: 'repeat', count: 1 }, u(0.6), 0, Infinity),
    evalKeys(scale, { mode: 'repeat', count: 1 }, u(1.25), 0, Infinity),
  ];
  expect(want.map((v) => Math.round(v * 100) / 100)).toEqual([0.6, 0.9, 0.6, 1]);
  sizes.forEach((s, i) => expect(Math.abs(s - 100 * want[i]), `loop ${i}`).toBeLessThanOrEqual(2));
  const x = 320 + evalPosition(xs, { mode: 'offset', count: null }, u(1.3)).x;
  expect(Math.abs(x - (320 - 250 + 200 * (u(1.3) - 1) + 2 * 100))).toBeLessThanOrEqual(1e-9); // cycle 2: +2 × 100
  expect(Math.abs(shape(got[4]).cx - x)).toBeLessThanOrEqual(1);
});

test('a curved path: the centroid follows the Bezier (±1.5 px), off the chord; orient turns the picture along the path', async ({ page }) => {
  await openHarness(page);
  const lime = await solid(page, 60, 60, [0, 255, 0]);
  const bar = await solid(page, 160, 40, [255, 255, 255], { right: [255, 0, 0] });
  const curve: PositionKeyframe[] = [
    { t: 0, x: -200, y: 60, ease: { kind: 'linear' }, out: { x: 0, y: -240 } },
    { t: 1, x: 200, y: 60, ease: { kind: 'linear' }, in: { x: 0, y: -240 } },
  ];
  const line: PositionKeyframe[] = [pos(0, -200, -100), pos(1, 200, 100)];
  const curved = imageClip(lime, { keys: { position: curve } });
  const oriented = imageClip(bar, { keys: { position: line, orient: true } });
  const ts = [0.25, 0.5, 0.75];
  const got = await frames(page, [...ts.map(() => stack(WIDE, [[curved]], [lime])), stack(WIDE, [[oriented]], [bar])], [...ts, 0.5]);
  ts.forEach((t, i) => {
    const p = evalPosition(curve, undefined, u(t));
    const s = shape(got[i]);
    console.log(`curve at ${t}s: centroid (${s.cx.toFixed(2)}, ${s.cy.toFixed(2)}) expected (${(320 + p.x).toFixed(2)}, ${(180 + p.y).toFixed(2)})`);
    expect(Math.abs(s.cx - (320 + p.x))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(s.cy - (180 + p.y))).toBeLessThanOrEqual(1.5);
    expect(s.cy).toBeLessThan(180 + 60 - 50); // well above the straight chord y = 60
  });
  const heading = pathHeading(line, undefined, u(0.5));
  expect(heading).toBeCloseTo((Math.atan2(200, 400) * 180) / Math.PI, 9);
  const o = got[3];
  const rad = (heading * Math.PI) / 180;
  const [w, h] = box(o);
  console.log(`orient heading ${heading.toFixed(3)}: box ${w}x${h}`);
  expect(Math.abs(w - (160 * Math.cos(rad) + 40 * Math.sin(rad)))).toBeLessThanOrEqual(2);
  expect(Math.abs(h - (160 * Math.sin(rad) + 40 * Math.cos(rad)))).toBeLessThanOrEqual(2);
  // The red (right) end points along the heading: its centroid's angle from the picture centre.
  let rx = 0, ry = 0, n = 0;
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
    const [r, g] = at(o, x, y);
    if (r > 200 && g < 60) { rx += x + 0.5; ry += y + 0.5; n++; }
  }
  const angle = (Math.atan2(ry / n - 180, rx / n - 320) * 180) / Math.PI;
  expect(Math.abs(angle - heading)).toBeLessThanOrEqual(2);
});

/** Three 5A-only keyed fixtures (no motion, no loops, no tangents) touching images, effects, overlays and adjustments. */
async function fiveAFixtures(page: Parameters<typeof solid>[0]) {
  const a = await solid(page, 320, 180, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] });
  const b = await solid(page, 120, 80, [20, 220, 90], { right: [240, 240, 40] });
  const colour = { id: 'c', type: 'colour' as const, enabled: true, params: defaultParams('colour'), keys: { brightness: [key(0, -0.3), key(1, 0.3, 'easeInOut')] } };
  const moving = imageClip(b, {
    id: 'm', effects: [colour],
    keys: { position: [pos(0, -80, -30, 'easeOut'), pos(1, 70, 40)], scale: [key(0, 0.6, 'back'), key(1, 1.4)], rotation: [key(0, 0), key(1, 120)], opacity: [key(0, 0.4), key(1, 1)] },
  });
  const sticker = overlayClip('sticker', 0, 2, { id: 's', keys: { scale: [key(0, 1, 'elastic'), key(1, 2)], rotation: [key(0, -20), key(1, 20)] } });
  const lower = overlayClip('lowerThird', 0, 2, { id: 'l', keys: { opacity: [key(0, 1), key(2, 0.5)] } });
  const invert = { id: 'i', type: 'invert' as const, enabled: true, params: { ...defaultParams('invert'), amount: 1 } };
  const adj = adjustmentClip({ id: 'adj', effects: [invert], keys: { opacity: [key(0, 0), key(1.5, 0.6, 'hold'), key(2, 1)] } });
  const bar = overlayClip('progressBar', 0, 2, { id: 'pb', keys: { position: [pos(0, 0, 60), pos(2, 0, 80)] } });
  return [
    stack(FMT, [[imageClip(a, { id: 'bg' })], [moving]], [a, b]),
    stack(FMT, [[imageClip(a, { id: 'bg' })], [sticker], [lower]], [a]),
    stack(FMT, [[imageClip(a, { id: 'bg' })], [moving], [adj], [bar]], [a, b]),
  ];
}

// Recorded with the code BEFORE Plan 5B Task 6 (commit 8160f15) on the GL below: 5A-only projects must not change.
const FIVE_A_HASHES = ['806eada4af94c85d', 'b625e9058689dc7a', '954d53f7b2cf1fcb', 'dcdde9936640eaac', '551e75bfebb978a0', '96eb7759d5b239fc'];

test('5A-only keyed projects render byte-identically to the code before Task 6 (3 fixtures × 2 frames)', async ({ page }) => {
  await openHarness(page);
  const [f1, f2, f3] = await fiveAFixtures(page);
  const got = await frames(page, [f1, f1, f2, f2, f3, f3], [0.3, 0.9, 0.1, 0.6, 0.2, 1.7]);
  for (const f of got) expect(f.glError).toBe(0);
  const hashes = got.map(hash);
  console.log(`5A keyed hashes ${JSON.stringify(hashes)}`);
  const gl = await glIdentity(page);
  if (gl === STATIC_HASHES_GL) expect(hashes).toEqual(FIVE_A_HASHES);
  else console.warn(`5A hash literal check skipped: recorded on "${STATIC_HASHES_GL}", running on "${gl}"`);
  expect(new Set(hashes).size).toBe(6); // every frame is a different picture (the fixtures really animate)
});
