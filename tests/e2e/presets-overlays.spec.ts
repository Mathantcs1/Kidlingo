// Overlays with animation presets through the real compositor (Plan 5B Task 6): a lower third with an In or Out preset
// drops its built-in slide at that edge (D13, Q10), and an overlay's texture is sized once for the largest scale its
// keys, key loops and presets can reach (capped), so preset frames never re-upload and the overshoot stays sharp.
import { test, expect } from '@playwright/test';
import { overlayTextureSize } from '../../src/render/overlays/textures';
import { maxDrawnScale } from '../../src/core/drawnScale';
import { openHarness } from './harness-helpers';
import { frames, key, maxDiff, samePixels, stack } from './keyframe-helpers';
import type { Frame } from './keyframe-helpers';
import { overlayClip } from './overlay-helpers';
import { LINEAR, drawn, use } from './preset-helpers';
import type { Clip } from '../../src/core/model';

test.setTimeout(120_000);

const FMT = { width: 320, height: 180, fps: 30 };
const STICKER = { width: 54, height: 54 }; // overlayBaseSize('sticker', 320×180)
/** Mean |a − b| over the RGB bytes. */
const meanDiff = (a: Frame, b: Frame): number => {
  let s = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) s += Math.abs(a.data[i] - b.data[i]);
  return s / ((a.data.length / 4) * 3);
};
const still = (c: Clip, opacity: number): Clip => ({ ...c, motion: undefined, transform: { ...c.transform, opacity } });

test('a lower third with an In preset has no built-in slide-in (0.1 s), with an Out preset no slide-out; the other edge keeps it', async ({ page }) => {
  await openHarness(page);
  const lt = overlayClip('lowerThird', 0, 2, { spec: { text: 'Ada Lovelace', subtext: 'Mathematician' } });
  const withIn = { ...lt, motion: { in: use('fade', 'in', { duration: 1, ease: LINEAR }) } };
  const withOut = { ...lt, motion: { out: use('fade', 'out', { duration: 1, ease: LINEAR }) } };
  const oIn = drawn(withIn, 0.1, FMT).opacity;
  const oOut = drawn(withOut, 1.9, FMT).opacity;
  const ps = [withIn, still(lt, oIn), lt, withOut, still(lt, oOut), withIn, lt].map((c) => stack(FMT, [[c]], []));
  const [inAt, inRef, plainAt, outAt, outRef, inEnd, plainEnd] = await frames(page, ps, [0.1, 1, 0.1, 1.9, 1, 1.9, 1.9]);
  console.log(`lower third: opacity ${oIn.toFixed(3)} / ${oOut.toFixed(3)}; in vs fully-in ${maxDiff(inAt, inRef)}, in vs built-in slide ${maxDiff(inAt, plainAt)}`);
  expect(oIn).toBeCloseTo(0.1, 9);
  expect(oOut).toBeCloseTo(0.1, 9);
  // With the preset the picture at 0.1 s is the fully slid-in lower third at the preset's opacity (no second animation).
  expect(samePixels(inAt, inRef)).toBe(true);
  expect(samePixels(outAt, outRef)).toBe(true);
  expect(maxDiff(inAt, plainAt)).toBeGreaterThan(10); // the built-in slide at 0.1 s really differs
  // An In preset leaves the built-in slide-OUT on (and the preset is over by then): same as no preset at 1.9 s.
  expect(samePixels(inEnd, plainEnd)).toBe(true);
});

test('Pop and Zoom on a sticker: ONE texture sized for the overshoot across 10 frames, one upload, sharp at the peak', async ({ page }) => {
  await openHarness(page);
  const sticker = overlayClip('sticker', 0, 2);
  const pop = { ...sticker, motion: { in: use('pop', 'in') } };
  const zoom = { ...sticker, motion: { in: use('zoom', 'in', { params: { from: 2 } }) } };
  const times = Array.from({ length: 10 }, (_, i) => i / 30);
  const side = (c: Clip) => overlayTextureSize(STICKER, maxDrawnScale(c), 1, 2048).width;
  expect(maxDrawnScale(pop)).toBeCloseTo(1.15, 12);
  expect(maxDrawnScale(zoom)).toBe(2);
  for (const c of [pop, zoom]) {
    const got = await frames(page, [stack(FMT, [[c]], [])], times);
    console.log(`${c.motion!.in!.preset}: texture ${side(c)} px, stats ${JSON.stringify(got.map((f) => [f.overlayTextures.bytes, f.overlayUploads]))}`);
    for (const f of got) expect(f.overlayTextures).toEqual({ count: 1, bytes: side(c) * side(c) * 4 });
    expect(got.at(-1)!.overlayUploads).toBe(1);
  }
  // Sharp: the overshoot frame is drawn from a texture at least as large as the picture, like a static sticker there.
  const peakT = times.reduce((b, t) => (drawn(pop, t, FMT).scale > drawn(pop, b, FMT).scale ? t : b));
  const peak = drawn(pop, peakT, FMT).scale;
  expect(side(pop)).toBeGreaterThanOrEqual(Math.floor(54 * peak));
  const big = { ...sticker, transform: { ...sticker.transform, scale: peak } };
  const zt = 3 / 30;
  const zoomStill = { ...sticker, transform: drawn(zoom, zt, FMT) };
  const [atPeak, staticPeak, z, zStatic] = await frames(page, [pop, big, zoom, zoomStill].map((c) => stack(FMT, [[c]], [])), [peakT, peakT, zt, zt]);
  console.log(`pop peak ${peak.toFixed(4)} at ${peakT}s: max diff vs static ${maxDiff(atPeak, staticPeak)}; zoom at ${zt.toFixed(3)}s (scale ${zoomStill.transform.scale.toFixed(3)}) vs static: max ${maxDiff(z, zStatic)}, mean ${meanDiff(z, zStatic).toFixed(3)}`);
  expect(maxDiff(atPeak, staticPeak)).toBeLessThanOrEqual(8);
  // Drawn from the ×2 texture, minified (edges filter slightly differently): as sharp as a static sticker on average.
  expect(meanDiff(z, zStatic)).toBeLessThanOrEqual(0.5);
});

test('an offset scale loop with no count (and a sub-frame period) gets a capped texture, uploaded once', async ({ page }) => {
  await openHarness(page);
  const sticker = overlayClip('sticker', 0, 2);
  const looped = { ...sticker, keys: { scale: [key(0, 1), key(0.01, 1.5)], loops: { scale: { mode: 'offset' as const, count: null } } } };
  const counted = { ...sticker, keys: { scale: [key(0, 0.5), key(0.5, 1)], loops: { scale: { mode: 'offset' as const, count: 2 } } } };
  expect(maxDrawnScale(looped)).toBeGreaterThan(5); // 200 cycles × 0.5 on top of 1.5: 5 000+ px at 54 px, capped at 2048
  expect(maxDrawnScale(counted)).toBe(2); // 1 + 2 × 0.5
  const got = await frames(page, [stack(FMT, [[looped]], [])], [0.1, 0.5, 1.5]);
  console.log(`looped scale texture stats ${JSON.stringify(got.map((f) => [f.overlayTextures.bytes, f.overlayUploads]))}`);
  for (const f of got) expect(f.overlayTextures).toEqual({ count: 1, bytes: 2048 * 2048 * 4 });
  expect(got.at(-1)!.overlayUploads).toBe(1);
  const [c1] = await frames(page, [stack(FMT, [[counted]], [])], [1.4]);
  expect(c1.overlayTextures).toEqual({ count: 1, bytes: 108 * 108 * 4 });
});
