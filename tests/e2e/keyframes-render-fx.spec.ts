// Keyframed effect params, adjustment layers and overlays through the real compositor (Plan 5 Task 5): an animated
// param renders like the static render of its evaluated value; overlay textures stay put while their scale animates;
// static projects are byte-identical to before; a playhead between frames shows the frame's start.
import { test, expect } from '@playwright/test';
import { valueAt } from '../../src/core/keyframes';
import { defaultParams } from '../../src/core/videoEffects';
import type { Clip, Keyframe, VideoEffect, VideoEffectType } from '../../src/core/model';
import { openHarness } from './harness-helpers';
import { adjustmentClip, at, frames, hash, imageClip, key, maxDiff, pos, samePixels, solid, stack } from './keyframe-helpers';
import { overlayClip } from './overlay-helpers';
import { STATIC_HASHES_GL, glIdentity } from './preset-helpers';

const FMT = { width: 320, height: 180, fps: 30 };
let n = 0;
const fx = (type: VideoEffectType, params: Record<string, number>, keys?: Record<string, Keyframe[]>): VideoEffect =>
  ({ id: `kfx-${++n}`, type, enabled: true, params: { ...defaultParams(type), ...params }, ...(keys ? { keys } : {}) });

test('animated colour brightness and blur radius render like the static render of the evaluated value (±1/255)', async ({ page }) => {
  await openHarness(page);
  const m = await solid(page, 320, 180, [120, 90, 60], { right: [30, 160, 220] });
  const bright = [key(0, -0.5), key(1, 0.5)];
  const radius = [key(0, 0), key(1, 40, 'easeOut')];
  const t = 0.3; // frame 9
  const clipWith = (e: VideoEffect): Clip => imageClip(m, { effects: [e] });
  const projects = [
    stack(FMT, [[clipWith(fx('colour', {}, { brightness: bright }))]], [m]),
    stack(FMT, [[clipWith(fx('colour', { brightness: valueAt(bright, t, -1, 1) }))]], [m]),
    stack(FMT, [[clipWith(fx('blur', {}, { radius }))]], [m]),
    stack(FMT, [[clipWith(fx('blur', { radius: valueAt(radius, t, 0, 100) }))]], [m]),
    stack(FMT, [[clipWith(fx('colour', { brightness: 0 }))]], [m]),
  ];
  const [animColour, staticColour, animBlur, staticBlur, plain] = await frames(page, projects, [t, t, t, t, t]);
  console.log(`brightness ${valueAt(bright, t)}: max diff ${maxDiff(animColour, staticColour)}; radius ${valueAt(radius, t)}: max diff ${maxDiff(animBlur, staticBlur)}`);
  expect(maxDiff(animColour, staticColour)).toBeLessThanOrEqual(1);
  expect(maxDiff(animBlur, staticBlur)).toBeLessThanOrEqual(1);
  expect(maxDiff(animColour, plain)).toBeGreaterThan(20); // the key really changed the picture
});

test('adjustment layers: opacity keys lerp the effect in, and effect-param keys animate', async ({ page }) => {
  await openHarness(page);
  const red = await solid(page, 320, 180, [200, 30, 30]);
  const bg = imageClip(red);
  const fading = adjustmentClip({ effects: [fx('invert', { amount: 1 })], keys: { opacity: [key(0, 0), key(1, 1)] } });
  const amount = adjustmentClip({ effects: [fx('invert', {}, { amount: [key(0, 0), key(1, 1)] })] });
  const half = adjustmentClip({ effects: [fx('invert', { amount: 0.5 })] });
  const projects = [stack(FMT, [[bg], [fading]], [red]), stack(FMT, [[bg], [fading]], [red]), stack(FMT, [[bg], [amount]], [red]), stack(FMT, [[bg], [half]], [red])];
  const [start, mid, keyed, still] = await frames(page, projects, [0, 0.5, 0.5, 0.5]);
  console.log(`adjustment opacity 0: ${at(start, 10, 10)}, 0.5: ${at(mid, 10, 10)}; amount keys ${at(keyed, 10, 10)} vs static ${at(still, 10, 10)}`);
  at(start, 10, 10).forEach((v, k) => expect(Math.abs(v - [200, 30, 30][k])).toBeLessThanOrEqual(1));
  at(mid, 10, 10).forEach((v) => expect(Math.abs(v - 127.5)).toBeLessThanOrEqual(2));
  expect(maxDiff(keyed, still)).toBeLessThanOrEqual(1);
});

test('an overlay with animated scale keeps ONE texture (sized for its max scale) across 10 frames, sharp at the max', async ({ page }) => {
  await openHarness(page);
  const sticker = overlayClip('sticker', 0, 2);
  const animated = { ...sticker, keys: { scale: [key(0, 1), key(1, 3)] } };
  const big = { ...sticker, transform: { ...sticker.transform, scale: 3 } };
  const times = Array.from({ length: 10 }, (_, i) => i / 10);
  const got = await frames(page, [stack(FMT, [[animated]], [])], times);
  const side = 54 * 3;
  console.log(`overlay stats over 10 frames: ${JSON.stringify(got.map((f) => [f.overlayTextures.bytes, f.overlayUploads]))}`);
  for (const f of got) expect(f.overlayTextures).toEqual({ count: 1, bytes: side * side * 4 });
  expect(got.at(-1)!.overlayUploads).toBe(1);
  const [atMax, staticMax] = await frames(page, [stack(FMT, [[animated]], []), stack(FMT, [[big]], [])], [1, 1]);
  expect(samePixels(atMax, staticMax)).toBe(true);
});

/** A static project touching every render feature: transform, effects, blend, adjustment, overlay. */
async function staticStack(page: Parameters<typeof solid>[0]) {
  const a = await solid(page, 320, 180, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] });
  const b = await solid(page, 120, 80, [20, 220, 90]);
  const base = imageClip(a, { id: 'base', effects: [fx('colour', { brightness: 0.1, contrast: 0.2 }), fx('vignette', {})] });
  const top = imageClip(b, { id: 'top', blend: 'multiply', transform: { x: 40, y: -20, scale: 1.3, rotation: 25, opacity: 0.8 } });
  const adj = adjustmentClip({ id: 'adj', effects: [fx('invert', { amount: 1 })], transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.4 } });
  const ov = overlayClip('lowerThird', 0, 2, { id: 'ov' });
  return { media: [a, b], layers: [[base], [top], [adj], [ov]] as Clip[][] };
}

/** The same clip with every transform property and effect param keyed to a single key at its static value. */
function constantKeys(c: Clip): Clip {
  const tr = c.transform;
  const kind = c.kind;
  const keys = kind === 'adjustment' ? { opacity: [key(0, tr.opacity)] }
    : { position: [pos(0, tr.x, tr.y)], scale: [key(0, tr.scale)], rotation: [key(0, tr.rotation)], opacity: [key(0, tr.opacity)] };
  const effects = c.effects.map((e) => ({ ...e, keys: Object.fromEntries(Object.entries(e.params).map(([k, v]) => [k, [key(0, v)]])) }));
  return { ...c, keys, effects };
}

// Recorded with the Plan 4 compositor (before Task 5) on this machine's SwiftShader: a static project must not change.
// Rasteriser output is machine-dependent, so the literals are only asserted when the GL renderer/version matches the
// one they were recorded on; elsewhere that assertion is skipped (the constant-keys byte equality below and the Plan 4
// pixel specs stay the machine-independent oracle).
const STATIC_HASHES = ['4f10cb1ca94d7347', 'f9c4a2b2dc2466c4'];

test('a static project renders byte-identically to before (hash), and constant single keys change nothing', async ({ page }) => {
  await openHarness(page);
  const { media, layers } = await staticStack(page);
  const still = stack(FMT, layers, media);
  const keyed = stack(FMT, layers.map((l) => l.map(constantKeys)), media);
  const got = await frames(page, [still, still, keyed, keyed], [0.2, 1.2, 0.2, 1.2]);
  console.log(`static hashes ${JSON.stringify(got.slice(0, 2).map(hash))}`);
  for (const f of got) expect(f.glError).toBe(0);
  const gl = await glIdentity(page);
  console.log(`static hashes GL: ${gl}`);
  if (gl === STATIC_HASHES_GL) expect(got.slice(0, 2).map(hash)).toEqual(STATIC_HASHES);
  else console.warn(`static hash literal check skipped: recorded on "${STATIC_HASHES_GL}", running on "${gl}"`);
  expect(samePixels(got[0], got[2])).toBe(true);
  expect(samePixels(got[1], got[3])).toBe(true);
});

test('a playhead between frames shows the frame start (animated transform, effect and adjustment)', async ({ page }) => {
  await openHarness(page);
  const m = await solid(page, 100, 100, [0, 255, 0]);
  const moving = imageClip(m, {
    keys: { position: [pos(0, -100, 0), pos(1, 100, 30)], rotation: [key(0, 0), key(1, 180)] },
    effects: [fx('colour', {}, { brightness: [key(0, -0.4), key(1, 0.4)] })],
  });
  const adj = adjustmentClip({ effects: [fx('invert', {}, { amount: [key(0, 0), key(1, 1)] })], keys: { opacity: [key(0, 0.2), key(1, 1)] } });
  const p = stack(FMT, [[moving], [adj]], [m]);
  const pairs = [[7 / 30, 7.4 / 30], [12 / 30, 12.9 / 30], [20 / 30, 20.5 / 30]];
  const got = await frames(page, [p], pairs.flat());
  for (let i = 0; i < pairs.length; i++) expect(samePixels(got[2 * i], got[2 * i + 1]), `frame at ${pairs[i][0]}`).toBe(true);
  expect(samePixels(got[0], got[2])).toBe(false);
});
