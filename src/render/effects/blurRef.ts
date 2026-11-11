// Pure CPU references of the blur family (Plan 4 Task 7), pass for pass what shaders/blurFamily.ts draws: the same
// kernels (blurMath.ts) fetched with GL LINEAR / CLAMP_TO_EDGE emulation (texel = position − 0.5 → two texels mixed),
// the same composite formulas, and optionally the RGBA8 rounding of every stored intermediate (`quantise`), so the
// e2e drift guards can compare GL and CPU per pixel. Images are PREMULTIPLIED RGBA 0..1 at the working size.
import { LUMA } from './colourMath';
import { BLOCK_EPS, GLOW_KNEE, blurRadius, blurStages, pixelBlock } from './blurMath';
import type { Kernel } from './blurMath';
import { smoothstep } from './looksMath';

export interface FloatImage {
  width: number;
  height: number;
  /** Premultiplied RGBA, 0..1, top row first. */
  data: Float32Array;
}

export interface RefOptions {
  /** Round every stored pass result to 8 bits like the GPU's RGBA8 targets. */
  quantise?: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const store = (img: FloatImage, q: boolean | undefined): FloatImage =>
  (q ? { ...img, data: img.data.map((v) => Math.round(clamp01(v) * 255) / 255) } : img);

/** One direction of one kernel, as a blur pass samples it. */
function convolve(src: FloatImage, k: Kernel, horizontal: boolean): FloatImage {
  const { width, height, data } = src;
  const out = new Float32Array(data.length);
  const n = horizontal ? width : height;
  const at = (x: number, y: number, i: number, c: number): number => {
    const j = Math.min(n - 1, Math.max(0, i));
    return horizontal ? data[(y * width + j) * 4 + c] : data[(j * width + x) * 4 + c];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = horizontal ? x : y;
      for (let t = 0; t < k.offsets.length; t++) {
        const pos = p + k.offsets[t];
        const i0 = Math.floor(pos);
        const f = pos - i0;
        for (let c = 0; c < 4; c++) {
          out[(y * width + x) * 4 + c] += k.weights[t] * ((1 - f) * at(x, y, i0, c) + (f > 0 ? f * at(x, y, i0 + 1, c) : 0));
        }
      }
    }
  }
  return { width, height, data: out };
}

/** The blur passes of `radius` (1080-row pixels); the very last pass is left unstored when `composite` follows. */
function blurred(img: FloatImage, radius: number, opts: RefOptions, composite: boolean): FloatImage {
  const stages = blurStages(blurRadius(radius, img.height));
  let out = img;
  stages.forEach((k, i) => {
    out = store(convolve(out, k, true), opts.quantise);
    const v = convolve(out, k, false);
    out = composite && i === stages.length - 1 ? v : store(v, opts.quantise);
  });
  return out;
}

/** Per pixel: f(input premultiplied RGBA, blurred premultiplied RGBA) → output, then stored. */
function combine(src: FloatImage, b: FloatImage, opts: RefOptions, f: (s: number[], b: number[]) => number[]): FloatImage {
  const out = new Float32Array(src.data.length);
  const px = (img: FloatImage, i: number): number[] => Array.from(img.data.subarray(i, i + 4));
  for (let i = 0; i < out.length; i += 4) out.set(f(px(src, i), px(b, i)), i);
  return store({ ...src, data: out }, opts.quantise);
}

const straight = (p: number[]): number[] => (p[3] > 0 ? [0, 1, 2].map((c) => clamp01(p[c] / p[3])) : [0, 0, 0]);

export function blurRef(img: FloatImage, p: Record<string, number>, opts: RefOptions = {}): FloatImage {
  return blurred(img, num(p.radius), opts, false);
}

export function sharpenRef(img: FloatImage, p: Record<string, number>, opts: RefOptions = {}): FloatImage {
  const amount = num(p.amount);
  if (amount <= 0 || blurStages(blurRadius(num(p.radius), img.height)).length === 0) return img;
  return combine(img, blurred(img, num(p.radius), opts, true), opts, (s, b) => {
    const c = straight(s);
    const bc = b[3] > 0 ? straight(b) : c;
    return [...c.map((v, k) => clamp01(v + amount * (v - bc[k])) * s[3]), s[3]];
  });
}

export function glowRef(img: FloatImage, p: Record<string, number>, opts: RefOptions = {}): FloatImage {
  const intensity = num(p.intensity);
  if (intensity <= 0 || blurStages(blurRadius(num(p.radius), img.height)).length === 0) return img;
  const bright = combine(img, img, opts, (s) => {
    const c = straight(s);
    const m = smoothstep(num(p.threshold), num(p.threshold) + GLOW_KNEE, LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2]);
    return [c[0] * s[3] * m, c[1] * s[3] * m, c[2] * s[3] * m, s[3] * m];
  });
  return combine(img, blurred(bright, num(p.radius), opts, true), opts, (s, b) => {
    const a = clamp01(s[3] + intensity * b[3] * (1 - s[3]));
    return [0, 1, 2].map((c) => Math.min(s[c] + intensity * b[c], a)).concat(a);
  });
}

export function pixelateRef(img: FloatImage, p: Record<string, number>): FloatImage {
  const block = pixelBlock(num(p.size), img.height);
  if (block <= 1) return img;
  const b = Math.fround(block);
  const inv = Math.fround(1 / block);
  const centre = (i: number, n: number): number =>
    Math.min(n - 1, Math.floor(Math.fround((Math.floor(Math.fround(Math.fround((i + 0.5) * inv) + BLOCK_EPS)) + 0.5) * b)));
  const { width, height, data } = img;
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = (centre(y, height) * width + centre(x, width)) * 4;
      out.set(data.subarray(j, j + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data: out };
}
