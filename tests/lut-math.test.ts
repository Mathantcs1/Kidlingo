import { describe, expect, it } from 'vitest';
import { lutCoord, lutDomain, lutPixel } from '../src/render/effects/lutMath';
import type { LutData } from '../src/render/effects/lutMath';

type V3 = [number, number, number];

/** A LUT of `size` whose lattice point (r, g, b) holds fn(r/(n-1), g/(n-1), b/(n-1)), red fastest. */
function lutOf(size: number, fn: (c: V3) => V3, domainMin: V3 = [0, 0, 0], domainMax: V3 = [1, 1, 1]): LutData {
  const data = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    data.set(fn([r, g, b].map((v) => v / (size - 1)) as V3), i);
    i += 3;
  }
  return { size, data, domainMin, domainMax };
}

const SAMPLES: V3[] = [[0, 0, 0], [1, 1, 1], [0.5, 0.25, 0.75], [0.13, 0.91, 0.42], [0.999, 0.001, 0.6], [0.3, 0.3, 0.3]];
const near = (a: number[], b: number[], tol = 1e-6) => a.forEach((v, k) => expect(Math.abs(v - b[k]), `${a} vs ${b}`).toBeLessThanOrEqual(tol));

describe('lutCoord (the half-texel correction)', () => {
  it('maps 0 and 1 to the centres of the first and last texels', () => {
    expect(lutCoord(0, 17)).toBeCloseTo(0.5 / 17, 12);
    expect(lutCoord(1, 17)).toBeCloseTo(16.5 / 17, 12);
    expect(lutCoord(0.5, 3)).toBeCloseTo(0.5, 12);
  });
});

describe('lutPixel', () => {
  it('an identity LUT (17 points) is the identity', () => {
    const lut = lutOf(17, (c) => c);
    for (const c of SAMPLES) near(lutPixel(c, lut, 1), c);
  });

  it('an inverting LUT gives 1 − c', () => {
    const lut = lutOf(2, (c) => c.map((v) => 1 - v) as V3);
    for (const c of SAMPLES) near(lutPixel(c, lut, 1), c.map((v) => 1 - v));
  });

  it('intensity mixes the original and the graded colour', () => {
    const lut = lutOf(2, (c) => c.map((v) => 1 - v) as V3);
    for (const c of SAMPLES) {
      near(lutPixel(c, lut, 0.5), c.map(() => 0.5));
      near(lutPixel(c, lut, 0), c);
    }
  });

  it('interpolates trilinearly between lattice points', () => {
    // Size 3 with a bump at the centre: only lattice point (1,1,1) is non-identity.
    const lut = lutOf(3, (c) => (c.every((v) => v === 0.5) ? [1, 0, 0] : c));
    near(lutPixel([0.5, 0.5, 0.5], lut, 1), [1, 0, 0]);
    // Half-way to a neighbour (0.75, 0.5, 0.5): the average of (1,1,1) and (2,1,1).
    near(lutPixel([0.75, 0.5, 0.5], lut, 1), [(1 + 1) / 2, (0 + 0.5) / 2, (0 + 0.5) / 2]);
    // A quarter of the way in all three axes from (1,1,1) towards (2,2,2): weight (3/4)³ on the bump corner. The
    // identity interpolates exactly, so the result is c with that corner's identity value swapped for the bump.
    const w = (3 / 4) ** 3;
    const c = 0.625;
    near(lutPixel([c, c, c], lut, 1), [c - w * 0.5 + w, c - w * 0.5, c - w * 0.5]);
  });

  it('keeps the red-fastest order: a red↔blue swap LUT swaps red and blue', () => {
    const lut = lutOf(5, ([r, g, b]) => [b, g, r]);
    for (const c of SAMPLES) near(lutPixel(c, lut, 1), [c[2], c[1], c[0]]);
  });

  it('normalises by DOMAIN_MIN/MAX and clamps outside it', () => {
    const lut = lutOf(2, (c) => c, [0, 0, 0], [2, 2, 2]);
    near(lutPixel([0.5, 1, 0], lut, 1), [0.25, 0.5, 0]);
    const shifted = lutOf(2, (c) => c, [0.5, 0.5, 0.5], [1, 1, 1]);
    near(lutPixel([0.25, 0.75, 1], shifted, 1), [0, 0.5, 1]);
    expect(lutDomain(lut)).toEqual({ min: [0, 0, 0], scale: [0.5, 0.5, 0.5] });
  });

  it('clamps graded values outside 0..1', () => {
    const lut = lutOf(2, () => [2, -1, 0.5]);
    near(lutPixel([0.2, 0.4, 0.6], lut, 1), [1, 0, 0.5]);
  });
});
