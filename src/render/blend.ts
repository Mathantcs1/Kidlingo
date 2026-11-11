// Per-clip blend modes, pure (no GL): the W3C Compositing and Blending Level 1 formulas. The GLSL in
// ./effects/shaders/blend.ts mirrors them, with its mode numbers and constants taken from this module.
import type { BlendMode } from '../core/model';
import { BLEND_MODES } from '../core/videoEffects';
import type { Size } from './geometry';

/** Premultiplied RGBA, 0..1. */
export type Rgba = [number, number, number, number];

/** A mode's number in the shader: its index in BLEND_MODES. */
export const BLEND_MODE_INDEX = Object.fromEntries(BLEND_MODES.map((m, i) => [m, i])) as Record<BlendMode, number>;

/** Soft light's D(b) switches from the cubic to sqrt(b) above this backdrop value. */
export const SOFT_LIGHT_KNEE = 0.25;

const screen = (b: number, s: number): number => b + s - b * s;
const hardLight = (b: number, s: number): number => (s <= 0.5 ? b * 2 * s : screen(b, 2 * s - 1));

function softLight(b: number, s: number): number {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= SOFT_LIGHT_KNEE ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
}

/**
 * B(backdrop, source) for one channel of un-premultiplied colour (0..1), per the W3C formulas ('colourDodge' and
 * 'colourBurn' use the Level 1 edge cases: dodge of a black backdrop is 0, burn of a white backdrop is 1).
 */
export function blendChannel(mode: BlendMode, b: number, s: number): number {
  switch (mode) {
    case 'normal': return s;
    case 'multiply': return b * s;
    case 'screen': return screen(b, s);
    case 'overlay': return hardLight(s, b);
    case 'darken': return Math.min(b, s);
    case 'lighten': return Math.max(b, s);
    case 'colourDodge': return b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'colourBurn': return b >= 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'hardLight': return hardLight(b, s);
    case 'softLight': return softLight(b, s);
    case 'difference': return Math.abs(b - s);
    case 'exclusion': return b + s - 2 * b * s;
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * The source pixel blended onto the backdrop pixel, both premultiplied: the colours are un-premultiplied, mixed with
 * blendChannel where both are present, and composited source-over (W3C: co = cs·(1−αb) + cb·(1−αs) + αs·αb·B(Cb, Cs),
 * αo = αs + αb·(1−αs)). 'normal' is exactly premultiplied source-over.
 */
export function blendPixel(mode: BlendMode, backdrop: Rgba, source: Rgba): Rgba {
  const ab = backdrop[3];
  const as = source[3];
  const out: Rgba = [0, 0, 0, as + ab * (1 - as)];
  for (let k = 0; k < 3; k++) {
    const cb = ab > 0 ? clamp01(backdrop[k] / ab) : 0;
    const cs = as > 0 ? clamp01(source[k] / as) : 0;
    out[k] = source[k] * (1 - ab) + backdrop[k] * (1 - as) + as * ab * blendChannel(mode, cb, cs);
  }
  return out;
}

/**
 * The intermediate composite's size for a `viewport`: the viewport itself, scaled down (same shape) to fit
 * `maxSide` (MAX_TEXTURE_SIZE) and so that `targets` RGBA8 targets fit in `budget` bytes. At least 1×1.
 */
export function compositeSize(viewport: Size, maxSide: number, targets: number, budget: number): Size {
  const w = Math.max(1, viewport.width);
  const h = Math.max(1, viewport.height);
  const bySide = Math.min(1, maxSide / Math.max(w, h));
  const byBytes = Math.min(1, Math.sqrt(budget / (w * h * 4 * targets)));
  const k = Math.min(bySide, byBytes);
  if (k >= 1) return { width: w, height: h };
  return { width: Math.max(1, Math.floor(w * k)), height: Math.max(1, Math.floor(h * k)) };
}
