import { describe, expect, it } from 'vitest';
import { BLEND_MODES } from '../src/core/videoEffects';
import type { BlendMode } from '../src/core/model';
import { BLEND_MODE_INDEX, blendChannel, blendPixel, compositeSize } from '../src/render/blend';
import type { Rgba } from '../src/render/blend';

// blendChannel(mode, backdrop, source) at (0.2, 0.6), (0, 1) and (1, 0): the W3C Compositing Level 1 formulas.
const EXPECTED: Record<BlendMode, [number, number, number]> = {
  normal: [0.6, 1, 0],
  multiply: [0.12, 0, 0],
  screen: [0.68, 1, 1],
  overlay: [0.24, 0, 1],
  darken: [0.2, 0, 0],
  lighten: [0.6, 1, 1],
  colourDodge: [0.5, 0, 1],
  colourBurn: [0, 0, 1],
  hardLight: [0.36, 1, 0],
  softLight: [0.2496, 0, 1],
  difference: [0.4, 1, 1],
  exclusion: [0.56, 1, 1],
};

const POINTS: [number, number][] = [[0.2, 0.6], [0, 1], [1, 0]];

/** A deterministic PRNG (mulberry32) so failures reproduce. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('blendChannel', () => {
  it('has an expected value for every mode', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...BLEND_MODES].sort());
  });

  for (const mode of BLEND_MODES) {
    it(`${mode}: exact values at (0.2, 0.6), (0, 1), (1, 0)`, () => {
      POINTS.forEach(([b, s], i) => expect(blendChannel(mode, b, s), `${mode}(${b}, ${s})`).toBeCloseTo(EXPECTED[mode][i], 10));
    });
  }

  it('more points: overlay/hard light swap roles, soft light both branches, dodge/burn clamps', () => {
    expect(blendChannel('overlay', 0.6, 0.2)).toBeCloseTo(blendChannel('hardLight', 0.2, 0.6), 12);
    expect(blendChannel('overlay', 0.8, 0.5)).toBeCloseTo(1 - 2 * 0.2 * 0.5, 12);
    expect(blendChannel('softLight', 0.5, 0.25)).toBeCloseTo(0.5 - 0.5 * 0.5 * 0.5, 12);
    expect(blendChannel('softLight', 0.64, 0.75)).toBeCloseTo(0.64 + 0.5 * (0.8 - 0.64), 12);
    expect(blendChannel('colourDodge', 0.9, 0.5)).toBe(1);
    expect(blendChannel('colourBurn', 0.1, 0.5)).toBe(0);
    expect(blendChannel('colourBurn', 0.8, 0.5)).toBeCloseTo(0.6, 12);
  });

  it('every mode stays finite and within 0..1 for random inputs (and the exact ends)', () => {
    const r = rng(7);
    const edge = [0, 1, 0.5, 0.25, 1e-9, 1 - 1e-9];
    for (const mode of BLEND_MODES) {
      const pairs: [number, number][] = [...edge.flatMap((b) => edge.map((s): [number, number] => [b, s]))];
      for (let i = 0; i < 5000; i++) pairs.push([r(), r()]);
      for (const [b, s] of pairs) {
        const v = blendChannel(mode, b, s);
        expect(Number.isFinite(v), `${mode}(${b}, ${s}) = ${v}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('modes are indexed by their position in BLEND_MODES (the GLSL constants use the same table)', () => {
    BLEND_MODES.forEach((m, i) => expect(BLEND_MODE_INDEX[m]).toBe(i));
  });
});

const overSource = (b: Rgba, s: Rgba): Rgba => [0, 1, 2, 3].map((k) => s[k] + b[k] * (1 - s[3])) as Rgba;

describe('blendPixel (premultiplied in and out)', () => {
  it('normal is premultiplied source-over for random pixels', () => {
    const r = rng(11);
    const pm = (): Rgba => {
      const a = r();
      return [r() * a, r() * a, r() * a, a];
    };
    for (let i = 0; i < 2000; i++) {
      const b = pm();
      const s = pm();
      blendPixel('normal', b, s).forEach((v, k) => expect(v).toBeCloseTo(overSource(b, s)[k], 12));
    }
  });

  it('opaque over opaque is blendChannel per channel, alpha 1', () => {
    const b: Rgba = [0.2, 0, 1, 1];
    const s: Rgba = [0.6, 1, 0, 1];
    for (const mode of BLEND_MODES) {
      const out = blendPixel(mode, b, s);
      expect(out[3]).toBe(1);
      for (let k = 0; k < 3; k++) expect(out[k]).toBeCloseTo(blendChannel(mode, b[k], s[k]), 12);
    }
  });

  it('a transparent source leaves the backdrop; a half-alpha source mixes backdrop and blend half-way (no halo)', () => {
    const b: Rgba = [0.2, 0.4, 0.8, 1];
    for (const mode of BLEND_MODES) {
      expect(blendPixel(mode, b, [0, 0, 0, 0])).toEqual(b);
      // Straight colour 0.6 at alpha 0.5: premultiplied 0.3.
      const half = blendPixel(mode, b, [0.3, 0.3, 0.3, 0.5]);
      for (let k = 0; k < 3; k++) expect(half[k]).toBeCloseTo(0.5 * b[k] + 0.5 * blendChannel(mode, b[k], 0.6), 12);
      expect(half[3]).toBe(1);
    }
  });

  it('over a transparent backdrop every mode shows the source as is', () => {
    const s: Rgba = [0.1, 0.2, 0.3, 0.4];
    for (const mode of BLEND_MODES) blendPixel(mode, [0, 0, 0, 0], s).forEach((v, k) => expect(v).toBeCloseTo(s[k], 12));
  });

  it('stays finite and premultiplied (rgb <= alpha <= 1) for random inputs', () => {
    const r = rng(3);
    for (const mode of BLEND_MODES) {
      for (let i = 0; i < 2000; i++) {
        const ab = r();
        const as = i % 7 === 0 ? 0 : r();
        const out = blendPixel(mode, [r() * ab, r() * ab, r() * ab, ab], [r() * as, r() * as, r() * as, as]);
        for (const v of out) expect(Number.isFinite(v)).toBe(true);
        expect(out[3]).toBeLessThanOrEqual(1 + 1e-12);
        for (let k = 0; k < 3; k++) {
          expect(out[k]).toBeGreaterThanOrEqual(-1e-12);
          expect(out[k]).toBeLessThanOrEqual(out[3] + 1e-12);
        }
      }
    }
  });
});

describe('compositeSize', () => {
  it('keeps the viewport size within the texture limit and the byte budget', () => {
    expect(compositeSize({ width: 1920, height: 1080 }, 16384, 3, 128 * 2 ** 20)).toEqual({ width: 1920, height: 1080 });
    expect(compositeSize({ width: 3840, height: 2160 }, 16384, 3, 128 * 2 ** 20)).toEqual({ width: 3840, height: 2160 });
  });

  it('scales down, keeping the shape, past the texture limit or the budget', () => {
    expect(compositeSize({ width: 8192, height: 4096 }, 4096, 3, 2 ** 40)).toEqual({ width: 4096, height: 2048 });
    const s = compositeSize({ width: 7680, height: 4320 }, 16384, 3, 128 * 2 ** 20);
    expect(s.width * s.height * 4 * 3).toBeLessThanOrEqual(128 * 2 ** 20);
    expect(s.width / s.height).toBeCloseTo(16 / 9, 2);
    expect(compositeSize({ width: 0, height: 0 }, 4096, 3, 1000)).toEqual({ width: 1, height: 1 });
  });
});
