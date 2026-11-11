// Builders and CPU-reference glue for the stylise specs (Plan 4 Task 8: rgbSplit, glitch, vhs, mirror, invert).
import type { Page } from '@playwright/test';
import { clipOf, project, render } from './harness-helpers';
import { opaque, renderEffects, worstVsReference } from './blur-helpers';
import { VIDEO_EFFECTS, defaultParams } from '../../src/core/videoEffects';
import { glitchRef, invertRef, mirrorRef, rgbSplitRef, vhsRef } from '../../src/render/effects/styliseRef';
import type { FloatImage } from '../../src/render/effects/blurRef';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';

export type StyliseType = 'rgbSplit' | 'glitch' | 'vhs' | 'mirror' | 'invert';
export const STYLISE: StyliseType[] = ['rgbSplit', 'glitch', 'vhs', 'mirror', 'invert'];
export { renderEffects };

let n = 0;
export const sfx = (type: StyliseType, params: Record<string, number> = {}, enabled = true): VideoEffect =>
  ({ id: `sfx-${++n}`, type, enabled, params: { ...defaultParams(type), ...params } });

/** The CPU reference of `type` with `params` over the defaults, at clip frame `frame`. */
export function styliseRef(type: StyliseType, img: FloatImage, params: Record<string, number>, frame: number): FloatImage {
  const p = { ...defaultParams(type), ...params };
  if (type === 'invert') return invertRef(img, p);
  if (type === 'mirror') return mirrorRef(img, p);
  if (type === 'rgbSplit') return rgbSplitRef(img, p);
  if (type === 'glitch') return glitchRef(img, p, frame);
  return vhsRef(img, p, frame);
}

/** Each param alone at its min and max (mirror: every mode), plus the combined sets. */
export function paramSets(type: StyliseType): Record<string, number>[] {
  if (type === 'mirror') return [0, 1, 2, 3].map((mode) => ({ mode }));
  const ext = VIDEO_EFFECTS[type].params.flatMap((d) => [{ [d.key]: d.min }, { [d.key]: d.max }]);
  const combined: Record<StyliseType, Record<string, number>[]> = {
    rgbSplit: [{ amount: 50, angle: 37 }, { amount: 13, angle: 200 }],
    glitch: [{ intensity: 1, blockSize: 4 }, { intensity: 0.7, blockSize: 13 }],
    vhs: [{ scanlines: 1, bleed: 1, noise: 1, wobble: 1 }, { scanlines: 0.3, bleed: 0.6, noise: 0.1, wobble: 0.5 }],
    mirror: [],
    invert: [{ amount: 0.37 }],
  };
  return [...ext, ...combined[type]];
}

/**
 * Renders `m` (an opaque fixture, format = its size so the working size equals it) once per param set of `type`
 * (one clip each, 0.5 s into it = clip frame 15) and returns the worst |GL − reference| over every pixel and set,
 * throwing when one exceeds `tol`.
 */
export async function driftGuard(page: Page, m: MediaRef, type: StyliseType, tol = 3): Promise<number> {
  const format = { width: m.width!, height: m.height!, fps: 30 };
  const sets = [...paramSets(type), {}];
  const clips = sets.map((params, i) => clipOf(m, { start: i, out: 1, effects: [sfx(type, params)] }));
  const r = await renderEffects(page, project(format, [m], clips), sets.map((_, i) => i + 0.5));
  if (r.error) throw new Error(r.error);
  if (r.unavailable.length) throw new Error(`unavailable: ${r.unavailable}`);
  const [plain] = await render(page, project(format, [m], [clipOf(m, { out: 1 })]), [0]);
  const img = opaque(plain);
  let worst = 0;
  for (const [i, params] of sets.entries()) {
    const err = worstVsReference(r.frames[i], styliseRef(type, img, params, 15));
    if (err > tol) throw new Error(`${type} ${JSON.stringify(params)} on ${m.width}x${m.height}: |GL − reference| = ${err} > ${tol}`);
    worst = Math.max(worst, err);
  }
  return worst;
}

/** One clip of `m` with `effects` filling a format of its own size. */
export const single = (m: MediaRef, effects: VideoEffect[], over: Parameters<typeof clipOf>[1] = {}): Project =>
  project({ width: m.width!, height: m.height!, fps: 30 }, [m], [clipOf(m, { out: 2, effects, ...over })]);

/** How many pixels differ (any RGB channel) between two frames. */
export function changed(a: { data: number[] }, b: { data: number[] }): number {
  let c = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) c++;
  }
  return c;
}
