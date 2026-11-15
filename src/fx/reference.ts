// CPU reference formulas for the per-pixel effects: the oracle for unit tests and for the GPU pixel tests. The GLSL in
// src/render/fx must compute exactly these (inputs/outputs are unpremultiplied sRGB-encoded 0..1, Plan 4 E5).
import { clamp01, hueRotate, linearToSrgb, luma709, mix, srgbToLinear } from './colorMath';
import type { Rgb } from './colorMath';
import { LOOK_KEYS, lookParams } from './looks';
import type { LookKey } from './looks';

export type { Rgb } from './colorMath';

type Params = Record<string, number>;
const p = (params: Params, key: string, def: number): number => (typeof params[key] === 'number' ? params[key] : def);

/**
 * Colour correction in this order: exposure (linear light), temperature/tint, brightness, contrast,
 * shadows/highlights, saturation, hue; the result is clamped to 0..1.
 */
export function colorPixel(input: Rgb, params: Params): Rgb {
  const gain = Math.pow(2, p(params, 'exposure', 0));
  let c = input.map((v) => linearToSrgb(srgbToLinear(Math.max(v, 0)) * gain)) as Rgb;
  const temp = p(params, 'temperature', 0) * 0.1;
  c = [c[0] + temp, c[1] - p(params, 'tint', 0) * 0.1, c[2] - temp];
  const bright = p(params, 'brightness', 0) * 0.5;
  const contrast = 1 + p(params, 'contrast', 0);
  c = c.map((v) => (v + bright - 0.5) * contrast + 0.5) as Rgb;
  const l = clamp01(luma709(c));
  const lift = p(params, 'shadows', 0) * 0.3 * (1 - l) * (1 - l) + p(params, 'highlights', 0) * 0.3 * l * l;
  c = c.map((v) => v + lift) as Rgb;
  const sat = 1 + p(params, 'saturation', 0);
  const l2 = luma709(c);
  c = c.map((v) => mix(l2, v, sat)) as Rgb;
  c = hueRotate(c, p(params, 'hue', 0));
  return c.map(clamp01) as Rgb;
}

export function bwPixel(c: Rgb, amount: number): Rgb {
  const l = luma709(c);
  return c.map((v) => mix(v, l, amount)) as Rgb;
}

export function sepiaPixel(c: Rgb, amount: number): Rgb {
  const [r, g, b] = c;
  const s: Rgb = [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b];
  return c.map((v, i) => mix(v, clamp01(s[i]), amount)) as Rgb;
}

export function invertPixel(c: Rgb, amount: number): Rgb {
  return c.map((v) => mix(v, 1 - v, amount)) as Rgb;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Brightness multiplier at `uv` (0..1, clip space). d = distance from the centre, 1 at the corners. */
export function vignetteFactor(uv: [number, number], params: Params): number {
  const amount = p(params, 'amount', 0.5);
  const inner = 0.2 + 0.8 * p(params, 'size', 0.5);
  const width = 0.1 + 0.9 * p(params, 'softness', 0.5) * (1 - inner);
  const d = Math.hypot((uv[0] - 0.5) * 2, (uv[1] - 0.5) * 2) / Math.SQRT2;
  return 1 - 0.9 * amount * smoothstep(inner, inner + width, d);
}

/** The colour grade of a look (vignette and grain are applied separately, per pixel position/time). */
export function lookPixel(input: Rgb, key: LookKey, intensity: number): Rgb {
  const g = lookParams(key, intensity);
  let c = input.map((v, i) => v * g.gain[i]) as Rgb;
  c = c.map((v, i) => v + g.lift[i] * (1 - v)) as Rgb;
  c = c.map((v, i) => Math.pow(Math.max(v, 0), 1 / g.gamma[i])) as Rgb;
  c = c.map((v) => (v - 0.5) * g.contrast + 0.5) as Rgb;
  const l = luma709(c);
  c = c.map((v) => mix(l, v, g.saturation)) as Rgb;
  c = c.map((v) => g.fade + v * (1 - g.fade)) as Rgb;
  return c.map(clamp01) as Rgb;
}

export function lookIndex(key: LookKey): number {
  return LOOK_KEYS.indexOf(key);
}

/** A 3D LUT: `size`³ RGB triples, red fastest. */
export interface Cube {
  size: number;
  data: Float32Array;
}

/** Trilinear lookup of `c` (0..1) in the cube. */
export function lutSample(cube: Cube, c: Rgb): Rgb {
  const { size, data } = cube;
  const pos = c.map((v) => clamp01(v) * (size - 1));
  const i0 = pos.map((v) => Math.min(size - 2, Math.floor(v)));
  const f = pos.map((v, k) => v - i0[k]);
  const at = (r: number, g: number, b: number, ch: number): number => data[((b * size + g) * size + r) * 3 + ch];
  const out: Rgb = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const lerpR = (g: number, b: number): number => mix(at(i0[0], g, b, ch), at(i0[0] + 1, g, b, ch), f[0]);
    const lerpG = (b: number): number => mix(lerpR(i0[1], b), lerpR(i0[1] + 1, b), f[1]);
    out[ch] = mix(lerpG(i0[2]), lerpG(i0[2] + 1), f[2]);
  }
  return out;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((v, i) => mix(v, b[i], t)) as Rgb;
}

const chromaOf = (c: Rgb): [number, number] => {
  const y = luma709(c);
  return [(c[2] - y) / 1.8556, (c[0] - y) / 1.5748];
};

/**
 * Chroma key: alpha from the YCbCr chroma distance to the key colour (`key` is packed 0xRRGGBB) with a smooth edge,
 * and spill removal that pulls the key's dominant channel down toward the other two (not applied to white-ish keys).
 * Returns the unpremultiplied colour and the new alpha factor.
 */
export function chromaPixel(c: Rgb, params: Params): { rgb: Rgb; alpha: number } {
  const packed = p(params, 'key', 0x00ff00);
  const key: Rgb = [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255];
  const [kb, kr] = chromaOf(key);
  const [cb, cr] = chromaOf(c);
  const d = Math.hypot(cb - kb, cr - kr);
  const tol = p(params, 'tolerance', 0.35);
  const alpha = smoothstep(tol, tol + Math.max(p(params, 'softness', 0.15), 0.001), d);
  const kmax = Math.max(...key);
  const mask = key.map((v) => (v >= kmax - 1e-4 ? 1 : 0));
  const dominant = mask[0] + mask[1] + mask[2];
  let out: Rgb = [...c];
  if (dominant < 1.5) {
    const own = c.reduce((s, v, i) => s + v * mask[i], 0) / dominant;
    const other = Math.max(...c.map((v, i) => (mask[i] ? 0 : v)));
    const excess = Math.max(own - other, 0) * p(params, 'spill', 0.5);
    out = out.map((v, i) => v - mask[i] * excess) as Rgb;
  }
  return { rgb: out, alpha };
}
