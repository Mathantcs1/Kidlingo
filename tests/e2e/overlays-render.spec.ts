// Overlay clips through the real compositor (Plan 4 Task 12): each type draws in its region and nowhere else, the
// progress bar fills with clip time, the lower third slides in deterministically, overlays composite over pictures
// with opacity, hidden layers and clips out of range draw nothing, and overlays never run effects or blend modes.
import { test, expect } from '@playwright/test';
import { clipOf, openHarness } from './harness-helpers';
import { FMT, at, boxOf, coverage, hex, layered, near, overlayClip, renderFrames, rowFraction, samePixels } from './overlay-helpers';
import type { Rgb } from './overlay-helpers';
import { OVERLAY_TYPES, overlayDefaults } from '../../src/core/overlaySpec';
import type { MediaRef } from '../../src/core/model';

const BLACK: Rgb = [0, 0, 0];

test('each overlay type draws inside its default region over a black frame and nowhere else', async ({ page }) => {
  await openHarness(page);
  const clips = OVERLAY_TYPES.map((type) => overlayClip(type, 0, 5));
  const frames = await renderFrames(page, clips.map((c) => layered([[c]])), clips.map(() => 2.5));
  frames.forEach((f, i) => {
    const c = clips[i];
    const box = boxOf(c);
    const cov = coverage(f, box);
    console.log(`${c.overlay!.type}: box ${JSON.stringify(box)} lit ${(cov.inside * 100).toFixed(1)}%, outside ${cov.outside}`);
    expect(f.glError).toBe(0);
    expect(cov.outside, `${c.overlay!.type} outside its box`).toBe(0);
    expect(cov.inside, `${c.overlay!.type} inside its box`).toBeGreaterThan(c.overlay!.type === 'sticker' ? 0.25 : 0.8);
    expect(f.overlayTextures.count).toBe(1);
  });
  const [lower, sub, bar, sticker] = frames;
  const d = (t: (typeof OVERLAY_TYPES)[number]) => overlayDefaults(t);
  // Colours: the lower third's accent bar and box, the button, the bar's track, the sticker's fill.
  const lb = boxOf(clips[0]);
  expect(near(at(lower, Math.round(lb.l + 2), Math.round((lb.t + lb.b) / 2)), hex(d('lowerThird').accent), 3)).toBe(true);
  expect(near(at(lower, Math.round(lb.r - 6), Math.round(lb.t + 6)), hex(d('lowerThird').colour), 3)).toBe(true);
  const sb = boxOf(clips[1]);
  expect(near(at(sub, Math.round(sb.r - 6), Math.round(sb.t + 6)), hex(d('subscribe').colour), 3)).toBe(true);
  expect(near(at(bar, FMT.width - 3, FMT.height - 3), hex(d('progressBar').colour), 3)).toBe(true);
  expect(near(at(sticker, FMT.width / 2, FMT.height / 2), hex(d('sticker').colour), 3)).toBe(true);
  // Text is drawn: the lower third has white pixels.
  let white = 0;
  for (let y = Math.ceil(lb.t); y < lb.b; y++) for (let x = Math.ceil(lb.l); x < lb.r; x++) if (near(at(lower, x, y), [255, 255, 255], 40)) white++;
  expect(white).toBeGreaterThan(50);
});

test('the progress bar fills with clip time: ~25 % and ~50 % (±3 %)', async ({ page }) => {
  await openHarness(page);
  const c = overlayClip('progressBar', 1, 2);
  const p = layered([[c]]);
  const frames = await renderFrames(page, [p], [1.5, 2, 2.9]);
  const accent = hex(c.overlay!.accent);
  const y = FMT.height - 4;
  const got = frames.map((f) => rowFraction(f, y, accent, 3));
  console.log(`progress bar filled: ${got.map((v) => (v * 100).toFixed(1)).join(', ')} %`);
  expect(Math.abs(got[0] - 0.25)).toBeLessThanOrEqual(0.03);
  expect(Math.abs(got[1] - 0.5)).toBeLessThanOrEqual(0.03);
  expect(Math.abs(got[2] - 0.95)).toBeLessThanOrEqual(0.03);
  // Filled from the left.
  expect(near(at(frames[1], 2, y), accent, 3)).toBe(true);
  expect(near(at(frames[1], FMT.width - 3, y), hex(c.overlay!.colour), 3)).toBe(true);
});

test('the lower third slides in from the left over 0.4 s, deterministically, and out at the end', async ({ page }) => {
  await openHarness(page);
  const c = overlayClip('lowerThird', 0, 3);
  const p = layered([[c]]);
  const times = [0, 0.2, 0.3, 0.2, 1.5, 3 - 1 / 30];
  const frames = await renderFrames(page, [p], times);
  const again = await renderFrames(page, [p], [0.2]);
  const box = boxOf(c);
  const right = (f: (typeof frames)[number]): number => {
    let r = -1;
    for (let y = Math.ceil(box.t); y < box.b; y++) for (let x = 0; x < f.width; x++) if (at(f, x, y).some((v) => v > 0)) r = Math.max(r, x);
    return r;
  };
  const edges = frames.map(right);
  console.log(`lower third right edge per time ${times.join(', ')}: ${edges.join(', ')} (box ${box.l}..${box.r})`);
  expect(edges[0]).toBe(-1);
  expect(edges[1]).toBeLessThan(edges[2]);
  expect(edges[2]).toBeLessThan(edges[4]);
  expect(Math.abs(edges[4] - box.r)).toBeLessThanOrEqual(1.5);
  // Half way through the slide the box is shifted left by half its width.
  expect(Math.abs(edges[1] - (box.r - (box.r - box.l) / 2))).toBeLessThanOrEqual(1.5);
  expect(edges[5]).toBeLessThan(box.l + 0.2 * (box.r - box.l));
  // Same frame time, same pixels (also from a fresh compositor); different frame times differ.
  expect(samePixels(frames[3], frames[1])).toBe(true);
  expect(samePixels(again[0], frames[1])).toBe(true);
  expect(samePixels(frames[2], frames[1])).toBe(false);
});

test('overlays composite over pictures with opacity; hidden layers and clips out of range draw nothing', async ({ page }) => {
  await openHarness(page);
  const red: MediaRef = await page.evaluate((f) => window.cf.putImageMedia(f.width, f.height, [200, 30, 30]), FMT);
  const bg = clipOf(red, { out: 4 });
  const sticker = overlayClip('sticker', 1, 2, { spec: { colour: '#20e040' } });
  const half = overlayClip('sticker', 1, 2, { spec: { colour: '#20e040' }, transform: { ...sticker.transform, opacity: 0.5 } });
  const frames = await renderFrames(page, [
    layered([[bg], [sticker]], [red]),
    layered([[bg], [half]], [red]),
    layered([[bg], [sticker]], [red], [1]),
    layered([[bg], [sticker]], [red]),
  ], [1.5, 1.5, 1.5, 3.5]);
  const mid = { x: FMT.width / 2, y: FMT.height / 2 };
  expect(near(at(frames[0], mid.x, mid.y), [32, 224, 64], 3)).toBe(true);
  expect(near(at(frames[0], 5, 5), [200, 30, 30], 2)).toBe(true);
  expect(near(at(frames[1], mid.x, mid.y), [116, 127, 47], 3)).toBe(true);
  expect(near(at(frames[2], mid.x, mid.y), [200, 30, 30], 2)).toBe(true);
  expect(frames[2].overlayTextures.count).toBe(0);
  expect(near(at(frames[3], mid.x, mid.y), [200, 30, 30], 2)).toBe(true);
  // The texture of an overlay that left the frame is freed at once.
  expect(frames[3].overlayTextures).toEqual({ count: 0, bytes: 0 });
  expect(frames[0].overlayTextures.count).toBe(1);
});

test('overlays never run effects or blend modes, even in a hand-made project', async ({ page }) => {
  await openHarness(page);
  const red: MediaRef = await page.evaluate((f) => window.cf.putImageMedia(f.width, f.height, [200, 30, 30]), FMT);
  const plain = overlayClip('sticker', 0, 2);
  const forced = { ...plain, blend: 'difference' as const, fit: 'blur' as const, effects: [{ id: 'e', type: 'invert' as const, enabled: true, params: { amount: 1 } }] };
  const [a, b] = await renderFrames(page, [layered([[clipOf(red, { out: 2 })], [plain]], [red]), layered([[clipOf(red, { out: 2 })], [forced]], [red])], [1, 1]);
  expect(samePixels(a, b)).toBe(true);
  expect([b.effectPasses, b.blendPasses]).toEqual([0, 0]);
  expect(at(a, 2, 2)).not.toEqual(BLACK);
});

test('overlay textures follow the size they are shown at, capped at 2048 px', async ({ page }) => {
  await openHarness(page);
  const c = overlayClip('sticker', 0, 2);
  const big = overlayClip('sticker', 0, 2, { transform: { ...c.transform, scale: 20 } });
  const [native] = await renderFrames(page, [layered([[c]])], [1]);
  const [x2, capped] = await renderFrames(page, [layered([[c]]), layered([[big]])], [1, 1], { width: 640, height: 360 });
  const side = (f: { overlayTextures: { bytes: number } }) => Math.round(Math.sqrt(f.overlayTextures.bytes / 4));
  expect(side(native)).toBe(54);
  expect(side(x2)).toBe(108);
  expect(side(capped)).toBe(2048);
});
