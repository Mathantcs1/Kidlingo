import { describe, it, expect } from 'vitest';
import { colourPixel, linearToSrgb, srgbToLinear } from '../src/render/effects/colourMath';
import { defaultParams, VIDEO_EFFECTS } from '../src/core/videoEffects';
import { PASS_SHADERS } from '../src/render/effects/programs';

type Rgb = [number, number, number];
const DEF = defaultParams('colour');
const at = (over: Record<string, number>): Record<string, number> => ({ ...DEF, ...over });

/** A small deterministic generator (no Math.random: reproducible failures). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SAMPLES: Rgb[] = [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0.5, 0.5, 0.5], [0.2, 0.6, 0.9], [0.03, 0.01, 0.7], [0.3, 0.30000001, 0.12]];

describe('colourPixel (the CPU reference of the colour shader)', () => {
  it('is the exact identity at the default params', () => {
    for (const c of SAMPLES) expect(colourPixel(c, DEF)).toEqual(c);
    expect(colourPixel([0.3, 0.2, 0.1], {})).toEqual([0.3, 0.2, 0.1]);
  });

  it('saturation −1 gives equal channels (grey of the Rec.709 luma)', () => {
    for (const c of SAMPLES) {
      const [r, g, b] = colourPixel(c, at({ saturation: -1 }));
      expect(r).toBeCloseTo(g, 12);
      expect(g).toBeCloseTo(b, 12);
      expect(r).toBeCloseTo(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 12);
    }
  });

  it('exposure +1 doubles the LINEAR value (sRGB in, sRGB out)', () => {
    for (const c of [[0.2, 0.4, 0.6], [0.02, 0.1, 0.3], [0.5, 0.5, 0.5]] as Rgb[]) {
      const out = colourPixel(c, at({ exposure: 1 }));
      for (let k = 0; k < 3; k++) expect(srgbToLinear(out[k])).toBeCloseTo(2 * srgbToLinear(c[k]), 9);
    }
    const down = colourPixel([0.8, 0.8, 0.8], at({ exposure: -2 }));
    expect(srgbToLinear(down[0])).toBeCloseTo(srgbToLinear(0.8) / 4, 9);
    // Not a plain multiply of the encoded value.
    expect(colourPixel([0.5, 0.5, 0.5], at({ exposure: 1 }))[0]).toBeLessThan(0.75);
  });

  it('the sRGB transfer functions are inverse', () => {
    for (let v = 0; v <= 1; v += 0.01) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 12);
  });

  it('hue 180 maps red toward cyan', () => {
    const [r, g, b] = colourPixel([1, 0, 0], at({ hue: 180 }));
    expect(r).toBeLessThan(0.05);
    expect(Math.abs(g - b)).toBeLessThan(0.02);
    expect(g).toBeGreaterThan(0.3);
    const [r2, g2, b2] = colourPixel([1, 0, 0], at({ hue: -180 }));
    expect([r2, g2, b2].map((v) => +v.toFixed(9))).toEqual([r, g, b].map((v) => +v.toFixed(9)));
  });

  it('temperature warms (R up, B down), tint +1 is magenta (G down)', () => {
    const [r, g, b] = colourPixel([0.5, 0.5, 0.5], at({ temperature: 1 }));
    expect(r).toBeCloseTo(0.6, 12);
    expect(g).toBe(0.5);
    expect(b).toBeCloseTo(0.4, 12);
    expect(colourPixel([0.5, 0.5, 0.5], at({ tint: 1 }))[1]).toBeCloseTo(0.4, 12);
    expect(colourPixel([0.5, 0.5, 0.5], at({ tint: -1 }))[1]).toBeCloseTo(0.6, 12);
  });

  it('shadows lift the darks more than the lights; highlights pull the lights more than the darks', () => {
    const lift = (v: number) => colourPixel([v, v, v], at({ shadows: 1 }))[0] - v;
    expect(lift(0)).toBeCloseTo(0.3, 12);
    expect(lift(0.2)).toBeGreaterThan(lift(0.8));
    expect(lift(1)).toBe(0);
    const pull = (v: number) => v - colourPixel([v, v, v], at({ highlights: -1 }))[0];
    expect(pull(1)).toBeCloseTo(0.3, 12);
    expect(pull(0.8)).toBeGreaterThan(pull(0.2));
    expect(pull(0)).toBe(0);
  });

  it('contrast pivots at 0.5', () => {
    expect(colourPixel([0.5, 0.25, 0.75], at({ contrast: 1 }))).toEqual([0.5, 0, 1]);
    expect(colourPixel([0.1, 0.9, 0.5], at({ contrast: -1 }))).toEqual([0.5, 0.5, 0.5]);
  });

  it('brightness is monotonic and spans ±0.5', () => {
    expect(colourPixel([0.2, 0.2, 0.2], at({ brightness: 1 }))[0]).toBeCloseTo(0.7, 12);
    expect(colourPixel([0.2, 0.2, 0.2], at({ brightness: -1 }))[0]).toBe(0);
    const next = rng(7);
    for (let i = 0; i < 100; i++) {
      const c: Rgb = [next(), next(), next()];
      // Every stage before brightness, and desaturation after it (hue 0), keeps each channel monotonic.
      const others = at({
        contrast: next() * 2 - 1, exposure: next() * 4 - 2, temperature: next() * 2 - 1, tint: next() * 2 - 1,
        shadows: next() * 2 - 1, highlights: next() * 2 - 1, saturation: -next(),
      });
      let prev: number[] = [-1, -1, -1];
      for (let b = -1; b <= 1.0001; b += 0.1) {
        const out = colourPixel(c, { ...others, brightness: b });
        for (let k = 0; k < 3; k++) expect(out[k]).toBeGreaterThanOrEqual(prev[k] - 1e-12);
        prev = out;
      }
    }
  });

  it('outputs are finite and clamped to 0..1 for 500 random param draws', () => {
    const next = rng(42);
    const schema = VIDEO_EFFECTS.colour.params;
    for (let i = 0; i < 500; i++) {
      const p = Object.fromEntries(schema.map((d) => [d.key, d.min + next() * (d.max - d.min)]));
      // Every 5th draw pins params to their extremes.
      if (i % 5 === 0) for (const d of schema) p[d.key] = next() < 0.5 ? d.min : d.max;
      const out = colourPixel([next(), next(), next()], p);
      for (const v of out) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('colour effect registration', () => {
  it('is available and has a registered shader', () => {
    expect(VIDEO_EFFECTS.colour.available).toBe(true);
    expect(PASS_SHADERS.colour).toBeDefined();
  });
});
