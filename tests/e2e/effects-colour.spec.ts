// The fused colour effect (Plan 4 Task 4) through the real compositor, checked against the CPU reference colourPixel.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, px, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { fitTransform } from '../../src/core/merge';
import { newTrack } from '../../src/core/model';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';
import { defaultParams } from '../../src/core/videoEffects';
import { colourPixel } from '../../src/render/effects/colourMath';

const dir = ensureFixtures();
const FORMAT = { width: 64, height: 64, fps: 30 };

let n = 0;
const colour = (params: Record<string, number> = {}): VideoEffect =>
  ({ id: `fx-${++n}`, type: 'colour', enabled: true, params: { ...defaultParams('colour'), ...params } });

const SAMPLES: Record<string, number>[] = [
  { brightness: 0.2, contrast: 0.3, saturation: -0.4 },
  { exposure: 1, temperature: 0.6, tint: -0.5 },
  { exposure: -1.3, hue: 120, shadows: 0.7, highlights: -0.6 },
  { contrast: -0.5, saturation: 0.8, hue: -45, brightness: -0.1, temperature: -0.8, tint: 0.4 },
];

/** colourPixel on 0..255 values. */
const expected = (c: number[], p: Record<string, number>): number[] =>
  colourPixel([c[0] / 255, c[1] / 255, c[2] / 255], { ...defaultParams('colour'), ...p }).map((v) => v * 255);

function renderEffects(page: Page, p: Project, times: number[]) {
  return page.evaluate(({ p, times }) => window.cf.renderEffects(p, times), { p, times });
}

const imageProject = (m: MediaRef, effects: VideoEffect[]): Project =>
  project(FORMAT, [m], [clipOf(m, { out: 1, effects })]);

function worstDiff(a: number[], b: number[]): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

test('defaults leave solid red, mid-grey and white unchanged (one pass each)', async ({ page }) => {
  await openHarness(page);
  for (const rgb of [[255, 0, 0], [128, 128, 128], [255, 255, 255]] as Rgb[]) {
    const m = await page.evaluate((rgb) => window.cf.putImageMedia(64, 64, rgb), rgb);
    const r = await renderEffects(page, imageProject(m, [colour()]), [0]);
    expect(r.error).toBeNull();
    expect(r.passes).toEqual([1]);
    const [plain] = await render(page, imageProject(m, []), [0]);
    expect(worstDiff(r.frames[0].data, plain.data), `defaults on ${rgb}`).toBeLessThanOrEqual(1);
    expectNear(px(r.frames[0], 32, 32), rgb, 1, `defaults on ${rgb}`);
  }
});

test('sample params match the CPU reference within 3/255 on every pixel, upright', async ({ page }) => {
  await openHarness(page);
  const TL: Rgb = [200, 40, 10];
  const m = await page.evaluate((TL) => window.cf.putImageMedia(64, 64, TL, { right: [10, 120, 250], bottom: [128, 128, 128] }), TL);
  const [plain] = await render(page, imageProject(m, []), [0]);
  let worst = 0;
  for (const params of SAMPLES) {
    const r = await renderEffects(page, imageProject(m, [colour(params)]), [0]);
    expect(r.error).toBeNull();
    const f = r.frames[0];
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const want = expected(px(plain, x, y), params);
        const got = px(f, x, y);
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(got[k] - want[k]));
      }
    }
    expect(worst, `GL vs colourPixel for ${JSON.stringify(params)}`).toBeLessThanOrEqual(3);
  }
  console.log(`colour effect: max |GL − colourPixel| = ${worst.toFixed(3)} / 255`);
});

/** A 64x64 PNG: columns 0-31 opaque `c`, 32-39 `c` at 50 % alpha, the rest transparent. */
function edgeImage(page: Page, c: Rgb): Promise<MediaRef> {
  return page.evaluate(async (c) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    ctx.fillRect(0, 0, 32, 64);
    ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.5)`;
    ctx.fillRect(32, 0, 8, 64);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
    const id = `edge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await window.cf.putMedia(id, blob);
    return { id, name: `${id}.png`, kind: 'image', duration: 5, width: 64, height: 64, hasAudio: false } as const;
  }, c);
}

/** The edge clip over a black (canvas) and over a white (track below) backdrop. */
function overBackdrops(edge: MediaRef, white: MediaRef, effects: VideoEffect[]): [Project, Project] {
  const fg = { ...newTrack('video'), id: 'fg', clips: [clipOf(edge, { out: 1, effects })] };
  const bg = { ...newTrack('video'), id: 'bg', clips: [clipOf(white, { out: 1 })] };
  const audio = { ...newTrack('audio'), id: 'audio' };
  const media = { [edge.id]: edge, [white.id]: white };
  return [
    { version: 4, format: FORMAT, tracks: [fg, audio], media },
    { version: 4, format: FORMAT, tracks: [bg, fg, audio], media },
  ];
}

/** Straight colour (0..255) and alpha (0..1) of a pixel from its composite over black and over white. */
type Pixels = { width: number; data: number[] };

function straight(black: Pixels, white: Pixels, x: number, y: number): { rgb: number[]; a: number } {
  const b = px(black, x, y);
  const w = px(white, x, y);
  const a = 1 - (w[0] - b[0] + w[1] - b[1] + w[2] - b[2]) / 3 / 255;
  return { rgb: b.map((v) => v / a), a };
}

test('a 50 %-alpha edge keeps its colour and alpha: no premultiplied halo', async ({ page }) => {
  await openHarness(page);
  const C: Rgb = [200, 120, 60];
  const edge = await edgeImage(page, C);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const params = { brightness: 0.15, contrast: 0.3, exposure: 0.5, temperature: 0.3 };
  const plain = overBackdrops(edge, white, []);
  const fxd = overBackdrops(edge, white, [colour(params)]);
  const [plainB] = await render(page, plain[0], [0]);
  const [plainW] = await render(page, plain[1], [0]);
  const fxB = (await renderEffects(page, fxd[0], [0])).frames[0];
  const fxW = (await renderEffects(page, fxd[1], [0])).frames[0];
  let worst = 0;
  for (const y of [4, 32, 60]) {
    // Opaque interior: the reference applied to the measured input.
    expectNear(px(fxB, 16, y), expected(px(plainB, 16, y), params), 3, `opaque interior at y=${y}`);
    for (const x of [33, 36, 39]) {
      const before = straight(plainB, plainW, x, y);
      const after = straight(fxB, fxW, x, y);
      expect(before.a, 'fixture edge is half transparent').toBeGreaterThan(0.45);
      expect(before.a).toBeLessThan(0.55);
      expect(Math.abs(after.a - before.a), `alpha at ${x},${y}`).toBeLessThanOrEqual(1.5 / 255);
      const want = expected(before.rgb, params);
      expectNear(after.rgb, want, 3, `edge colour at ${x},${y}`);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(after.rgb[k] - want[k]));
    }
    // Fully transparent stays transparent: the white backdrop shows through untouched.
    expectNear(px(fxW, 56, y), [255, 255, 255], 0, `transparent at y=${y}`);
  }
  console.log(`colour effect edge: max straight-colour error = ${worst.toFixed(3)} / 255`);
});

test('a rotated phone video stays upright under a colour effect and matches the reference', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'quad-cw90.mp4')]);
  const size = { width: m.width!, height: m.height! };
  const params = SAMPLES[2];
  const p = (effects: VideoEffect[]) =>
    project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
  const fxd = await renderEffects(page, p([colour(params)]), [0.5]);
  expect(fxd.error).toBeNull();
  expect(fxd.passes).toEqual([1]);
  const [plain] = await render(page, p([]), [0.5]);
  const { width: w, height: h } = size;
  for (const [x, y] of [[w / 4, h / 4], [(3 * w) / 4, h / 4], [w / 4, (3 * h) / 4], [(3 * w) / 4, (3 * h) / 4]]) {
    const at = [Math.floor(x), Math.floor(y)] as const;
    expectNear(px(fxd.frames[0], ...at), expected(px(plain, ...at), params), 3, `quadrant at ${at}`);
  }
  // The four quadrants stay distinct after the effect (no flip collapsed them onto each other).
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => px(fxd.frames[0], x, y).join());
  expect(new Set(corners).size).toBe(4);
});
