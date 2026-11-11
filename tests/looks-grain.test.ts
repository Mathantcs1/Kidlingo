import { describe, it, expect } from 'vitest';
import { defaultParams } from '../src/core/videoEffects';
import { grainCell, grainHash, grainInvCell, grainPixel, referenceScale } from '../src/render/effects/looksMath';

const at = (over: Record<string, number>): Record<string, number> => ({ ...defaultParams('grain'), ...over });
const GREY: [number, number, number] = [0.5, 0.5, 0.5];

describe('grain hash', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(grainHash(3, 10, 20)).toBe(grainHash(3, 10, 20));
    expect(grainHash(3, 10, 20)).not.toBe(grainHash(4, 10, 20));
    expect(grainHash(3, 10, 20)).not.toBe(grainHash(3, 11, 20));
    expect(grainHash(3, 10, 20)).not.toBe(grainHash(3, 10, 21));
    for (let i = 0; i < 1000; i++) {
      const h = grainHash(i, i * 7, i * 13);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
  it('is uniform: mean ≈ 0.5 and every decile populated over 10 000 samples', () => {
    let sum = 0;
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < 10000; i++) {
      const h = grainHash(i % 5, i % 100, Math.floor(i / 100));
      sum += h;
      bins[Math.floor(h * 10)]++;
    }
    expect(Math.abs(sum / 10000 - 0.5)).toBeLessThan(0.02);
    for (const n of bins) expect(Math.abs(n - 1000)).toBeLessThan(150);
  });
});

describe('grain size is relative to 1080 working rows', () => {
  it('referenceScale is 1 at 1080 rows, 2 at 2160, and 1 for junk', () => {
    expect(referenceScale(1080)).toBe(1);
    expect(referenceScale(2160)).toBe(2);
    expect(referenceScale(540)).toBe(0.5);
    for (const bad of [0, -5, NaN, Infinity]) expect(referenceScale(bad)).toBe(1);
  });
  it('1080 rows leaves the cell unchanged; 2160 rows doubles it in pixels (and clamps size to 1..4)', () => {
    expect(grainCell(1.5, 1080)).toBe(1.5);
    expect(grainCell(1.5, 2160)).toBe(3);
    expect(grainCell(4, 2160)).toBe(8);
    expect(grainCell(9, 1080)).toBe(4);
    expect(grainCell(0, 1080)).toBe(1);
    expect(grainInvCell(4)).toBe(0.25);
  });
  it('pixels share noise inside a cell, and the cell is twice as wide at 2160 rows', () => {
    const p = at({ amount: 0.5, size: 4 });
    const same = (a: number, b: number, h: number) =>
      grainPixel(GREY, a, 0, 0, p, h)[0] === grainPixel(GREY, b, 0, 0, p, h)[0];
    expect(same(4, 7, 1080)).toBe(true);
    expect(same(3, 4, 1080)).toBe(false);
    expect(same(8, 15, 2160)).toBe(true);
    expect(same(7, 8, 2160)).toBe(false);
    // Rows too.
    expect(grainPixel(GREY, 0, 4, 0, p, 1080)).toEqual(grainPixel(GREY, 0, 7, 0, p, 1080));
  });
  it('exact cell boundaries (size 1.5: (x + 0.5) / 1.5 is an integer) fall into the later cell', () => {
    const p = at({ amount: 0.5, size: 1.5 });
    // x = 1 and x = 2 straddle the boundary at 1.5: pixel centre 1.5 starts cell 1 together with x = 2.
    expect(grainPixel(GREY, 1, 0, 0, p, 1080)).toEqual(grainPixel(GREY, 2, 0, 0, p, 1080));
    expect(grainPixel(GREY, 0, 0, 0, p, 1080)).not.toEqual(grainPixel(GREY, 1, 0, 0, p, 1080));
  });
});

describe('grain amount, identity and clamping bias', () => {
  it('amount 0 is the exact identity; the noise is equal on all channels', () => {
    for (const c of [[0, 0, 0], [1, 1, 1], [0.2, 0.6, 0.9]] as [number, number, number][]) {
      expect(grainPixel(c, 5, 7, 2, at({ amount: 0 }), 1080)).toEqual(c);
    }
    const [r, g, b] = grainPixel([0.3, 0.3, 0.3], 9, 9, 1, at({ amount: 0.4 }), 1080);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
  it('the mean is ≈ the input at mid-grey but below 1 at white (clamped: white can only go down)', () => {
    const p = at({ amount: 0.3, size: 1 });
    const mean = (c: number): number => {
      let sum = 0;
      for (let i = 0; i < 4000; i++) sum += grainPixel([c, c, c], i % 64, Math.floor(i / 64), 1, p, 1080)[0];
      return sum / 4000;
    };
    expect(Math.abs(mean(0.5) - 0.5)).toBeLessThan(0.005);
    expect(mean(1)).toBeLessThan(0.99);
    expect(mean(0)).toBeGreaterThan(0.01);
  });
});
