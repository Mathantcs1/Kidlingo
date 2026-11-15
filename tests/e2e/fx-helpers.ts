// Helpers for the visual-effect specs: flat-colour clips with effect stacks rendered through the harness compositor.
import type { Page } from '@playwright/test';
import { clipOf, project, render } from './harness-helpers';
import type { Frame, Rgb } from './harness-helpers';
import { defaultFxParams } from '../../src/fx/params';
import type { FxType, MediaRef, Project, Transform, VisualEffect } from '../../src/core/model';

export const SIZE = 32;
export const FORMAT = { width: SIZE, height: SIZE, fps: 10 };
let seq = 0;

export const fx = (type: FxType, params: Record<string, number> = {}, over: Partial<VisualEffect> = {}): VisualEffect => ({
  id: `fx-${++seq}`, type, enabled: true, params: { ...defaultFxParams(type), ...params }, ...over,
});

/** A solid SIZE x SIZE PNG (optionally translucent) registered as image media. */
export function flat(page: Page, rgb: Rgb, alpha = 1): Promise<MediaRef> {
  return page.evaluate(({ rgb, alpha, n }) => window.cf.putImageMedia(n, n, rgb, { alpha }), { rgb, alpha, n: SIZE });
}

export function image(page: Page, w: number, h: number, rgb: Rgb, opts: { right?: Rgb; alpha?: number; stripes?: number; dot?: number } = {}): Promise<MediaRef> {
  return page.evaluate(({ w, h, rgb, opts }) => window.cf.putImageMedia(w, h, rgb, opts), { w, h, rgb, opts });
}

/** One clip filling the canvas (scale 1) with `stack`; `over` can change transform and fit. */
export function oneClip(m: MediaRef, stack: VisualEffect[], over: { transform?: Partial<Transform>; fit?: 'fit' | 'fill' | 'blur' } = {}): Project {
  const clip = clipOf(m, { out: 2, fx: stack, ...over });
  return project(FORMAT, [m], [clip]);
}

export async function renderStack(page: Page, m: MediaRef, stack: VisualEffect[], over = {}, opts: { bypassFx?: boolean } = {}): Promise<Frame> {
  const [f] = await render(page, oneClip(m, stack, over), [0.5], opts);
  return f;
}

/** The centre pixel, 0..255. */
export const centre = (f: Frame): Rgb => pixelAt(f, f.width >> 1, f.height >> 1);

export function pixelAt(f: Frame, x: number, y: number): Rgb {
  const i = (y * f.width + x) * 4;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
}

export const toUnit = (c: Rgb): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];
export const toBytes = (c: Rgb): Rgb => [c[0] * 255, c[1] * 255, c[2] * 255];
