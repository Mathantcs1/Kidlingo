// Plan 5B Task 5: Ken Burns in log space (D11), the seeded Shake / Jitter (isotropic amplitude, Ruling P5B-4) and the
// scale bound used for overlay textures (presetMaxScale / easeRange).
import { describe, expect, it } from 'vitest';
import { easeAt } from '../src/core/easing';
import { easeRange, presetMaxScale, presetOffsets } from '../src/core/presetMath';
import { rng } from './keyframe-fixtures';
import { F, H, ID, W, entries, randomEase, randomParams } from './preset-fixtures';

describe('Ken Burns (D11) and the seeded presets', () => {
  it('zooms in log space: the value at p = 0.5 is sqrt(z0 z1); pans linearly in format fractions', () => {
    for (const [z0, z1] of [[1, 1.2], [0.5, 3], [3, 0.5], [1.7, 1.7]]) {
      const o = presetOffsets('kenBurns', 'loop', 0.5, { from: z0, to: z1, direction: 5, distance: 0.2 }, F);
      expect(o.kScale / Math.sqrt(z0 * z1)).toBeCloseTo(1, 12);
      expect(presetOffsets('kenBurns', 'loop', 0, { from: z0, to: z1 }, F).kScale).toBe(z0);
      expect(presetOffsets('kenBurns', 'loop', 1, { from: z0, to: z1 }, F).kScale).toBeCloseTo(z1, 12);
      expect(o.dx).toBeCloseTo(0.2 * W * 0.5, 9);
      expect(o.dy).toBeCloseTo(-0.2 * H * 0.5, 9);
    }
  });

  it('Shake is deterministic for a seed, differs between seeds, and depends only on the time since the window start', () => {
    const at = (seed: number, p: number, seconds: number) => presetOffsets('shake', 'emphasis', p, { intensity: 0.05, frequency: 8, seed }, F, { seconds });
    expect(at(42, 0.3, 0.6)).toEqual(at(42, 0.3, 0.6));
    expect(at(42, 0.3, 0.6).dx).not.toBe(at(43, 0.3, 0.6).dx);
    // The same instant of a 0.6 s window, sampled on a 25 and a 30 fps grid (0.2 s is a frame of both).
    expect(at(7, 5 / 25 / 0.6, 0.6)).toEqual(at(7, 6 / 30 / 0.6, 0.6));
    // The wave follows real seconds since the window start (not the eased progress): 0.2 s into a 0.8 s and a 0.4 s
    // window give the same wave (dx : dy), only the envelope differs.
    const ratio = (p: number, seconds: number) => {
      const o = presetOffsets('shake', 'emphasis', p, { intensity: 0.05, frequency: 8, seed: 3 }, F, { seconds, ease: { kind: 'easeInOut' } });
      return o.dx / o.dy;
    };
    expect(ratio(0.25, 0.8)).toBeCloseTo(ratio(0.5, 0.4), 9);
  });

  it('Shake and Jitter are isotropic (P5B-4): intensity x min(W, H) px on both axes, the same px in any format', () => {
    const fmts = [F, { width: 1080, height: 1920 }, { width: 1080, height: 1080 }, { width: 1080, height: 4000 }];
    const r = rng(9);
    for (let n = 0; n < 50; n++) {
      const p = r();
      const params = { intensity: 0.1 * r(), frequency: 1 + 20 * r(), seed: Math.floor(r() * 1e6) };
      const shake = fmts.map((f) => presetOffsets('shake', 'emphasis', p, params, f, { seconds: 0.6 }));
      const jitter = fmts.map((f) => presetOffsets('jitter', 'loop', p, params, f));
      for (const list of [shake, jitter]) {
        for (const o of list) expect(o).toEqual(list[0]);
        expect(Math.abs(list[0].dx)).toBeLessThanOrEqual(params.intensity * Math.min(W, H) + 1e-9);
        expect(Math.abs(list[0].dy)).toBeLessThanOrEqual(params.intensity * Math.min(W, H) + 1e-9);
      }
    }
    // A full-envelope Shake reaches more than half its px amplitude on each axis somewhere (x is not scaled by W).
    const peak = (axis: 'dx' | 'dy') => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(presetOffsets('shake', 'emphasis', i / 400, { intensity: 0.05, frequency: 8, seed: 3 }, F, { seconds: 2 })[axis])));
    expect(peak('dx')).toBeLessThanOrEqual(0.05 * H + 1e-9);
    expect(peak('dy')).toBeGreaterThan(0.05 * H * 0.5);
  });

  it('Jitter is seamless over its cycle and seeded', () => {
    const j = (seed: number, f: number) => presetOffsets('jitter', 'loop', f, { intensity: 0.05, seed }, F);
    for (const seed of [0, 1, 99, 2147483647]) {
      expect(j(seed, 0)).toEqual(ID);
      expect(Math.abs(j(seed, 1 - 1e-12).dx)).toBeLessThan(1e-6);
      expect(j(seed, 0.37)).toEqual(j(seed, 0.37));
    }
    expect(j(1, 0.37).dx).not.toBe(j(2, 0.37).dx);
  });
});

describe('scale bound (overlay texture sizing)', () => {
  it('easeRange contains every ease value', () => {
    const r = rng(3);
    for (let n = 0; n < 300; n++) {
      const e = randomEase(r);
      const [lo, hi] = easeRange(e);
      for (let i = 0; i <= 200; i++) {
        const v = easeAt(e, i / 200, 0.05 + r() * 3);
        expect(v, `${JSON.stringify(e)}`).toBeGreaterThanOrEqual(lo - 1e-12);
        expect(v).toBeLessThanOrEqual(hi + 1e-12);
      }
    }
  });

  it('presetMaxScale bounds the sampled scale of every preset over its param range (500 random draws)', () => {
    const r = rng(500);
    for (let n = 0; n < 500; n++) {
      const [key, slot] = entries()[Math.floor(r() * entries().length)];
      const params = randomParams(key, r);
      const ease = randomEase(r);
      const bound = presetMaxScale(key, slot, params, ease);
      expect(bound).toBeGreaterThanOrEqual(1);
      for (let i = 0; i <= 100; i++) {
        const k = presetOffsets(key, slot, i / 100, params, F, { ease, seconds: 0.1 + r() * 5 }).kScale;
        expect(k, `${key} ${slot} ${JSON.stringify(params)} ${JSON.stringify(ease)}`).toBeLessThanOrEqual(bound * (1 + 1e-12));
      }
    }
  });
});
