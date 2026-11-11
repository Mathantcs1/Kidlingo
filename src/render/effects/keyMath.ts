// The chroma key maths (Plan 4 Task 9): the params → coefficients mapping shared by the shader's uniforms
// (shaders/chromaKey.ts) and the pure CPU references (`keyAlpha`, `suppressSpill`, `keyPixel`, `chromaKeyRef`) the
// e2e drift guard compares the GL output against. Colours are UN-PREMULTIPLIED sRGB 0..1.
//
//   chroma    (Cb, Cr) of Rec.709 YCbCr: Cb = (B − Y) / (2 (1 − Kb)), Cr = (R − Y) / (2 (1 − Kr)), Y = LUMA · c
//             (each in −0.5..0.5; pure green is about (−0.385, −0.454), red (−0.115, 0.5)). Luma is ignored, so a
//             shadow on the green screen keys like the lit part as long as it keeps its hue.
//   keyAlpha  d = |chroma(c) − chroma(key)|; alpha = smoothstep(lo, similarity, d) with lo = max(0, similarity −
//             smoothness), widened to at least MIN_FEATHER (no hard step, so CPU and GPU agree). Colours at least
//             `similarity` away are kept whole, colours within `similarity − smoothness` are keyed out (0), and
//             similarity 0 keeps everything (lo < 0 ≤ d).
//   spill     the colour's chroma component along the key's chroma direction (only when positive) is removed by
//             `amount`, keeping luma: c − s·(key − Y(key)) with s = amount · max(0, chroma(c)·chroma(key)) / |chroma(key)|².
//             Every channel moves opposite to the key's own excess over its luma, so the key's strongest channel never
//             increases; with a pure green key and amount 1, green ends between red and blue (no green fringe).
//
// The shader outputs premultiplied (c' · a·alpha, a·alpha): keyed areas are transparent and the layers below show.
import { LUMA } from './colourMath';
import type { Rgb } from './colourMath';
import type { FloatImage } from './blurRef';

export type { Rgb };

/** The smallest keyAlpha ramp width (chroma units): smoothness 0 is a very steep ramp, never a discontinuity. */
export const MIN_FEATHER = 1e-3;
/** Chroma scale factors: Cb = (B − Y) / CB_SCALE, Cr = (R − Y) / CR_SCALE (Rec.709, from LUMA). */
export const CB_SCALE = 2 * (1 - LUMA[2]);
export const CR_SCALE = 2 * (1 - LUMA[0]);

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const luma = (c: Rgb): number => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];

/** (Cb, Cr) of a colour. */
export function chroma(c: Rgb): [number, number] {
  const y = luma(c);
  return [(c[2] - y) / CB_SCALE, (c[0] - y) / CR_SCALE];
}

/** The ramp of keyAlpha: t = clamp((d − lo) · inv), alpha = smoothstep(t). */
export function keyEdges(similarity: number, smoothness: number): { lo: number; inv: number } {
  const hi = num(similarity);
  const lo = Math.min(Math.max(0, hi - num(smoothness)), hi - MIN_FEATHER);
  return { lo, inv: 1 / (hi - lo) };
}

/** The spill direction (key − its luma) and scale (amount / |chroma(key)|², 0 for a grey key). */
export function spillCoeffs(key: Rgb, amount: number): { dir: Rgb; scale: number } {
  const y = luma(key);
  const [cb, cr] = chroma(key);
  const n2 = cb * cb + cr * cr;
  return { dir: [key[0] - y, key[1] - y, key[2] - y], scale: n2 > 1e-12 ? num(amount) / n2 : 0 };
}

const ramp = (d: number, lo: number, inv: number): number => {
  const t = clamp01((d - lo) * inv);
  return t * t * (3 - 2 * t);
};

/** How much of `c` is kept (1) or keyed out (0) for `key`. */
export function keyAlpha(c: Rgb, key: Rgb, similarity: number, smoothness: number): number {
  const [a, b] = chroma(c);
  const [ka, kb] = chroma(key);
  const { lo, inv } = keyEdges(similarity, smoothness);
  return ramp(Math.hypot(a - ka, b - kb), lo, inv);
}

/** `c` with `amount` (0..1) of its chroma along the key's chroma direction removed, luma kept, clamped. */
export function suppressSpill(c: Rgb, key: Rgb, amount: number): Rgb {
  const { dir, scale } = spillCoeffs(key, amount);
  const [a, b] = chroma(c);
  const [ka, kb] = chroma(key);
  const s = scale * Math.max(0, a * ka + b * kb);
  return [clamp01(c[0] - s * dir[0]), clamp01(c[1] - s * dir[1]), clamp01(c[2] - s * dir[2])];
}

/** The key colour and settings of a chromaKey effect's params (missing / non-finite ⇒ 0). */
export function keyParams(p: Record<string, number>): { key: Rgb; similarity: number; smoothness: number; spill: number } {
  return {
    key: [num(p.keyR), num(p.keyG), num(p.keyB)], similarity: num(p.similarity), smoothness: num(p.smoothness), spill: num(p.spill),
  };
}

/** The shader's uniforms: key chroma, the ramp and the spill coefficients. */
export function keyCoeffs(p: Record<string, number>): {
  keyChroma: [number, number]; edge: [number, number]; spillDir: Rgb; spillScale: number;
} {
  const k = keyParams(p);
  const { lo, inv } = keyEdges(k.similarity, k.smoothness);
  const { dir, scale } = spillCoeffs(k.key, k.spill);
  return { keyChroma: chroma(k.key), edge: [lo, inv], spillDir: dir, spillScale: scale };
}

/** The effect on one straight-colour pixel of alpha `a`: premultiplied RGBA out. */
export function keyPixel(c: Rgb, a: number, p: Record<string, number>): [number, number, number, number] {
  const k = keyParams(p);
  const out = a * keyAlpha(c, k.key, k.similarity, k.smoothness);
  const s = suppressSpill(c, k.key, k.spill);
  return [s[0] * out, s[1] * out, s[2] * out, out];
}

/** The CPU reference of the shader over a premultiplied image. */
export function chromaKeyRef(img: FloatImage, p: Record<string, number>): FloatImage {
  const data = new Float32Array(img.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = img.data[i + 3];
    if (a <= 0) continue;
    const c: Rgb = [clamp01(img.data[i] / a), clamp01(img.data[i + 1] / a), clamp01(img.data[i + 2] / a)];
    data.set(keyPixel(c, a, p), i);
  }
  return { width: img.width, height: img.height, data };
}
