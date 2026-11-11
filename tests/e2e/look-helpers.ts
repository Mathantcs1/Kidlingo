// Shared builders and CPU references for the look effect specs (Plan 4 Task 5).
import type { Page } from '@playwright/test';
import { clipOf, expectNear, px, project, render } from './harness-helpers';
import { VIDEO_EFFECTS, defaultParams } from '../../src/core/videoEffects';
import { bwPixel, grainPixel, sepiaPixel, splitTonePixel, vignettePixel } from '../../src/render/effects/looksMath';
import type { Rgb } from '../../src/render/effects/looksMath';
import type { MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';

export type LookType = 'bw' | 'sepia' | 'splitTone' | 'vignette' | 'grain';
export type Size = { width: number; height: number };

let n = 0;
export const look = (type: LookType, params: Record<string, number> = {}): VideoEffect =>
  ({ id: `lfx-${++n}`, type, enabled: true, params: { ...defaultParams(type), ...params } });

export const renderEffects = (page: Page, p: Project, times: number[]) =>
  page.evaluate(({ p, times }) => window.cf.renderEffects(p, times), { p, times });

/** The CPU reference of `type` on one straight 0..255 pixel at pixel index (x, y) of `size` in clip frame `frame`. */
export function refLook(type: LookType, c: number[], params: Record<string, number>, x: number, y: number, size: Size, frame = 0): number[] {
  const p = { ...defaultParams(type), ...params };
  const rgb: Rgb = [c[0] / 255, c[1] / 255, c[2] / 255];
  const out =
    type === 'bw' ? bwPixel(rgb, p.amount)
    : type === 'sepia' ? sepiaPixel(rgb, p.amount)
    : type === 'splitTone' ? splitTonePixel(rgb, p)
    : type === 'vignette' ? vignettePixel(rgb, x + 0.5, y + 0.5, size, p)
    : grainPixel(rgb, x, y, frame, p);
  return out.map((v) => v * 255);
}

/** Each param of `type` alone at its min and max. */
export const extremes = (type: VideoEffectType): Record<string, number>[] =>
  VIDEO_EFFECTS[type].params.flatMap((d) => [{ [d.key]: d.min }, { [d.key]: d.max }]);

export const GRADIENT_FORMAT = { width: 256, height: 48, fps: 30 };

/**
 * Renders the gradient fixture once per param set (one clip each, frame 0.5 s into it) and compares every second row
 * of every pixel with refLook within `tol`. Also checks the grey-ramp identity of `identity` params (all 256 levels).
 * Returns the worst |GL − reference| seen.
 */
export async function driftGuard(
  page: Page, m: MediaRef, type: LookType, sets: Record<string, number>[], identity: Record<string, number>, tol = 3,
): Promise<number> {
  const all = [...sets, identity];
  const clips = all.map((params, i) => clipOf(m, { start: i, out: 1, effects: [look(type, params)] }));
  const r = await renderEffects(page, project(GRADIENT_FORMAT, [m], clips), all.map((_, i) => i + 0.5));
  if (r.error) throw new Error(r.error);
  const [plain] = await render(page, project(GRADIENT_FORMAT, [m], [clipOf(m, { out: 1 })]), [0]);
  const ident = r.frames[all.length - 1];
  for (let x = 0; x < 256; x++) expectNear(px(ident, x, 8), px(plain, x, 8), 1, `${type} identity at ramp level ${x}`);
  let worst = 0;
  for (const [i, params] of all.entries()) {
    let setWorst = 0;
    for (let y = 0; y < 48; y += 2) {
      for (let x = 0; x < 256; x++) {
        const want = refLook(type, px(plain, x, y), params, x, y, GRADIENT_FORMAT, 15);
        const got = px(r.frames[i], x, y);
        for (let k = 0; k < 3; k++) setWorst = Math.max(setWorst, Math.abs(got[k] - want[k]));
      }
    }
    if (setWorst > tol) throw new Error(`${type} ${JSON.stringify(params)}: |GL − reference| = ${setWorst} > ${tol}`);
    worst = Math.max(worst, setWorst);
  }
  console.log(`${type}: max |GL − reference| over ${all.length} param sets = ${worst.toFixed(3)} / 255`);
  return worst;
}

export { gradientImage } from './colour-helpers';
