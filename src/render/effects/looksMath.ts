// The look effects' maths (Plan 4 Task 5): the params → coefficients mapping shared by the shaders' uniforms
// (shaders/look.ts) and the pure CPU references (`bwPixel`, `sepiaPixel`, `splitTonePixel`, `vignettePixel`,
// `grainPixel`) that the e2e specs compare the GL output against. Every effect works on UN-PREMULTIPLIED sRGB 0..1
// (the shader un-premultiplies first and re-premultiplies with the untouched alpha), is clamped to 0..1, and is the
// exact identity at amount 0 (the schema DEFAULTS are looks, not identities: a freshly added effect shows its look).
//
//   bw        mix(c, L, amount), L = Rec.709 luma.
//   sepia     mix(c, clamp(SEPIA_MATRIX · c), amount); the classic (W3C Filter Effects) sepia matrix.
//   splitTone t = hueToRgb(hue) − luma(hueToRgb(hue)) is a zero-luma tint offset per side. With the pivot
//             p = 0.5 − 0.4·balance (balance + treats more of the picture as highlights) and the smooth mask
//             s = smoothstep(p − 0.5, p + 0.5, L(c)):  c + shadowAmount·(1 − s)·tShadow + highlightAmount·s·tHighlight.
//   vignette  d = distance from the image centre in PIXELS / half-diagonal (a circle, so aspect-correct; 1 at the
//             corners). falloff = smoothstep(size, size + softness, d); c · (1 − amount·falloff).
//   grain     c + amount · (hash(frame, ⌊x/size⌋, ⌊y/size⌋) − 0.5) on every channel (luminance noise, zero mean).
import { LUMA } from './colourMath';
import type { Rgb } from './colourMath';

export type { Rgb };

/** The classic sepia matrix (rows → output R, G, B), the W3C Filter Effects `sepia()` coefficients. */
export const SEPIA_MATRIX: [Rgb, Rgb, Rgb] = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
/** splitTone pivot travel: the luma pivot is 0.5 − PIVOT_RANGE·balance. */
export const PIVOT_RANGE = 0.4;
/** The vignette falloff width never drops below this (smoothstep needs edge0 < edge1). */
export const MIN_SOFTNESS = 1e-3;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const luma = (c: Rgb): number => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
const dot = (r: Rgb, c: Rgb): number => r[0] * c[0] + r[1] * c[1] + r[2] * c[2];
const lift = (c: Rgb, f: (v: number, i: number) => number): Rgb => [clamp01(f(c[0], 0)), clamp01(f(c[1], 1)), clamp01(f(c[2], 2))];
/** GLSL smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export const bwPixel = (c: Rgb, amount: number): Rgb => {
  const y = luma(c);
  return lift(c, (v) => v + (y - v) * amount);
};

export const sepiaPixel = (c: Rgb, amount: number): Rgb => {
  const s = SEPIA_MATRIX.map((row) => clamp01(dot(row, c)));
  return lift(c, (v, i) => v + (s[i] - v) * amount);
};

/** HSV → RGB at saturation 1, value 1, hue in degrees 0..360 (360 = 0 = red). */
export function hueToRgb(degrees: number): Rgb {
  const h = degrees / 60;
  return [clamp01(Math.abs(h - 3) - 1), clamp01(2 - Math.abs(h - 2)), clamp01(2 - Math.abs(h - 4))];
}

export interface SplitToneCoeffs {
  /** Shadow / highlight RGB offsets at full mask (amount · zero-luma hue tint). */
  shadow: Rgb;
  highlight: Rgb;
  pivot: number;
}

const tint = (hue: number, amount: number): Rgb => {
  const t = hueToRgb(hue);
  const y = luma(t);
  return [amount * (t[0] - y), amount * (t[1] - y), amount * (t[2] - y)];
};

export function splitToneCoeffs(p: Record<string, number>): SplitToneCoeffs {
  return {
    shadow: tint(num(p.shadowHue), num(p.shadowAmount)),
    highlight: tint(num(p.highlightHue), num(p.highlightAmount)),
    pivot: 0.5 - PIVOT_RANGE * num(p.balance),
  };
}

export function splitTonePixel(c: Rgb, p: Record<string, number>): Rgb {
  const k = splitToneCoeffs(p);
  const s = smoothstep(k.pivot - 0.5, k.pivot + 0.5, luma(c));
  return lift(c, (v, i) => v + (1 - s) * k.shadow[i] + s * k.highlight[i]);
}

/** [amount, start radius, falloff width] (the last two as fractions of the half-diagonal). */
export function vignetteCoeffs(p: Record<string, number>): [number, number, number] {
  return [num(p.amount), num(p.size), Math.max(MIN_SOFTNESS, num(p.softness))];
}

/** The vignette at the CENTRE of pixel (x, y) of a `size`-pixel image (x, y are pixel indices + 0.5 when centred). */
export function vignettePixel(c: Rgb, x: number, y: number, size: { width: number; height: number }, p: Record<string, number>): Rgb {
  const [amount, start, width] = vignetteCoeffs(p);
  const half = 0.5 * Math.hypot(size.width, size.height);
  const d = Math.hypot(x - size.width / 2, y - size.height / 2) / half;
  const k = 1 - amount * smoothstep(start, start + width, d);
  return lift(c, (v) => v * k);
}

/** Noise cell edge in pixels (the schema's `size`), as a float32 like the uniform. */
export const grainCell = (size: number): number => Math.fround(Math.min(4, Math.max(1, num(size) || 1)));

/**
 * Deterministic noise in [0, 1) from (frame, x, y): 32-bit integer mixing (lowbias32 finaliser over a linear
 * combination of the three), top 24 bits → exact float. The GLSL uses the same uint arithmetic. Shared by Task 8.
 */
export function grainHash(frame: number, x: number, y: number): number {
  let h = (Math.imul(frame | 0, 0x9e3779b1) + Math.imul(x | 0, 0x85ebca6b) + Math.imul(y | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

/** Grain at pixel index (px, py) of frame `frame` (the shader sees the pixel centre, px + 0.5). */
export function grainPixel(c: Rgb, px: number, py: number, frame: number, p: Record<string, number>): Rgb {
  const cell = grainCell(p.size);
  const cx = Math.floor(Math.fround((px + 0.5) / cell));
  const cy = Math.floor(Math.fround((py + 0.5) / cell));
  const n = num(p.amount) * (grainHash(frame, cx, cy) - 0.5);
  return lift(c, (v) => v + n);
}
