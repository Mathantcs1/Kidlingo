// Adjustment layers over partly transparent pixels (Plan 4 Task 13a fix round 1, Ruling P10): the processed composite
// REPLACES the composite below (mixed by the blend mode) and is lerped by opacity (adjustPixel), so the unprocessed
// picture never shows through and coverage does not grow. Split from adjustment.spec.ts to keep files short.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipOf, openHarness, px } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { edgeImage } from './colour-helpers';
import { defaultClipAudio, defaultTransform, newTrack } from '../../src/core/model';
import type { BlendMode, Clip, MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import { defaultParams } from '../../src/core/videoEffects';
import { adjustPixel } from '../../src/render/blend';
import type { Rgba } from '../../src/render/blend';
import { CURRENT_VERSION } from '../helpers/project';

const FMT = { width: 64, height: 64, fps: 30 };
let n = 0;
const fx = (type: VideoEffectType): VideoEffect => ({ id: `aafx-${++n}`, type, enabled: true, params: defaultParams(type) });

const adjustment = (effects: VideoEffect[], blend: BlendMode = 'normal', opacity = 1): Clip => ({
  id: 'adj', mediaId: '', kind: 'adjustment', start: 0, in: 0, out: 1, transform: { ...defaultTransform(), opacity },
  volume: 1, fit: 'fit', audio: defaultClipAudio(), effects, blend,
});

/** `layer` (with `over`) alone on the bottom track (nothing below it: black canvas), `adj` on the track above. */
function scene(m: MediaRef, over: Partial<Omit<Clip, 'transform'>> & { transform?: { opacity: number } }, adj: Clip | null): Project {
  return {
    version: CURRENT_VERSION, format: FMT,
    tracks: [
      { ...newTrack('video'), id: 'v', clips: [clipOf(m, { id: 'l', out: 1, ...over })] },
      { ...newTrack('video'), id: 'a', clips: adj ? [adj] : [] },
      { ...newTrack('audio'), id: 'audio' },
    ],
    media: { [m.id]: m },
  };
}

const renderBlend = (page: Page, ps: Project[]) =>
  page.evaluate((ps) => window.cf.renderBlend(ps, ps.map(() => 0.5)), ps);

const within = (a: number[], b: number[], tol: number, msg: string): void => {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k]), `${msg}: ${a} vs ${b.map((v) => v.toFixed(1))}`).toBeLessThanOrEqual(tol);
};

test('B&W over a layer at opacity 0.5 with nothing below gives grey at half brightness (no colour shows through)', async ({ page }) => {
  await openHarness(page);
  const red: Rgb = [220, 30, 30];
  const m = await page.evaluate((red) => window.cf.putImageMedia(64, 64, red), red);
  const half = { transform: { opacity: 0.5 } };
  const r = await renderBlend(page, [
    scene(m, half, adjustment([fx('bw')])),
    scene(m, {}, adjustment([fx('bw')])),
    scene(m, { ...half, effects: [fx('bw')] }, null),
  ]);
  expect(r.error).toBeNull();
  const [adj, full, perLayer] = r.frames.map((f) => px(f, 32, 32));
  expect(Math.max(...adj) - Math.min(...adj), `grey: ${adj}`).toBeLessThanOrEqual(2);
  within(adj, full.map((v) => v / 2), 2, 'half the brightness of the opaque B&W');
  within(adj, perLayer, 2, 'the same as a B&W effect on the half-transparent layer');
  expect(r.frames[0].blendPasses).toBe(1);
});

test('a partly transparent picture under an adjustment matches adjustPixel (normal, multiply, screen; opacity 1, 0.5, 0.7)', async ({ page }) => {
  await openHarness(page);
  const C: Rgb = [200, 120, 60];
  const m = await edgeImage(page, C);
  const cases: [BlendMode, number][] = [['normal', 1], ['multiply', 0.5], ['screen', 0.7], ['normal', 0.5]];
  const r = await renderBlend(page, cases.map(([blend, o]) => scene(m, {}, adjustment([fx('invert')], blend, o))));
  expect(r.error).toBeNull();
  r.frames.forEach((f, i) => {
    const [mode, o] = cases[i];
    // Columns: 0-31 opaque, 32-39 alpha 128/255, 40-43 alpha 38/255, 44+ transparent; over the black canvas.
    for (const [x, a] of [[10, 1], [35, 128 / 255], [42, 38 / 255], [56, 0]] as const) {
      const back: Rgba = [(C[0] / 255) * a, (C[1] / 255) * a, (C[2] / 255) * a, a];
      const inverted: Rgba = [(1 - C[0] / 255) * a, (1 - C[1] / 255) * a, (1 - C[2] / 255) * a, a];
      const want = adjustPixel(mode, back, inverted, o).slice(0, 3).map((v) => v * 255);
      within(px(f, x, 30), want, 2, `${mode} at ${o}, column ${x}`);
    }
  });
});
