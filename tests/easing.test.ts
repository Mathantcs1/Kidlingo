import { describe, expect, it } from 'vitest';
import { EASE_PRESETS, cubicBezierAt, easeAt, isSameEase, repairEase } from '../src/core/easing';
import type { Ease, EaseKind } from '../src/core/easing';

const KINDS: EaseKind[] = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'back', 'elastic', 'bounce', 'bezier'];
const mk = (kind: EaseKind): Ease => (kind === 'bezier' ? { kind, bezier: [0.3, -0.2, 0.7, 1.4] } : { kind });

/** Small seeded generator (mulberry32) so the property tests are deterministic. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('easeAt endpoints', () => {
  for (const kind of KINDS) {
    it(`${kind}: exactly 0 at u=0 and exactly 1 at u=1`, () => {
      expect(easeAt(mk(kind), 0)).toBe(0);
      expect(easeAt(mk(kind), 1)).toBe(1);
    });
    it(`${kind}: u is clamped to [0, 1]`, () => {
      expect(easeAt(mk(kind), -3)).toBe(0);
      expect(easeAt(mk(kind), 7)).toBe(1);
      expect(easeAt(mk(kind), Number.NaN)).toBe(0);
    });
  }
});

describe('easeAt kinds', () => {
  it('linear is the identity', () => {
    for (const u of [0, 0.1, 0.37, 0.5, 0.99, 1]) expect(easeAt({ kind: 'linear' }, u)).toBe(u);
  });
  it('hold stays at 0 until the next key', () => {
    expect(easeAt({ kind: 'hold' }, 0.999999)).toBe(0);
    expect(easeAt({ kind: 'hold' }, 0.5)).toBe(0);
  });
  it('easeInOut(0.5) = 0.5', () => {
    expect(Math.abs(easeAt({ kind: 'easeInOut' }, 0.5) - 0.5)).toBeLessThan(1e-9);
  });
  it('back overshoots above 1 (max about 1.1) and settles at 1', () => {
    let max = 0;
    for (let i = 0; i <= 1000; i++) max = Math.max(max, easeAt({ kind: 'back' }, i / 1000));
    expect(max).toBeGreaterThan(1.09);
    expect(max).toBeLessThan(1.11);
    expect(easeAt({ kind: 'back' }, 0.5)).toBeGreaterThan(0.9);
  });
  it('elastic and bounce are finite and bounded in [-0.5, 1.5]', () => {
    for (const kind of ['elastic', 'bounce'] as const) {
      for (let i = 0; i <= 1000; i++) {
        const v = easeAt({ kind }, i / 1000);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(-0.5);
        expect(v).toBeLessThanOrEqual(1.5);
      }
    }
  });
  it('bounce stays within [0, 1] and elastic oscillates around 1', () => {
    for (let i = 0; i <= 200; i++) {
      const v = easeAt({ kind: 'bounce' }, i / 200);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-12);
    }
    let above = false;
    let below = false;
    for (let i = 1; i < 1000; i++) {
      const v = easeAt({ kind: 'elastic' }, i / 1000);
      if (v > 1.001) above = true;
      if (v < 0.999) below = true;
    }
    expect(above && below).toBe(true);
  });
  it('bezier without handles behaves as linear', () => {
    expect(easeAt({ kind: 'bezier' }, 0.3)).toBe(0.3);
  });
});

describe('CSS cubic-bezier reference values (independent bisection solver)', () => {
  const ref: Record<'easeIn' | 'easeOut' | 'easeInOut', number[]> = {
    easeIn: [0.093464651, 0.315356813, 0.621861869],
    easeOut: [0.378138131, 0.684643187, 0.906535349],
    easeInOut: [0.129161931, 0.5, 0.870838069],
  };
  for (const kind of ['easeIn', 'easeOut', 'easeInOut'] as const) {
    it(`${kind} at u = 0.25 / 0.5 / 0.75`, () => {
      [0.25, 0.5, 0.75].forEach((u, i) => {
        expect(Math.abs(easeAt({ kind }, u) - ref[kind][i])).toBeLessThan(1e-6);
      });
    });
  }
  it('preset constants are the CSS definitions', () => {
    expect(EASE_PRESETS.easeIn).toEqual([0.42, 0, 1, 1]);
    expect(EASE_PRESETS.easeOut).toEqual([0, 0, 0.58, 1]);
    expect(EASE_PRESETS.easeInOut).toEqual([0.42, 0, 0.58, 1]);
  });
  it('an asymmetric curve is not mirrored (guards swapped x1/y1)', () => {
    // cubic-bezier(0.1, 0.9, 0.2, 1) at u = 0.25, reference from an independent bisection solver.
    expect(Math.abs(cubicBezierAt(0.1, 0.9, 0.2, 1, 0.25) - 0.84946950)).toBeLessThan(1e-6);
    expect(Math.abs(cubicBezierAt(0.9, 0.1, 0.2, 1, 0.25) - 0.06286635)).toBeLessThan(1e-6);
  });
});

describe('cubicBezierAt', () => {
  it('(0,0,1,1) is linear within 1e-7', () => {
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      expect(Math.abs(cubicBezierAt(0, 0, 1, 1, u) - u)).toBeLessThan(1e-7);
    }
  });
  it('endpoints are exact', () => {
    expect(cubicBezierAt(0.2, 0.8, 0.9, 0.1, 0)).toBe(0);
    expect(cubicBezierAt(0.2, 0.8, 0.9, 0.1, 1)).toBe(1);
  });
  it('is monotone for the presets', () => {
    for (const p of Object.values(EASE_PRESETS)) {
      let prev = -Infinity;
      for (let i = 0; i <= 500; i++) {
        const v = cubicBezierAt(p[0], p[1], p[2], p[3], i / 500);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });
  it('is monotone for 500 random handle sets with y in [0, 1]', () => {
    const r = rng(12345);
    for (let d = 0; d < 500; d++) {
      const [x1, y1, x2, y2] = [r(), r(), r(), r()];
      let prev = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const v = cubicBezierAt(x1, y1, x2, y2, i / 100);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
        prev = v;
      }
    }
  });
  it('solves x(s) = u to within 1e-7 (x error)', () => {
    const r = rng(99);
    for (let d = 0; d < 200; d++) {
      const [x1, y1, x2] = [r(), r(), r()];
      const u = r();
      // y1 = y2 = identity-in-y trick: with y = x curve the output equals the solved x.
      const v = cubicBezierAt(x1, x1, x2, x2, u);
      expect(Math.abs(v - u)).toBeLessThan(1e-7);
      void y1;
    }
  });
  it('out-of-range x handles are clamped to [0, 1] (same result as the clamped curve)', () => {
    for (let i = 0; i <= 50; i++) {
      const u = i / 50;
      expect(cubicBezierAt(3, 0.2, -2, 0.9, u)).toBeCloseTo(cubicBezierAt(1, 0.2, 0, 0.9, u), 9);
    }
  });
  it('degenerate flat-x handles (x1 = x2 = 0 or 1) stay finite and in range', () => {
    for (const [x1, x2] of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
      for (let i = 0; i <= 50; i++) {
        const v = cubicBezierAt(x1, 0.2, x2, 0.8, i / 50);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('repairEase', () => {
  it('keeps valid eases', () => {
    expect(repairEase({ kind: 'easeIn' })).toEqual({ kind: 'easeIn' });
    expect(repairEase({ kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] })).toEqual({ kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] });
  });
  it('drops stray bezier on non-bezier kinds', () => {
    expect(repairEase({ kind: 'easeOut', bezier: [0, 0, 1, 1] })).toEqual({ kind: 'easeOut' });
  });
  it('non-finite handle => linear', () => {
    expect(repairEase({ kind: 'bezier', bezier: [Number.NaN, 0, 1, 1] })).toEqual({ kind: 'linear' });
    expect(repairEase({ kind: 'bezier', bezier: [0, 0, Infinity, 1] })).toEqual({ kind: 'linear' });
  });
  it('clamps x to [0, 1] and y to [-1, 2]', () => {
    expect(repairEase({ kind: 'bezier', bezier: [2, -5, -1, 9] })).toEqual({ kind: 'bezier', bezier: [1, -1, 0, 2] });
  });
  it('unknown kind or junk => linear', () => {
    expect(repairEase({ kind: 'wobble' })).toEqual({ kind: 'linear' });
    for (const junk of [null, undefined, 5, 'easeIn', [], {}]) expect(repairEase(junk)).toEqual({ kind: 'linear' });
  });
  it('bezier with missing or malformed handles => linear', () => {
    expect(repairEase({ kind: 'bezier' })).toEqual({ kind: 'linear' });
    expect(repairEase({ kind: 'bezier', bezier: [0, 0, 1] })).toEqual({ kind: 'linear' });
    expect(repairEase({ kind: 'bezier', bezier: ['a', 0, 1, 1] })).toEqual({ kind: 'linear' });
  });
  it('does not mutate its input and returns a fresh handle array', () => {
    const raw = { kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] };
    const out = repairEase(raw);
    expect(raw).toEqual({ kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] });
    expect(out.bezier).not.toBe(raw.bezier);
  });
});

describe('isSameEase', () => {
  it('compares kind and handles', () => {
    expect(isSameEase({ kind: 'linear' }, { kind: 'linear' })).toBe(true);
    expect(isSameEase({ kind: 'linear' }, { kind: 'hold' })).toBe(false);
    const a: Ease = { kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] };
    expect(isSameEase(a, { kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.4] })).toBe(true);
    expect(isSameEase(a, { kind: 'bezier', bezier: [0.1, 0.2, 0.3, 0.5] })).toBe(false);
    expect(isSameEase(a, { kind: 'bezier' })).toBe(false);
  });
  it('ignores handles on non-bezier kinds', () => {
    expect(isSameEase({ kind: 'easeIn' }, { kind: 'easeIn', bezier: [0, 0, 1, 1] })).toBe(true);
  });
});
