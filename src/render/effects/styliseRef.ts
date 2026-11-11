// Pure CPU references of the stylise effects (Plan 4 Task 8), pixel for pixel what shaders/stylise.ts draws: the same
// coefficients (styliseMath.ts), GL LINEAR / clamp-to-edge sampling emulated at the same positions, the same
// un-premultiply → maths → premultiply order. Images are PREMULTIPLIED RGBA 0..1 at the working size, top row first.
import type { FloatImage } from './blurRef';
import { LUMA } from './colourMath';
import {
  VHS, glitchCoeffs, glitchShift, mirrorMode, mirrorSource, rgbSplitOffset, vhsCoeffs, vhsDark, vhsNoise, vhsShift,
} from './styliseMath';

type Rgba = [number, number, number, number];
type Rgb = [number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A LINEAR sample at working-pixel position (x, y), clamped to the pixel centres (GL clamp-to-edge). */
export function sampleAt(img: FloatImage, x: number, y: number): Rgba {
  const { width: w, height: h, data } = img;
  const u = Math.min(w - 0.5, Math.max(0.5, x)) - 0.5;
  const v = Math.min(h - 0.5, Math.max(0.5, y)) - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const out: Rgba = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = data[(y0 * w + x0) * 4 + c] * (1 - fx) + (fx > 0 ? data[(y0 * w + x1) * 4 + c] * fx : 0);
    const bottom = data[(y1 * w + x0) * 4 + c] * (1 - fx) + (fx > 0 ? data[(y1 * w + x1) * 4 + c] * fx : 0);
    out[c] = fy > 0 ? top * (1 - fy) + bottom * fy : top;
  }
  return out;
}

/** Straight colour (clamped; black where alpha is 0), as GLSL `unpremultiply`. */
export const unpremultiply = (p: Rgba): Rgb =>
  (p[3] > 0 ? [clamp01(p[0] / p[3]), clamp01(p[1] / p[3]), clamp01(p[2] / p[3])] : [0, 0, 0]);

const luma = (c: Rgb): number => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];

/** Runs `pixel(x + 0.5, y + 0.5, x, y)` for every pixel into a new image. */
function map(img: FloatImage, pixel: (cx: number, cy: number, x: number, y: number) => Rgba): FloatImage {
  const data = new Float32Array(img.data.length);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) data.set(pixel(x + 0.5, y + 0.5, x, y), (y * img.width + x) * 4);
  return { width: img.width, height: img.height, data };
}

const premultiply = (c: Rgb, a: number): Rgba => [clamp01(c[0]) * a, clamp01(c[1]) * a, clamp01(c[2]) * a, a];

export function invertRef(img: FloatImage, p: Record<string, number>): FloatImage {
  const amount = num(p.amount);
  return map(img, (cx, cy) => {
    const s = sampleAt(img, cx, cy);
    const c = unpremultiply(s);
    return premultiply([c[0] + (1 - 2 * c[0]) * amount, c[1] + (1 - 2 * c[1]) * amount, c[2] + (1 - 2 * c[2]) * amount], s[3]);
  });
}

export function mirrorRef(img: FloatImage, p: Record<string, number>): FloatImage {
  const mode = mirrorMode(p);
  return map(img, (cx, cy) => sampleAt(img, ...mirrorSource(cx, cy, img.width, img.height, mode)));
}

export function rgbSplitRef(img: FloatImage, p: Record<string, number>, workingHeight = img.height): FloatImage {
  const [dx, dy] = rgbSplitOffset(p, workingHeight);
  return map(img, (cx, cy) => {
    const g = sampleAt(img, cx, cy);
    const r = unpremultiply(sampleAt(img, cx - dx, cy - dy));
    const b = unpremultiply(sampleAt(img, cx + dx, cy + dy));
    return premultiply([r[0], unpremultiply(g)[1], b[2]], g[3]);
  });
}

export function glitchRef(img: FloatImage, p: Record<string, number>, frame: number): FloatImage {
  const k = glitchCoeffs(p, img);
  return map(img, (cx, cy, x, y) => {
    const hit = glitchShift(frame, x, y, k);
    if (!hit) return sampleAt(img, cx, cy);
    const sx = cx + hit.shift;
    const g = sampleAt(img, sx, cy);
    const r = unpremultiply(sampleAt(img, sx + hit.split, cy));
    const b = unpremultiply(sampleAt(img, sx - hit.split, cy));
    return premultiply([r[0], unpremultiply(g)[1], b[2]], g[3]);
  });
}

export function vhsRef(img: FloatImage, p: Record<string, number>, frame: number): FloatImage {
  const k = vhsCoeffs(p, img);
  return map(img, (cx, cy, x, y) => {
    const sx = cx + vhsShift(frame, y, k);
    const base = sampleAt(img, sx, cy);
    let c = unpremultiply(base);
    if (k.bleed > 0) {
      const y0 = luma(c);
      const avg: Rgb = [0, 0, 0];
      for (let t = 1; t <= VHS.bleedTaps; t++) {
        const s = unpremultiply(sampleAt(img, sx - t * k.step, cy));
        const ys = luma(s);
        for (let i = 0; i < 3; i++) avg[i] += (s[i] - ys) / VHS.bleedTaps;
      }
      c = c.map((v, i) => y0 + (v - y0) + (avg[i] - (v - y0)) * k.bleed) as Rgb;
    }
    const dark = vhsDark(y, k) ? 1 - k.scanDepth : 1;
    const n = vhsNoise(frame, x, y, k);
    return premultiply([c[0] * dark + n, c[1] * dark + n, c[2] * dark + n], base[3]);
  });
}
