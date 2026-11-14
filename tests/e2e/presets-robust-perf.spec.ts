// Plan 5B Task 10: performance and memory guards for presets on SwiftShader. A 1080p preview frame of the 8-clip preset
// project (4 presets + curved path + loops per clip) costs about what the same project frozen at one time costs
// (interleaved medians, Plan 4's method, <= 1.2x, reported); the same effect targets; presets on overlays neither
// change the overlay texture count/bytes nor re-upload per frame; and the total overlay texture memory is bounded
// (Task 10 budget) however many overlay clips are drawn.
import { test, expect } from '@playwright/test';
import { openHarness } from './harness-helpers';
import { frames } from './keyframe-helpers';
import { layered, overlayClip, renderFrames } from './overlay-helpers';
import { emphasis, loop, use } from './preset-helpers';
import { LEN, eightPresetClips } from './preset-harness-helpers';
import { frozen } from './robust-harness-helpers';
import { OVERLAY_BYTE_BUDGET } from '../../src/render/overlays/textures';
import type { Clip, Project } from '../../src/core/model';

test.setTimeout(300_000);

test('preview: a 1080p frame of 8 preset clips renders within 1.2x the same project frozen (interleaved medians)', async ({ page }) => {
  await openHarness(page);
  const animated = await eightPresetClips(page);
  const still = frozen(animated, LEN / 2);
  expect(still.tracks.flatMap((t) => t.clips).some((c) => c.keys || c.motion)).toBe(false);
  const times = Array.from({ length: 15 }, (_, i) => (i * 2 + 1) / 3);
  const [a, s] = await page.evaluate(({ a, b, times }) => window.cf.timeRenderPair(a, b, times), { a: animated, b: still, times });
  const ratio = a.median / s.median;
  const note = `1080p, 8 clips x (4 presets + curved path + loops + 4 transform keys + 2 effect keys) over ${times.length} interleaved frames: ` +
    `frozen min ${s.min.toFixed(1)} / median ${s.median.toFixed(1)} ms, animated min ${a.min.toFixed(1)} / median ${a.median.toFixed(1)} ms ` +
    `(x${ratio.toFixed(3)} on medians, x${(a.min / s.min).toFixed(3)} on minima); effect passes ${a.passes} vs ${s.passes}; ` +
    `targets ${a.memory.targets} (${(a.memory.bytes / 2 ** 20).toFixed(1)} MiB) vs ${s.memory.targets}`;
  console.log(note);
  test.info().annotations.push({ type: 'performance', description: note });
  expect(a.memory).toEqual(s.memory);
  expect(a.passes).toBeLessThanOrEqual(s.passes);
  expect(a.passes).toBeGreaterThan(0.8 * s.passes);
  expect(ratio).toBeLessThanOrEqual(1.2);
});

/** A sticker (Pop / Pulse / Breathe / Zoom out) and a lower third (Slide in / Wobble / Float / Fade out: both built-in slides off). */
function presetOverlays(): Clip[] {
  return [
    overlayClip('sticker', 0, LEN, { id: 'ov-s', motion: { in: use('pop', 'in'), emphasis: emphasis('pulse', 2), loop: loop('breathe'), out: use('zoom', 'out') } }),
    overlayClip('lowerThird', 0, LEN, { id: 'ov-l', motion: { in: use('slide', 'in'), emphasis: emphasis('wobble', 4), loop: loop('float'), out: use('fade', 'out') } }),
  ];
}

test('memory: preset overlays keep one texture each, sized once, and upload nothing per frame', async ({ page }) => {
  await openHarness(page);
  const p: Project = await eightPresetClips(page, 0, presetOverlays());
  const times = Array.from({ length: 16 }, (_, i) => i * 0.6);
  const out = await frames(page, [p], times, { width: 320, height: 180 });
  const note = `overlay textures ${JSON.stringify(out.at(-1)!.overlayTextures)}, uploads per frame ${out.map((f) => f.overlayUploads).join(',')}`;
  console.log(note);
  test.info().annotations.push({ type: 'memory', description: note });
  for (const [i, f] of out.entries()) {
    expect(f.glError, `frame ${i}`).toBe(0);
    expect(f.overlayTextures.count, `frame ${i}`).toBe(2);
    expect(f.overlayTextures.bytes, `frame ${i}: no growth`).toBe(out[0].overlayTextures.bytes);
  }
  // Sized once for the largest scale the presets reach; the lower third's In preset turns its built-in slide off (one
  // still), so nothing is re-uploaded after the first frames.
  expect(out.at(-1)!.overlayUploads - out[2].overlayUploads).toBe(0);
});

test('memory: many big overlay clips never exceed the total overlay texture budget; their draw stays valid', async ({ page }) => {
  await openHarness(page);
  const count = 40;
  const ovs = Array.from({ length: count }, (_, i) => overlayClip('sticker', 0, 2, {
    id: `big-${i}`, transform: { x: (i % 6) * 20 - 50, y: Math.floor(i / 6) * 20 - 30, scale: 20, rotation: 0, opacity: 0.5 },
  }));
  const [one] = await renderFrames(page, [layered([[ovs[0]]])], [0.5]);
  const all = await renderFrames(page, [layered(ovs.map((o) => [o]))], [0.5, 1, 1.5]);
  const note = `${count} stickers at scale 20: one texture ${(one.overlayTextures.bytes / 2 ** 20).toFixed(1)} MiB; all ${all.map((f) => `${f.overlayTextures.count} textures ${(f.overlayTextures.bytes / 2 ** 20).toFixed(1)} MiB`).join(', ')}; budget ${(OVERLAY_BYTE_BUDGET / 2 ** 20).toFixed(0)} MiB`;
  console.log(note);
  test.info().annotations.push({ type: 'memory', description: note });
  expect(count * one.overlayTextures.bytes).toBeGreaterThan(OVERLAY_BYTE_BUDGET); // without a budget this would be over it
  for (const f of all) {
    expect(f.glError).toBe(0);
    expect(f.overlayTextures.count).toBe(count);
    expect(f.overlayTextures.bytes).toBeLessThanOrEqual(OVERLAY_BYTE_BUDGET + 4 * count); // + the 1x1 floor of the late ones
  }
});
