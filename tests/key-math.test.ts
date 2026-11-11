import { describe, expect, it } from 'vitest';
import {
  MIN_FEATHER, chroma, chromaKeyRef, keyAlpha, keyCoeffs, keyEdges, keyPixel, suppressSpill,
} from '../src/render/effects/keyMath';
import type { Rgb } from '../src/render/effects/keyMath';
import { CHROMA_KEY } from '../src/render/effects/shaders/chromaKey';
import { PASS_SHADERS } from '../src/render/effects/programs';
import { defaultParams } from '../src/core/videoEffects';
import type { EffectContext, Uniforms } from '../src/render/effects/types';

const GREEN: Rgb = [0, 1, 0];
const DEF = defaultParams('chromaKey');
const SIM = DEF.similarity;
const SMOOTH = DEF.smoothness;
const KEYS: Rgb[] = [GREEN, [0, 0, 1], [0.2, 0.7, 0.3], [0.9, 0.1, 0.6]];

let seed = 12345;
const rand = (): number => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 2 ** 32;
};
const rgb = (): Rgb => [rand(), rand(), rand()];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('chroma', () => {
  it('is 0 for greys and in −0.5..0.5 for any colour', () => {
    for (const v of [0, 0.3, 1]) for (const k of chroma([v, v, v])) expect(Math.abs(k)).toBeLessThan(1e-12);
    expect(chroma([0, 0, 1])[0]).toBeCloseTo(0.5, 12);
    expect(chroma([1, 0, 0])[1]).toBeCloseTo(0.5, 12);
    for (let i = 0; i < 1000; i++) for (const k of chroma(rgb())) expect(Math.abs(k)).toBeLessThanOrEqual(0.5 + 1e-12);
  });
});

describe('keyAlpha', () => {
  it('is 0 for the key colour and for colours close to it', () => {
    for (const key of KEYS) expect(keyAlpha(key, key, SIM, SMOOTH)).toBe(0);
    expect(keyAlpha([0.15, 0.85, 0.1], GREEN, SIM, SMOOTH)).toBe(0);
  });

  it('is 1 for colours far from the key', () => {
    for (const c of [[1, 0, 0], [0, 0, 1], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0, 0], [0.9, 0.7, 0.6]] as Rgb[]) {
      expect(keyAlpha(c, GREEN, SIM, SMOOTH), String(c)).toBe(1);
    }
    expect(keyAlpha(GREEN, [0, 0, 1], SIM, SMOOTH)).toBe(1);
  });

  it('is monotonic (non-decreasing) in chroma distance from the key', () => {
    for (const key of KEYS) {
      for (let r = 0; r < 50; r++) {
        const far = rgb();
        const sim = rand();
        const smooth = rand();
        let prev = -1;
        for (let i = 0; i <= 100; i++) {
          // chroma is linear in RGB, so the distance grows linearly along the line from the key.
          const a = keyAlpha(mix(key, far, i / 100), key, sim, smooth);
          expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
          prev = a;
        }
      }
    }
  });

  it('is in 0..1 and finite for random colours, keys and settings (including the extremes)', () => {
    for (let i = 0; i < 5000; i++) {
      const pick = (): number => [0, 1, rand()][i % 3];
      const a = keyAlpha(rgb(), rgb(), pick(), pick());
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('keeps everything at similarity 0, the key colour included', () => {
    for (const key of KEYS) for (const s of [0, 0.5, 1]) expect(keyAlpha(key, key, 0, s)).toBe(1);
    for (let i = 0; i < 500; i++) expect(keyAlpha(rgb(), GREEN, 0, rand())).toBe(1);
  });

  it('feathers between similarity − smoothness (0) and similarity (1); smoothness 0 is a steep ramp of MIN_FEATHER', () => {
    // red–green mixtures: chroma distance = t · |chroma(red) − chroma(green)|.
    const span = Math.hypot(chroma([1, 0, 0])[0] - chroma(GREEN)[0], chroma([1, 0, 0])[1] - chroma(GREEN)[1]);
    const at = (d: number, sim: number, smooth: number): number => keyAlpha(mix(GREEN, [1, 0, 0], d / span), GREEN, sim, smooth);
    expect(at(0.24, 0.35, 0.1)).toBe(0);
    expect(at(0.30, 0.35, 0.1)).toBeCloseTo(0.5, 6);
    expect(at(0.35 + 1e-9, 0.35, 0.1)).toBe(1);
    expect(at(0.349 - 1e-6, 0.35, 0)).toBe(0);
    expect(at(0.35, 0.35, 0)).toBe(1);
    expect(keyEdges(0.35, 0)).toEqual({ lo: 0.35 - MIN_FEATHER, inv: expect.closeTo(1 / MIN_FEATHER, 6) });
    expect(keyEdges(0.2, 1).lo).toBe(0);
    expect(keyEdges(0, 0).lo).toBe(-MIN_FEATHER);
  });
});

describe('suppressSpill', () => {
  const argmax = (k: Rgb): number => k.indexOf(Math.max(...k));

  it('never increases the key channel (random colours, keys and amounts)', () => {
    for (let i = 0; i < 5000; i++) {
      const c = rgb();
      const key = i % 4 === 0 ? KEYS[i % KEYS.length] : rgb();
      const ch = argmax(key);
      expect(suppressSpill(c, key, rand())[ch]).toBeLessThanOrEqual(c[ch] + 1e-12);
    }
  });

  it('with a pure green key and amount 1 leaves green between red and blue (no green fringe)', () => {
    for (let i = 0; i < 5000; i++) {
      const [r, g, b] = suppressSpill(rgb(), GREEN, 1);
      expect(g).toBeLessThanOrEqual(Math.max(r, b) + 1e-12);
    }
    const [r, g, b] = suppressSpill([0.4, 0.6, 0], GREEN, 1);
    expect(g).toBeLessThan(r);
    expect(b).toBeGreaterThan(0);
  });

  it('keeps luma, is the identity at amount 0, for a grey key, and for colours with no key component', () => {
    for (let i = 0; i < 1000; i++) {
      const c = mix([0.5, 0.5, 0.5], rgb(), 0.3);
      const out = suppressSpill(c, GREEN, rand());
      if (out.every((v) => v > 0 && v < 1)) expect(luma(out)).toBeCloseTo(luma(c), 10);
      expect(suppressSpill(c, GREEN, 0)).toEqual(c);
      expect(suppressSpill(c, [0.4, 0.4, 0.4], 1)).toEqual(c);
    }
    expect(suppressSpill([1, 0, 0], GREEN, 1)).toEqual([1, 0, 0]);
    expect(suppressSpill([0.8, 0.47, 0.24], GREEN, 1)).toEqual([0.8, 0.47, 0.24]);
  });
});

describe('keyPixel / chromaKeyRef', () => {
  it('multiplies alpha by keyAlpha and premultiplies the spill-suppressed colour', () => {
    expect(keyPixel(GREEN, 1, DEF)).toEqual([0, 0, 0, 0]);
    expect(keyPixel([1, 0, 0], 0.5, DEF)).toEqual([0.5, 0, 0, 0.5]);
    const c: Rgb = [0.4, 0.6, 0];
    const s = suppressSpill(c, GREEN, DEF.spill);
    const a = 0.8 * keyAlpha(c, GREEN, SIM, SMOOTH);
    expect(keyPixel(c, 0.8, DEF)).toEqual([s[0] * a, s[1] * a, s[2] * a, a]);
  });

  it('runs keyPixel on the un-premultiplied colour of every pixel; transparent stays transparent', () => {
    const img = { width: 3, height: 1, data: new Float32Array([0, 0.5, 0, 0.5, 0.25, 0, 0, 0.25, 0, 0, 0, 0]) };
    const out = chromaKeyRef(img, DEF);
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...out.data.slice(4, 8)]).toEqual([0.25, 0, 0, 0.25]);
    expect([...out.data.slice(8)]).toEqual([0, 0, 0, 0]);
  });
});

describe('CHROMA_KEY shader', () => {
  const ctx: EffectContext = { time: 0, frame: 0, fps: 30, lut: () => null, onUnavailable: () => {} };
  const size = { width: 64, height: 64 };
  const passes = (p: Record<string, number>): Uniforms[] => {
    const out: Uniforms[] = [];
    CHROMA_KEY.run!({ draw: (u) => { out.push(u); } }, p, ctx, size);
    return out;
  };

  it('is registered; one pass at the defaults with keyCoeffs as declared float/vec uniforms; no pass at the identity', () => {
    expect(PASS_SHADERS.chromaKey).toBe(CHROMA_KEY);
    const drawn = passes(DEF);
    expect(drawn).toHaveLength(1);
    const k = keyCoeffs(DEF);
    expect(drawn[0]).toEqual({ u_keyChroma: k.keyChroma, u_edge: k.edge, u_spillDir: k.spillDir, u_spillScale: k.spillScale });
    const kinds: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
    for (const [name, value] of Object.entries(drawn[0])) {
      const decl = new RegExp(`uniform (float|vec[234]) ${name};`).exec(CHROMA_KEY.fragment);
      expect(decl, name).not.toBeNull();
      expect(typeof value === 'number' ? 1 : value.length, name).toBe(kinds[decl![1]]);
      for (const v of typeof value === 'number' ? [value] : value) expect(Number.isFinite(v)).toBe(true);
    }
    expect(passes({ ...DEF, similarity: 0, spill: 0 })).toEqual([]);
    expect(passes({ ...DEF, similarity: 0 })).toHaveLength(1);
    expect(passes({ ...DEF, spill: 0 })).toHaveLength(1);
  });

  it('writes premultiplied output with the source alpha times the key alpha', () => {
    expect(CHROMA_KEY.fragment).toMatch(/outColor = premultiply\(.*src\.a \* /);
  });
});
