import { describe, it, expect } from 'vitest';
import {
  MAX_SIDE_TAPS, SIGMA_PER_RADIUS, blurRadius, blurStages, gaussianKernel, pixelBlock,
} from '../src/render/effects/blurMath';
import type { Kernel } from '../src/render/effects/blurMath';

const RADII = [0.01, 0.3, 0.5, 1, 2, 3.7, 8, 20, 42, 50, 64, 100, 128, 200, 300, 711, 1000];
const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);

/** A kernel expanded to whole texels (each fractional tap split between its two texels, as GL LINEAR does). */
function texels(k: Kernel): Map<number, number> {
  const out = new Map<number, number>();
  const add = (i: number, w: number): void => void out.set(i, (out.get(i) ?? 0) + w);
  k.offsets.forEach((o, i) => {
    const i0 = Math.floor(o);
    const f = o - i0;
    add(i0, k.weights[i] * (1 - f));
    if (f > 0) add(i0 + 1, k.weights[i] * f);
  });
  return out;
}

const variance = (k: Kernel): number => [...texels(k)].reduce((s, [i, w]) => s + w * i * i, 0);

describe('gaussianKernel', () => {
  it('radius 0 (and non-finite or negative radii) is the identity: one tap of weight 1 at offset 0', () => {
    for (const r of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(gaussianKernel(r)).toEqual({ offsets: [0], weights: [1] });
  });

  it('weights sum to 1 within 1e-6, offsets and weights are symmetric, and the tap cap holds', () => {
    for (const r of RADII) {
      const { offsets, weights } = gaussianKernel(r);
      expect(offsets.length, `r=${r}`).toBe(weights.length);
      expect(Math.abs(sum(weights) - 1), `r=${r}`).toBeLessThanOrEqual(1e-6);
      expect(offsets.length, `r=${r}`).toBeLessThanOrEqual(2 * MAX_SIDE_TAPS + 1);
      const n = offsets.length;
      for (let i = 0; i < n; i++) {
        expect(offsets[i] + offsets[n - 1 - i], `r=${r} offset ${i}`).toBeCloseTo(0, 12);
        expect(weights[i], `r=${r} weight ${i}`).toBeCloseTo(weights[n - 1 - i], 12);
      }
      expect(offsets[(n - 1) / 2]).toBe(0);
      for (let i = 1; i < n; i++) expect(offsets[i], `r=${r} ascending`).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it('weights per texel fall off monotonically away from the centre', () => {
    for (const r of RADII) {
      const t = texels(gaussianKernel(r));
      const side = [...t].filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < side.length; i++) {
        // Strided taps leave zero-weight texels between them: compare the taps that carry weight.
        if (side[i][1] === 0) continue;
        expect(side[i][1], `r=${r} texel ${side[i][0]}`).toBeLessThanOrEqual(side[i - 1][1] + 1e-15);
      }
    }
  });

  it('within the cap, the linear-sampling taps reproduce the discrete gaussian of sigma = radius / 2 exactly', () => {
    for (const r of [1, 8, 20, 42]) {
      const sigma = r * SIGMA_PER_RADIUS;
      const reach = Math.ceil(3 * sigma);
      const g = Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * sigma * sigma)));
      const total = sum(g);
      const t = texels(gaussianKernel(r));
      for (let i = -reach; i <= reach; i++) expect(t.get(i) ?? 0, `r=${r} texel ${i}`).toBeCloseTo(g[i + reach] / total, 9);
    }
  });

  it('is deterministic', () => {
    for (const r of RADII) expect(gaussianKernel(r)).toEqual(gaussianKernel(r));
  });
});

describe('blurStages', () => {
  it('is empty (no pass) at radius 0', () => {
    expect(blurStages(0)).toEqual([]);
    expect(blurStages(-1)).toEqual([]);
  });

  it('is one stage within the tap cap, and stages whose variances add up to sigma² beyond it', () => {
    expect(blurStages(8)).toEqual([gaussianKernel(8)]);
    for (const r of RADII) {
      const stages = blurStages(r);
      const sigma = r * SIGMA_PER_RADIUS;
      expect(stages.length, `r=${r}`).toBeGreaterThanOrEqual(1);
      expect(stages.length, `r=${r}`).toBeLessThanOrEqual(3);
      for (const k of stages) {
        expect(k.offsets.length, `r=${r}`).toBeLessThanOrEqual(2 * MAX_SIDE_TAPS + 1);
        expect(Math.abs(sum(k.weights) - 1)).toBeLessThanOrEqual(1e-6);
      }
      // Truncation at 3 sigma removes ~1 % of the variance; a tiny sigma is all centre.
      const v = sum(stages.map(variance));
      if (sigma >= 1) expect(Math.abs(v / (sigma * sigma) - 1), `r=${r}: variance ${v} vs ${sigma ** 2}`).toBeLessThan(0.03);
    }
    expect(blurStages(100).length).toBe(2);
  });
});

describe('reference-1080 sizes', () => {
  it('blurRadius scales a radius in 1080-row pixels to working pixels', () => {
    expect(blurRadius(8, 1080)).toBe(8);
    expect(blurRadius(8, 540)).toBe(4);
    expect(blurRadius(100, 2160)).toBe(200);
    expect(blurRadius(8, 0)).toBe(8);
  });

  it('pixelBlock is one working pixel at size 1 at every resolution, else size × the reference scale (≥ 1)', () => {
    for (const h of [1, 48, 1080, 2160, 4320]) expect(pixelBlock(1, h)).toBe(1);
    expect(pixelBlock(12, 1080)).toBe(12);
    expect(pixelBlock(180, 48)).toBe(8);
    expect(pixelBlock(40, 216)).toBe(8);
    expect(pixelBlock(12, 48)).toBe(1);
    expect(pixelBlock(2, 2160)).toBe(4);
  });
});
