// The chroma key (Plan 4 Task 9) through the real compositor: an ffmpeg green-screen video (red square, soft 8-px
// edge) keyed over a blue image layer on the track below; similarity 0 keeps everything; a half-alpha PNG edge keeps
// its alpha and colour (no halo); the DRIFT GUARD (every param alone at min and max, defaults, combined sets) per pixel
// against the CPU reference of keyMath.ts (≤ 3/255); a rotated phone video is keyed upright.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, px, render } from './harness-helpers';
import { edgeImage, gradientImage, overBackdrops, straight } from './colour-helpers';
import { floatImage, opaque, renderEffects, textureImage, worstVsReference } from './blur-helpers';
import { fitTransform } from '../../src/core/merge';
import { newTrack } from '../../src/core/model';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';
import { VIDEO_EFFECTS, defaultParams } from '../../src/core/videoEffects';
import { chromaKeyRef, keyAlpha } from '../../src/render/effects/keyMath';

const dir = ensureFixtures();
let n = 0;
const ck = (params: Record<string, number> = {}): VideoEffect =>
  ({ id: `ck-${++n}`, type: 'chromaKey', enabled: true, params: { ...defaultParams('chromaKey'), ...params } });

/** The green-screen video over a blue image on the track below (or over nothing: the black canvas). */
function keyedProject(video: MediaRef, blue: MediaRef | null, effects: VideoEffect[]): Project {
  const size = { width: video.width!, height: video.height! };
  const transform = fitTransform(size, size, 'fit');
  const fg = { ...newTrack('video'), id: 'fg', clips: [clipOf(video, { out: 1, effects, transform })] };
  const bg = { ...newTrack('video'), id: 'bg', clips: blue ? [clipOf(blue, { out: 1, transform })] : [] };
  const media = { [video.id]: video, ...(blue ? { [blue.id]: blue } : {}) };
  return { version: 5, format: { ...size, fps: 30 }, tracks: [bg, fg, { ...newTrack('audio'), id: 'audio' }], media };
}

async function greenScreen(page: Page): Promise<{ video: MediaRef; blue: MediaRef }> {
  const [video] = await importPaths(page, [join(dir, 'green-screen.mp4')]);
  const blue = await page.evaluate(() => window.cf.putImageMedia(160, 160, [0, 0, 255]));
  return { video, blue };
}

/** Chebyshev distance of a pixel from the fixture's centre (the square is ≤ 40, the ramp 40..48). */
const cheb = (x: number, y: number): number => Math.max(Math.abs(x - 80), Math.abs(y - 80));

test('green screen over a blue layer: green shows blue, red stays red, the soft edge has no green fringe', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const { video, blue } = await greenScreen(page);
  const [plain] = await render(page, keyedProject(video, blue, []), [0.5]);
  const worstFringe: Record<string, number> = {};
  const defSpill = defaultParams('chromaKey').spill;
  for (const spill of [1, defSpill]) {
    const r = await renderEffects(page, keyedProject(video, blue, [ck({ spill })]), [0.5]);
    expect(r.error).toBeNull();
    expect(r.passes).toEqual([1]);
    const f = r.frames[0];
    let blended = 0;
    let fringe = -255;
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const [R, G, B] = px(f, x, y);
        const d = cheb(x, y);
        if (spill === 1 && d >= 54) expect([R, G, B], `green at ${x},${y} shows blue`).toEqual([0, 0, 255]);
        if (spill === 1 && d <= 36) {
          const want = px(plain, x, y);
          expect(Math.abs(R - want[0]) + Math.abs(G - want[1]) + Math.abs(B - want[2]), `red at ${x},${y}`).toBeLessThanOrEqual(3);
          expect(R).toBeGreaterThan(240);
        }
        if (d > 36 && d < 54) {
          fringe = Math.max(fringe, G - Math.max(R, B));
          if (R > 40 && B > 40) blended++;
        }
      }
    }
    worstFringe[spill] = fringe;
    expect(fringe, `edge ring: G − max(R, B) at spill ${spill}`).toBeLessThanOrEqual(8);
    if (spill === 1) {
      expect(blended, 'edge pixels blend red with the blue below').toBeGreaterThan(100);
    }
  }
  console.log(`edge ring max G − max(R, B): spill 1 → ${worstFringe[1]}, default spill ${defSpill} → ${worstFringe[defSpill]}`);
});

test('similarity 0 keeps everything: spill 0 draws no pass, and with spill nothing below shows through', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const { video, blue } = await greenScreen(page);
  const [plain] = await render(page, keyedProject(video, blue, []), [0.5]);
  const off = await renderEffects(page, keyedProject(video, blue, [ck({ similarity: 0, spill: 0 })]), [0.5]);
  expect(off.passes).toEqual([0]);
  expect(off.frames[0].data).toEqual(plain.data);
  const overBlue = await renderEffects(page, keyedProject(video, blue, [ck({ similarity: 0 })]), [0.5]);
  const overBlack = await renderEffects(page, keyedProject(video, null, [ck({ similarity: 0 })]), [0.5]);
  expect(overBlue.passes).toEqual([1]);
  expect(overBlue.frames[0].data).toEqual(overBlack.frames[0].data);
});

test('a half-alpha PNG edge keeps its alpha and straight colour (no halo); transparency stays transparent', async ({ page }) => {
  await openHarness(page);
  const C = [200, 120, 60] as const;
  const m = await edgeImage(page, [...C]);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const format = { width: 64, height: 64, fps: 30 };
  const frames = async (effects: VideoEffect[]) =>
    Promise.all(overBackdrops(m, white, effects, format).map(async (p) => (await renderEffects(page, p, [0.5])).frames[0]));
  const [pb, pw] = await frames([]);
  const [fb, fw] = await frames([ck()]);
  for (let y = 0; y < 64; y += 3) {
    for (const x of [10, 33, 36, 39, 40, 43]) {
      const before = straight(pb, pw, x, y);
      const after = straight(fb, fw, x, y);
      expect(Math.abs(after.a - before.a), `alpha at ${x},${y}`).toBeLessThanOrEqual(1.5 / 255);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(after.rgb[k] - before.rgb[k]), `colour at ${x},${y}: ${after.rgb} vs ${before.rgb}`)
          .toBeLessThanOrEqual(1.5 / before.a);
      }
    }
    expect(px(fw, 56, y)).toEqual([255, 255, 255]);
  }
});

test('a half-alpha, partly keyed green edge matches the reference (chroma and spill use the straight colour)', async ({ page }) => {
  await openHarness(page);
  const m = await edgeImage(page, [60, 200, 40]);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const format = { width: 64, height: 64, fps: 30 };
  const params = { ...defaultParams('chromaKey'), similarity: 0.3, smoothness: 0.1 };
  const frames = async (effects: VideoEffect[]) =>
    Promise.all(overBackdrops(m, white, effects, format).map(async (p) => (await renderEffects(page, p, [0.5])).frames[0]));
  const [pb, pw] = await frames([]);
  const [fb] = await frames([ck(params)]);
  // The straight colour/alpha of the plain render (opaque 0..31, 50 % alpha 32..39, 15 % alpha 40..43) is the reference input.
  const src = floatImage(64, 64, (x, y) => {
    const s = straight(pb, pw, x, y);
    return { rgb: s.rgb.map((v) => Math.min(255, Math.max(0, v))), a: s.a };
  });
  const k = keyAlpha([60 / 255, 200 / 255, 40 / 255], [0, 1, 0], params.similarity, params.smoothness);
  expect(k, 'the fixture colour is partly keyed').toBeGreaterThan(0.2);
  expect(k).toBeLessThan(0.8);
  const err = worstVsReference(fb, chromaKeyRef(src, params));
  expect(err, 'half-alpha edge vs reference').toBeLessThanOrEqual(3);
  // The half-alpha column keeps ~ a * k of the colour: well below the opaque column's k share, above zero.
  const [r, g] = [px(fb, 35, 10), px(fb, 10, 10)];
  expect(g[1]).toBeGreaterThan(0);
  expect(r[1]).toBeGreaterThan(0);
});

/** Each param alone at its min and at its max, the defaults and combined sets (other keys, soft and hard ramps). */
const PARAM_SETS: Record<string, number>[] = [
  ...VIDEO_EFFECTS.chromaKey.params.flatMap((d) => [{ [d.key]: d.min }, { [d.key]: d.max }]),
  {},
  { keyR: 0, keyG: 0, keyB: 1, similarity: 0.5, smoothness: 0.3, spill: 1 },
  { keyR: 0.2, keyG: 0.7, keyB: 0.3, similarity: 0.2, smoothness: 0, spill: 0.8 },
  { keyR: 0.9, keyG: 0.1, keyB: 0.6, similarity: 0.6, smoothness: 1, spill: 0.3 },
  { keyR: 1, keyG: 0, keyB: 0, similarity: 0.45, smoothness: 0.15, spill: 1 },
];

async function driftGuard(page: Page, m: MediaRef): Promise<number> {
  const format = { width: m.width!, height: m.height!, fps: 30 };
  const clips = PARAM_SETS.map((params, i) => clipOf(m, { start: i, out: 1, effects: [ck(params)] }));
  const r = await renderEffects(page, project(format, [m], clips), PARAM_SETS.map((_, i) => i + 0.5));
  expect(r.error).toBeNull();
  expect(r.unavailable).toEqual([]);
  const [plain] = await render(page, project(format, [m], [clipOf(m, { out: 1 })]), [0]);
  const img = opaque(plain);
  let worst = 0;
  for (const [i, params] of PARAM_SETS.entries()) {
    const err = worstVsReference(r.frames[i], chromaKeyRef(img, { ...defaultParams('chromaKey'), ...params }));
    expect(err, `${JSON.stringify(params)} on ${m.width}x${m.height}`).toBeLessThanOrEqual(3);
    worst = Math.max(worst, err);
  }
  return worst;
}

test('drift guard: every param extreme, the defaults and combined sets match the CPU reference per pixel', async ({ page }) => {
  test.setTimeout(120_000);
  await openHarness(page);
  const worst = [await driftGuard(page, await gradientImage(page)), await driftGuard(page, await textureImage(page))];
  console.log(`chromaKey: max |GL − reference| = ${worst.map((w) => w.toFixed(3)).join(' (gradient), ')} (texture) / 255`);
});

test('a rotated phone video is keyed upright, matching the reference on the plain render', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'quad-cw90.mp4')]);
  const size = { width: m.width!, height: m.height! };
  const p = (effects: VideoEffect[]) =>
    project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
  const [plain] = await render(page, p([]), [0.5]);
  const params = { ...defaultParams('chromaKey'), similarity: 0.6, smoothness: 1, spill: 1 };
  const r = await renderEffects(page, p([ck(params)]), [0.5]);
  expect(r.error).toBeNull();
  expect(r.passes).toEqual([1]);
  const ref = chromaKeyRef(opaque(plain), params);
  expect(worstVsReference(r.frames[0], ref), 'keyed rotated video vs reference').toBeLessThanOrEqual(3);
  // Only the green quadrant (wherever the rotation put it) is keyed; the others are untouched.
  let keyed = 0;
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const [cx, cy] = [Math.floor(x * size.width), Math.floor(y * size.height)];
    const [before, after] = [px(plain, cx, cy), px(r.frames[0], cx, cy)];
    const green = before[1] > 150 && before[0] < 40 && before[2] < 40;
    if (green) keyed++;
    if (green) for (const v of after) expect(v, `keyed quadrant at ${cx},${cy}`).toBeLessThanOrEqual(12);
    else expect(after, `kept quadrant at ${cx},${cy}`).toEqual(before);
  }
  expect(keyed).toBe(1);
});
