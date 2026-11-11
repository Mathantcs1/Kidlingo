import { describe, expect, it } from 'vitest';
import {
  GLITCH_ASPECT, glitchCoeffs, glitchShift, hash, mirrorMode, mirrorSource, rgbSplitOffset, vhsCoeffs,
} from '../src/render/effects/styliseMath';
import { glitchRef, invertRef, mirrorRef, rgbSplitRef, vhsRef } from '../src/render/effects/styliseRef';
import type { FloatImage } from '../src/render/effects/blurRef';
import { grainHash } from '../src/render/effects/looksMath';

/** A deterministic opaque test picture with distinct channels per pixel (premultiplied = straight at alpha 1). */
function picture(width: number, height: number, alpha: (x: number, y: number) => number = () => 1): FloatImage {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alpha(x, y);
      const rgb = [((x * 37 + y * 11) % 256) / 255, ((x * 5 + y * 53) % 256) / 255, ((x * 91 + y * 7 + 13) % 256) / 255];
      data.set([rgb[0] * a, rgb[1] * a, rgb[2] * a, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const at = (img: FloatImage, x: number, y: number): number[] => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const maxDiff = (a: FloatImage, b: FloatImage): number => a.data.reduce((m, v, i) => Math.max(m, Math.abs(v - b.data[i])), 0);
const alphaDiff = (a: FloatImage, b: FloatImage): number => {
  let m = 0;
  for (let i = 3; i < a.data.length; i += 4) m = Math.max(m, Math.abs(a.data[i] - b.data[i]));
  return m;
};

describe('hash', () => {
  it('is the grain hash: deterministic, in [0, 1), and changes with each argument', () => {
    expect(hash(7, 3, 9)).toBe(hash(7, 3, 9));
    expect(hash(7, 3, 9)).toBe(grainHash(7, 3, 9));
    expect(hash(7, 3, 9)).not.toBe(hash(8, 3, 9));
    expect(hash(7, 3, 9)).not.toBe(hash(7, 4, 9));
    expect(hash(7, 3, 9)).not.toBe(hash(7, 3, 10));
  });

  it('is uniformly distributed: mean 0.5 ± 0.02 and every tenth bucket holds 10 % ± 1.5 % of 10 000 samples', () => {
    let sum = 0;
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const v = hash(i % 97, i % 101, Math.floor(i / 101));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      buckets[Math.floor(v * 10)]++;
    }
    expect(Math.abs(sum / 10_000 - 0.5)).toBeLessThan(0.02);
    for (const b of buckets) expect(Math.abs(b - 1000)).toBeLessThan(150);
  });
});

describe('invert', () => {
  it('amount 1 twice is the identity, amount 0 is the identity, alpha and transparency are untouched', () => {
    const img = picture(9, 7, (x) => (x < 3 ? 1 : x < 6 ? 0.5 : 0));
    const once = invertRef(img, { amount: 1 });
    expect(maxDiff(invertRef(once, { amount: 1 }), img)).toBeLessThan(1e-6);
    expect(maxDiff(invertRef(img, { amount: 0 }), img)).toBeLessThan(1e-6);
    expect(alphaDiff(once, img)).toBe(0);
    expect(at(once, 8, 3)).toEqual([0, 0, 0, 0]);
    // Straight colour is inverted (white ⇔ black), not the premultiplied value.
    const [r, , , a] = at(img, 4, 2);
    expect(at(once, 4, 2)[0]).toBeCloseTo((1 - r / a) * a, 6);
    expect(at(invertRef(img, { amount: 0.5 }), 4, 2)[0]).toBeCloseTo(0.5 * a, 6);
  });
});

describe('mirror', () => {
  it('maps pixel centres for each mode (odd and even sizes)', () => {
    expect(mirrorSource(0.5, 0.5, 4, 4, 0)).toEqual([0.5, 0.5]);
    expect(mirrorSource(3.5, 1.5, 4, 4, 0)).toEqual([0.5, 1.5]);
    expect(mirrorSource(0.5, 1.5, 4, 4, 1)).toEqual([3.5, 1.5]);
    expect(mirrorSource(2.5, 3.5, 5, 4, 0)).toEqual([2.5, 3.5]);
    expect(mirrorSource(1.5, 3.5, 4, 4, 2)).toEqual([1.5, 0.5]);
    expect(mirrorSource(3.5, 3.5, 4, 4, 3)).toEqual([0.5, 0.5]);
    expect(mirrorSource(0.5, 0.5, 4, 4, 3)).toEqual([0.5, 0.5]);
  });

  it('rounds and clamps the mode param', () => {
    expect(mirrorMode({ mode: 2.6 })).toBe(3);
    expect(mirrorMode({ mode: -4 })).toBe(0);
    expect(mirrorMode({ mode: 9 })).toBe(3);
    expect(mirrorMode({})).toBe(0);
  });

  it('mode 0 makes the right half the mirror image of the left; mode 3 makes four mirrored quadrants', () => {
    const img = picture(10, 6);
    const m0 = mirrorRef(img, { mode: 0 });
    const m3 = mirrorRef(img, { mode: 3 });
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 10; x++) {
        expect(at(m0, x, y)).toEqual(at(img, x < 5 ? x : 9 - x, y));
        expect(at(m3, x, y)).toEqual(at(img, x < 5 ? x : 9 - x, y < 3 ? y : 5 - y));
      }
    }
  });
});

describe('rgbSplit', () => {
  it('the offset is amount 1080-row pixels in the angle direction, scaled to the working height', () => {
    expect(rgbSplitOffset({ amount: 0, angle: 30 }, 1080)).toEqual([0, 0]);
    const [dx, dy] = rgbSplitOffset({ amount: 10, angle: 0 }, 540);
    expect(dx).toBeCloseTo(5, 5);
    expect(dy).toBeCloseTo(0, 5);
    const [ex, ey] = rgbSplitOffset({ amount: 10, angle: 90 }, 2160);
    expect(ex).toBeCloseTo(0, 4);
    expect(ey).toBeCloseTo(20, 4);
  });

  it('moves red by +offset and blue by −offset (clamped at the edges); green and alpha stay', () => {
    const img = picture(12, 5, (x) => (x === 11 ? 0.5 : 1));
    const out = rgbSplitRef(img, { amount: 3 * 1080 / 5, angle: 0 }, 5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 12; x++) {
        const a = img.data[(y * 12 + x) * 4 + 3];
        const straight = (sx: number, k: number) => at(img, sx, y)[k] / at(img, sx, y)[3];
        const o = at(out, x, y);
        expect(o[3]).toBe(a);
        expect(o[0]).toBeCloseTo(straight(Math.max(0, x - 3), 0) * a, 5);
        expect(o[1]).toBeCloseTo(straight(x, 1) * a, 5);
        expect(o[2]).toBeCloseTo(straight(Math.min(11, x + 3), 2) * a, 5);
      }
    }
  });
});

describe('glitch', () => {
  const size = { width: 64, height: 540 };

  it('block sizes are relative to 1080 rows (at least 1 px); probability and shifts scale with intensity', () => {
    const k = glitchCoeffs({ intensity: 0.4, blockSize: 40 }, size);
    expect(1 / k.invBlock).toBeCloseTo(20, 4);
    expect(1 / k.invBlockW).toBeCloseTo(20 * GLITCH_ASPECT, 3);
    expect(1 / glitchCoeffs({ intensity: 0.4, blockSize: 4 }, { width: 8, height: 48 }).invBlock).toBe(1);
    expect(glitchCoeffs({ intensity: 0, blockSize: 40 }, size).prob).toBe(0);
    expect(glitchCoeffs({ intensity: 1, blockSize: 40 }, size).maxShift).toBeGreaterThan(glitchCoeffs({ intensity: 0.5, blockSize: 40 }, size).maxShift);
  });

  it('intensity 0 is the identity; the same frame is identical; frames differ; shifts are whole pixels', () => {
    const img = picture(64, 540);
    expect(maxDiff(glitchRef(img, { intensity: 0, blockSize: 40 }, 3), img)).toBe(0);
    const p = { intensity: 1, blockSize: 40 };
    const a = glitchRef(img, p, 3);
    expect(maxDiff(glitchRef(img, p, 3), a)).toBe(0);
    expect(maxDiff(glitchRef(img, p, 4), a)).toBeGreaterThan(0.1);
    const k = glitchCoeffs(p, size);
    let hits = 0;
    for (let by = 0; by < 27; by++) {
      const s = glitchShift(3, 0, by * 20, k);
      if (s) {
        hits++;
        expect(Number.isInteger(s.shift) && Number.isInteger(s.split)).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(5);
    expect(hits).toBeLessThan(23);
  });

  it('fully transparent rows stay transparent and opaque rows stay opaque', () => {
    const img = picture(64, 540, (_x, y) => (y < 270 ? 1 : 0));
    const out = glitchRef(img, { intensity: 1, blockSize: 10 }, 9);
    expect(alphaDiff(out, img)).toBe(0);
  });
});

describe('vhs', () => {
  const size = { width: 64, height: 540 };
  const zero = { scanlines: 0, bleed: 0, noise: 0, wobble: 0 };

  it('all zero is the identity; scales are relative to 1080 rows and at least 1 px', () => {
    const img = picture(64, 540);
    expect(maxDiff(vhsRef(img, zero, 5), img)).toBe(0);
    const k = vhsCoeffs({ ...zero, scanlines: 1 }, size);
    expect(1 / k.invScan).toBeCloseTo(1, 5);
    expect(1 / vhsCoeffs(zero, { width: 64, height: 2160 }).invScan).toBeCloseTo(4, 5);
    expect(1 / vhsCoeffs(zero, { width: 8, height: 48 }).invNoise).toBe(1);
  });

  it('scanlines darken alternate rows and keep the others; alpha is untouched without wobble', () => {
    const img = picture(64, 540, (x) => (x < 32 ? 1 : x < 48 ? 0.25 : 0));
    const out = vhsRef(img, { ...zero, scanlines: 1 }, 0);
    expect(alphaDiff(out, img)).toBe(0);
    expect(at(out, 3, 0)).toEqual(at(img, 3, 0));
    expect(at(out, 3, 1)[1]).toBeCloseTo(at(img, 3, 1)[1] * 0.5, 6);
    const all = vhsRef(img, { scanlines: 1, bleed: 1, noise: 1, wobble: 0 }, 2);
    expect(alphaDiff(all, img)).toBe(0);
    expect(at(all, 60, 100)).toEqual([0, 0, 0, 0]);
  });

  it('deterministic per frame, different across frames; noise is roughly zero-mean on mid-grey', () => {
    const img = picture(64, 540);
    const p = { scanlines: 0.4, bleed: 0.4, noise: 0.5, wobble: 1 };
    expect(maxDiff(vhsRef(img, p, 7), vhsRef(img, p, 7))).toBe(0);
    expect(maxDiff(vhsRef(img, p, 7), vhsRef(img, p, 8))).toBeGreaterThan(0.1);
    const grey: FloatImage = { width: 64, height: 540, data: new Float32Array(64 * 540 * 4).map((_, i) => (i % 4 === 3 ? 1 : 0.5)) };
    const noisy = vhsRef(grey, { ...zero, noise: 1 }, 3);
    let sum = 0;
    for (let i = 0; i < noisy.data.length; i += 4) sum += noisy.data[i];
    expect(Math.abs(sum / (64 * 540) - 0.5)).toBeLessThan(0.01);
  });
});
