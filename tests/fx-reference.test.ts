import { describe, it, expect } from 'vitest';
import { FX_TYPES } from '../src/core/model';
import { defaultFxParams } from '../src/fx/params';
import { LOOK_KEYS, LOOKS, lookParams } from '../src/fx/looks';
import { bwPixel, colorPixel, invertPixel, lookPixel, lutSample, sepiaPixel, vignetteFactor } from '../src/fx/reference';
import type { Rgb } from '../src/fx/reference';

const color = (over: Record<string, number>) => ({ ...defaultFxParams('color'), ...over });
const close = (a: Rgb, b: Rgb, digits = 3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const SAMPLES: Rgb[] = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.8, 0.3, 0.1], [0.1, 0.6, 0.9]];

describe('colorPixel', () => {
  it('is the identity with default parameters', () => {
    for (const c of SAMPLES) close(colorPixel(c, color({})), c, 10);
  });

  it('brightness adds 0.5 x brightness', () => close(colorPixel([0.5, 0.5, 0.5], color({ brightness: 0.4 })), [0.7, 0.7, 0.7]));
  it('contrast pivots around 0.5', () => close(colorPixel([0.25, 0.25, 0.25], color({ contrast: 0.5 })), [0.125, 0.125, 0.125]));
  it('saturation -1 gives the Rec.709 luma on every channel', () =>
    close(colorPixel([1, 0, 0], color({ saturation: -1 })), [0.2126, 0.2126, 0.2126], 6));
  it('exposure +1 stop works in linear light (0.5 -> about 0.686)', () =>
    expect(colorPixel([0.5, 0.5, 0.5], color({ exposure: 1 }))[0]).toBeCloseTo(0.686, 2));
  it('hue 120 turns red into green', () => close(colorPixel([1, 0, 0], color({ hue: 120 })), [0, 1, 0], 6));
  it('temperature warms (red up, blue down) and tint moves green', () => {
    close(colorPixel([0.5, 0.5, 0.5], color({ temperature: 1 })), [0.6, 0.5, 0.4]);
    close(colorPixel([0.5, 0.5, 0.5], color({ tint: 1 })), [0.5, 0.4, 0.5]);
  });
  it('shadows lift darks (+0.243 at luma 0.1) and barely move lights (< 0.004 at luma 0.9)', () => {
    expect(colorPixel([0.1, 0.1, 0.1], color({ shadows: 1 }))[0]).toBeCloseTo(0.343, 3);
    expect(Math.abs(colorPixel([0.9, 0.9, 0.9], color({ shadows: 1 }))[0] - 0.9)).toBeLessThan(0.004);
  });
  it('highlights act on lights and barely on darks', () => {
    expect(colorPixel([0.9, 0.9, 0.9], color({ highlights: -1 }))[0]).toBeCloseTo(0.9 - 0.3 * 0.81, 3);
    expect(Math.abs(colorPixel([0.1, 0.1, 0.1], color({ highlights: -1 }))[0] - 0.1)).toBeLessThan(0.004);
  });
  it('clamps the result to 0..1', () => {
    close(colorPixel([0.9, 0.1, 0.1], color({ brightness: 1 })), [1, 0.6, 0.6]);
    close(colorPixel([0.1, 0.1, 0.1], color({ brightness: -1 })), [0, 0, 0]);
  });
});

describe('single-purpose pixel effects', () => {
  it('bw: amount 0 is the identity, amount 1 is luma', () => {
    close(bwPixel([0.8, 0.3, 0.1], 0), [0.8, 0.3, 0.1], 10);
    const l = 0.2126 * 0.8 + 0.7152 * 0.3 + 0.0722 * 0.1;
    close(bwPixel([0.8, 0.3, 0.1], 1), [l, l, l], 8);
  });
  it('sepia: amount 0 identity; grey becomes warm (r > g > b)', () => {
    close(sepiaPixel([0.3, 0.6, 0.9], 0), [0.3, 0.6, 0.9], 10);
    const [r, g, b] = sepiaPixel([0.5, 0.5, 0.5], 1);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
  it('invert: 1 - c, mixed by amount', () => {
    close(invertPixel([0.2, 0.5, 1], 1), [0.8, 0.5, 0]);
    close(invertPixel([0.2, 0.5, 1], 0.5), [0.5, 0.5, 0.5]);
    close(invertPixel([0.2, 0.5, 1], 0), [0.2, 0.5, 1]);
  });
  it('vignette: centre untouched, corner at least 30 % darker at amount 1, amount 0 is the identity', () => {
    const d = defaultFxParams('vignette');
    expect(vignetteFactor([0.5, 0.5], { ...d, amount: 1 })).toBe(1);
    expect(vignetteFactor([0, 0], { ...d, amount: 1 })).toBeLessThanOrEqual(0.7);
    expect(vignetteFactor([0, 0], { ...d, amount: 0 })).toBe(1);
  });
});

describe('lookPixel', () => {
  it('has nine looks, in preset order', () => {
    expect(LOOK_KEYS).toEqual(['cinematic', 'moody', 'goldenHour', 'tealOrange', 'fashion', 'cleanVlog', 'film35', 'cyberpunk', 'dreamy']);
    expect(Object.keys(LOOKS).sort()).toEqual([...LOOK_KEYS].sort());
  });

  it('intensity 0 is the identity for every look; intensity 1 changes the picture', () => {
    for (const key of LOOK_KEYS) {
      for (const c of SAMPLES) close(lookPixel(c, key, 0), c, 10);
      const moved = SAMPLES.map((c) => lookPixel(c, key, 1).reduce((s, v, i) => s + Math.abs(v - c[i]), 0));
      expect(Math.max(...moved), key).toBeGreaterThan(0.03);
    }
  });

  it('distance from the source never shrinks as intensity grows', () => {
    for (const key of LOOK_KEYS) {
      const c: Rgb = [0.7, 0.4, 0.2];
      let prev = -1;
      for (const k of [0, 0.25, 0.5, 0.75, 1]) {
        const out = lookPixel(c, key, k);
        const dist = Math.hypot(out[0] - c[0], out[1] - c[1], out[2] - c[2]);
        expect(dist + 1e-9, `${key} @ ${k}`).toBeGreaterThanOrEqual(prev);
        prev = dist;
      }
    }
  });

  it('lookParams interpolates every field toward its neutral value', () => {
    const half = lookParams('tealOrange', 0.5);
    const full = lookParams('tealOrange', 1);
    expect(half.contrast).toBeCloseTo((1 + full.contrast) / 2, 10);
    expect(half.grain).toBeCloseTo(full.grain / 2, 10);
    expect(lookParams('film35', 0)).toEqual({ lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1, fade: 0, vignette: 0, grain: 0 });
  });
});

describe('lutSample', () => {
  const identity2 = { size: 2, data: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]) };
  it('an identity cube returns its input (trilinear)', () => {
    for (const c of SAMPLES) close(lutSample(identity2, c), c, 6);
  });
  it('an inverting cube returns 1 - c', () => {
    const inv = { size: 2, data: identity2.data.map((v) => 1 - v) };
    close(lutSample(inv, [0.25, 0.5, 1]), [0.75, 0.5, 0], 6);
  });
});

describe('every effect type has a schema the reference can use', () => {
  it('has the expected set of effect types', () => expect(FX_TYPES).toHaveLength(17));
});
