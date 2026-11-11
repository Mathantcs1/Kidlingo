import { describe, it, expect } from 'vitest';
import { blurRef, glowRef, pixelateRef, sharpenRef } from '../src/render/effects/blurRef';
import type { FloatImage } from '../src/render/effects/blurRef';

/** A width×height premultiplied image from a straight-colour function. */
function image(width: number, height: number, f: (x: number, y: number) => [number, number, number, number]): FloatImage {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = f(x, y);
      data.set([r * a, g * a, b * a, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
const at = (img: FloatImage, x: number, y: number): number[] => {
  const i = (y * img.width + x) * 4;
  return Array.from(img.data.subarray(i, i + 4));
};
const total = (img: FloatImage, c: number): number => img.data.reduce((s, v, i) => (i % 4 === c ? s + v : s), 0);
// 1080 rows: radii are working pixels.
const dot = image(64, 1080, (x, y) => (x === 32 && y === 540 ? [1, 1, 1, 1] : [0, 0, 0, 1]));

describe('blur family CPU references', () => {
  it('blur conserves the energy of an interior point and spreads it symmetrically', () => {
    const out = blurRef(dot, { radius: 8 });
    expect(total(out, 0)).toBeCloseTo(1, 5);
    expect(at(out, 32, 540)[0]).toBeLessThan(0.02);
    expect(at(out, 28, 540)[0]).toBeCloseTo(at(out, 36, 540)[0], 7);
    expect(at(out, 32, 536)[0]).toBeCloseTo(at(out, 28, 540)[0], 7);
  });

  it('two blurs equal one blur of the combined sigma (radii add in quadrature)', () => {
    const line = image(1, 1080, (_x, y) => (y === 540 ? [1, 1, 1, 1] : [0, 0, 0, 1]));
    const twice = blurRef(blurRef(line, { radius: 12 }), { radius: 16 });
    const once = blurRef(line, { radius: 20 });
    for (let y = 500; y <= 580; y++) expect(Math.abs(at(twice, 0, y)[0] - at(once, 0, y)[0]), `y=${y}`).toBeLessThan(5e-4);
  });

  it('a large radius (strided stages) still conserves energy and is smooth', () => {
    const line = image(1, 1080, (_x, y) => (y === 540 ? [1, 1, 1, 1] : [0, 0, 0, 1]));
    const out = blurRef(line, { radius: 100 });
    expect(total(out, 0)).toBeCloseTo(1, 4);
    const sigma = 50;
    for (const d of [0, 25, 50, 100]) {
      const want = Math.exp(-(d * d) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
      expect(Math.abs(at(out, 0, 540 + d)[0] / want - 1), `d=${d}`).toBeLessThan(0.05);
    }
  });

  it('blur, sharpen and glow keep the straight colour of a uniformly coloured soft edge (no premultiplied halo)', () => {
    const C = [0.8, 0.5, 0.2];
    const edge = image(64, 64, (x) => [C[0], C[1], C[2], x < 32 ? 1 : x < 40 ? 0.5 : x < 44 ? 0.15 : 0]);
    // Glow is additive light, so it brightens where the picture is; where it was transparent it is C-coloured light.
    const glow = glowRef(edge, { threshold: 0, radius: 300, intensity: 1 });
    for (const [out, from] of [[blurRef(edge, { radius: 200 }), 0], [sharpenRef(edge, { amount: 2, radius: 5 }), 0], [glow, 44]] as const) {
      for (let x = from; x < 64; x++) {
        const p = at(out, x, 32);
        if (p[3] < 0.01) continue;
        for (let k = 0; k < 3; k++) expect(p[k] / p[3], `x=${x}`).toBeCloseTo(C[k], 5);
      }
    }
    expect(at(glow, 50, 32)[3]).toBeGreaterThan(0.01);
    // Sharpen leaves alpha untouched; blur spreads it but conserves it.
    const s = sharpenRef(edge, { amount: 2, radius: 5 });
    for (let x = 0; x < 64; x++) expect(at(s, x, 32)[3]).toBeCloseTo(at(edge, x, 32)[3], 6);
    expect(total(blurRef(edge, { radius: 200 }), 3)).toBeCloseTo(total(edge, 3), 2);
  });

  it('strength 0 is the identity (same image)', () => {
    expect(blurRef(dot, { radius: 0 })).toBe(dot);
    expect(sharpenRef(dot, { amount: 0, radius: 2 })).toBe(dot);
    expect(glowRef(dot, { intensity: 0, radius: 20, threshold: 0 })).toBe(dot);
    expect(glowRef(dot, { intensity: 1, radius: 0, threshold: 0 })).toBe(dot);
    expect(pixelateRef(dot, { size: 1 })).toBe(dot);
  });

  it('pixelate makes constant blocks of the centre pixel, anchored top-left, partial blocks clamped', () => {
    const ramp = image(20, 1080, (x, y) => [x / 20, (y % 50) / 50, 0, 1]);
    const out = pixelateRef(ramp, { size: 8 });
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 20; x++) {
        const cx = Math.min(19, Math.floor(x / 8) * 8 + 4);
        expect(at(out, x, y), `${x},${y}`).toEqual(at(ramp, cx, Math.floor(y / 8) * 8 + 4));
      }
    }
  });

  it('glow only adds light around pixels above the threshold', () => {
    const near = (x: number, y: number, cy: number): boolean => Math.abs(x - 32) < 3 && Math.abs(y - cy) < 3;
    const img = image(64, 1080, (x, y) => (near(x, y, 300) ? [1, 1, 1, 1] : near(x, y, 700) ? [0.5, 0.5, 0.5, 1] : [0, 0, 0, 1]));
    const out = glowRef(img, { threshold: 0.7, radius: 20, intensity: 1 });
    expect(at(out, 32, 290)[0]).toBeGreaterThan(0.01);
    expect(at(out, 32, 690)).toEqual(at(img, 32, 690));
    expect(at(out, 32, 700)).toEqual(at(img, 32, 700));
  });
});
