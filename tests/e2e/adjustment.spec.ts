// Adjustment layers through the real compositor (Plan 4 Task 13a): a B&W adjustment greys every layer below it (as
// if each had the effect) while a layer above stays coloured; outside its time range, hidden or without an enabled
// effect it changes nothing (direct path); opacity 0.5 gives the midpoint; its blend mode blends the processed
// composite over the unprocessed one; the composite is read upright.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipOf, openHarness, px } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { defaultClipAudio, defaultTransform, newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import { defaultParams } from '../../src/core/videoEffects';
import { blendPixel } from '../../src/render/blend';

const FMT = { width: 64, height: 64, fps: 30 };
let n = 0;
const fx = (type: VideoEffectType, params: Record<string, number> = {}, enabled = true): VideoEffect =>
  ({ id: `afx-${++n}`, type, enabled, params: { ...defaultParams(type), ...params } });

/** An adjustment clip from 0.5 s to 1 s with `effects`. */
const adjustmentClip = (effects: VideoEffect[], over: Partial<Clip> = {}): Clip => ({
  id: 'adj', mediaId: '', kind: 'adjustment', start: 0.5, in: 0, out: 0.5, transform: defaultTransform(), volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects, blend: 'normal', ...over,
});

interface Media { bottom: MediaRef; mid: MediaRef; top: MediaRef }

/**
 * Bottom: red left / green right (full frame); mid: a blue 32 x 32 square in the centre; then the adjustment layer
 * (`adj`, or an empty track); top: a yellow 16 x 16 square at (4..20, 4..20). `layerFx` goes on bottom and mid.
 */
function scene(m: Media, adj: Clip | null, opts: { layerFx?: VideoEffect[]; hidden?: boolean } = {}): Project {
  const track = (id: string, clips: Clip[], hidden = false) => ({ ...newTrack('video'), id, hidden, clips });
  const layerFx = opts.layerFx ?? [];
  return {
    version: 5, format: FMT,
    tracks: [
      track('bottom', [clipOf(m.bottom, { id: 'b', out: 1, effects: layerFx })]),
      track('mid', [clipOf(m.mid, { id: 'm', out: 1, effects: layerFx })]),
      track('adj', adj ? [adj] : [], opts.hidden),
      track('top', [clipOf(m.top, { id: 't', out: 1, transform: { x: -20, y: -20 } })]),
      { ...newTrack('audio'), id: 'audio' },
    ],
    media: { [m.bottom.id]: m.bottom, [m.mid.id]: m.mid, [m.top.id]: m.top },
  };
}

const RED: Rgb = [200, 40, 40];
const GREEN: Rgb = [40, 180, 60];
const BLUE: Rgb = [40, 60, 220];
const YELLOW: Rgb = [230, 200, 30];
/** Sample points: red, green and blue (below the adjustment), yellow (above it). */
const BELOW: [number, number][] = [[8, 40], [56, 40], [32, 32]];
const ABOVE: [number, number] = [12, 12];

async function media(page: Page): Promise<Media> {
  const [bottom, mid, top] = await page.evaluate(({ RED, GREEN, BLUE, YELLOW }) => Promise.all([
    window.cf.putImageMedia(64, 64, RED, { right: GREEN }),
    window.cf.putImageMedia(32, 32, BLUE),
    window.cf.putImageMedia(16, 16, YELLOW),
  ]), { RED, GREEN, BLUE, YELLOW });
  return { bottom, mid, top };
}

const renderBlend = (page: Page, ps: Project[], times: number[]) =>
  page.evaluate(({ ps, times }) => window.cf.renderBlend(ps, times), { ps, times });

type Frame = Awaited<ReturnType<typeof renderBlend>>['frames'][number];
const same = (a: Frame, b: Frame): boolean => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const within = (a: number[], b: number[], tol: number, msg: string): void => {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k]), `${msg}: ${a} vs ${b.map((v) => v.toFixed(1))}`).toBeLessThanOrEqual(tol);
};

test('a B&W adjustment greys every layer below it like a B&W effect on each, and the layer above stays coloured', async ({ page }) => {
  await openHarness(page);
  const m = await media(page);
  const plain = scene(m, null);
  const bw = scene(m, adjustmentClip([fx('bw')]));
  const reference = scene(m, null, { layerFx: [fx('bw')] });
  const r = await renderBlend(page, [plain, bw, reference], [0.75, 0.75, 0.75]);
  expect(r.error).toBeNull();
  const [p, a, ref] = r.frames;
  for (const f of r.frames) expect(f.glError).toBe(0);
  for (const [x, y] of BELOW) {
    const got = px(a, x, y);
    expect(Math.max(...got) - Math.min(...got), `grey at ${x},${y}: ${got}`).toBeLessThanOrEqual(2);
    within(got, px(ref, x, y), 2, `adjustment vs per-layer B&W at ${x},${y}`);
    expect(Math.max(...px(p, x, y)) - Math.min(...px(p, x, y))).toBeGreaterThan(100);
  }
  within(px(a, ...ABOVE), YELLOW, 1, 'the clip above the adjustment');
  // One blend pass for the adjustment frame only; the plain and per-layer frames take the direct path.
  expect([p.blendPasses, a.blendPasses, ref.blendPasses]).toEqual([0, 1, 1]);
  expect(a.effectPasses).toBeGreaterThan(p.effectPasses);
});

test('outside its time range, on a hidden layer or with no enabled effect nothing changes; opacity 0.5 is the midpoint', async ({ page }) => {
  await openHarness(page);
  const m = await media(page);
  const plain = scene(m, null);
  const bw = scene(m, adjustmentClip([fx('bw')]));
  const half = scene(m, adjustmentClip([fx('bw')], { transform: { ...defaultTransform(), opacity: 0.5 } }));
  const hidden = scene(m, adjustmentClip([fx('bw')]), { hidden: true });
  const disabled = scene(m, adjustmentClip([fx('bw', {}, false)], { blend: 'multiply' }));
  const r = await renderBlend(page, [plain, bw, bw, hidden, disabled, half], [0.75, 0.25, 0.75, 0.75, 0.75, 0.75]);
  expect(r.error).toBeNull();
  const [p, before, full, hid, off, mid] = r.frames;
  expect(same(before, p), 'before the adjustment starts').toBe(true);
  expect(same(hid, p), 'hidden adjustment layer').toBe(true);
  expect(same(off, p), 'adjustment with only a disabled effect').toBe(true);
  expect(r.frames.map((f) => f.blendPasses)).toEqual([0, 0, 1, 1, 1, 2]);
  for (const [x, y] of BELOW) {
    const want = px(p, x, y).map((v, k) => (v + px(full, x, y)[k]) / 2);
    within(px(mid, x, y), want, 2, `opacity 0.5 at ${x},${y}`);
  }
  within(px(mid, ...ABOVE), YELLOW, 1, 'the clip above, opacity 0.5');
});

test('the adjustment blend mode blends its result over the layers below: invert in Multiply gives c(1 - c)', async ({ page }) => {
  await openHarness(page);
  const m = await media(page);
  const multiply = scene(m, adjustmentClip([fx('invert')], { blend: 'multiply' }));
  const r = await renderBlend(page, [multiply], [0.75]);
  expect(r.error).toBeNull();
  for (const [[x, y], c] of [[BELOW[0], RED], [BELOW[1], GREEN], [BELOW[2], BLUE]] as [[number, number], Rgb][]) {
    const back = [c[0] / 255, c[1] / 255, c[2] / 255, 1] as [number, number, number, number];
    const inv = [1 - back[0], 1 - back[1], 1 - back[2], 1] as [number, number, number, number];
    const want = blendPixel('multiply', back, inv).slice(0, 3).map((v) => v * 255);
    within(px(r.frames[0], x, y), want, 2, `multiply at ${x},${y}`);
  }
  within(px(r.frames[0], ...ABOVE), YELLOW, 1, 'the clip above');
});

test('the composite is read upright: a top-to-bottom mirror adjustment copies the top half down', async ({ page }) => {
  await openHarness(page);
  const top: Rgb = [220, 120, 30];
  const bottom: Rgb = [30, 90, 200];
  const back = await page.evaluate(({ top, bottom }) => window.cf.putImageMedia(64, 64, top, { bottom }), { top, bottom });
  const p: Project = {
    version: 5, format: FMT,
    tracks: [
      { ...newTrack('video'), id: 'v', clips: [clipOf(back, { id: 'b', out: 1 })] },
      { ...newTrack('video'), id: 'a', clips: [adjustmentClip([fx('mirror', { mode: 2 })])] },
      { ...newTrack('audio'), id: 'audio' },
    ],
    media: { [back.id]: back },
  };
  const r = await renderBlend(page, [p, p], [0.25, 0.75]);
  expect(r.error).toBeNull();
  const [plain, mirrored] = r.frames;
  within(px(plain, 32, 8), top, 1, 'plain top');
  within(px(plain, 32, 56), bottom, 1, 'plain bottom');
  within(px(mirrored, 32, 8), top, 1, 'mirrored top');
  within(px(mirrored, 32, 56), top, 1, 'mirrored bottom shows the top');
});

test('an adjustment whose only effect cannot run changes nothing, whatever its blend mode (no blend of the composite with itself)', async ({ page }) => {
  await openHarness(page);
  const m = await media(page);
  await page.evaluate(() => window.cf.registerTestEffect('glow', 'broken'));
  const plain = scene(m, null);
  const broken = scene(m, adjustmentClip([fx('glow')], { blend: 'multiply' }));
  const r = await renderBlend(page, [plain, broken], [0.75, 0.75]);
  expect(r.error).toBeNull();
  for (const [x, y] of [...BELOW, ABOVE]) within(px(r.frames[1], x, y), px(r.frames[0], x, y), 1, `broken glow at ${x},${y}`);
  expect(r.frames.map((f) => f.blendPasses)).toEqual([0, 0]);
});
