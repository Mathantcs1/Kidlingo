// Plan 5B Task 3 (D5): the spring ease in closed form vs a fine RK4 reference, exact endpoints, branch continuity at
// critical damping, monotone over-damping, bounded zero damping, physical-time invariance; valueAt with a spring.
import { describe, expect, it } from 'vitest';
import { SPRING_DEFAULT, easeAt } from '../src/core/easing';
import type { Ease, SpringParams } from '../src/core/easing';
import { valueAt } from '../src/core/keyframes';
import { SPRING_PRESETS, springAt, springEase, springResidual } from '../src/core/spring';
import { k } from './keyframe-fixtures';

const sp = (stiffness: number, damping: number, mass: number): SpringParams => ({ stiffness, damping, mass });
const ease = (s: SpringParams): Ease => ({ kind: 'spring', spring: s });

/** x'' = (k(1 − x) − c·x') / m from rest at 0, RK4 with step h; returns x at every `every`-th step (index 0 = τ 0). */
function rk4(s: SpringParams, h: number, steps: number, every: number): number[] {
  const acc = (x: number, v: number) => (s.stiffness * (1 - x) - s.damping * v) / s.mass;
  let x = 0;
  let v = 0;
  const out = [0];
  for (let i = 1; i <= steps; i++) {
    const k1x = v; const k1v = acc(x, v);
    const k2x = v + (h / 2) * k1v; const k2v = acc(x + (h / 2) * k1x, v + (h / 2) * k1v);
    const k3x = v + (h / 2) * k2v; const k3v = acc(x + (h / 2) * k2x, v + (h / 2) * k2v);
    const k4x = v + h * k3v; const k4v = acc(x + h * k3x, v + h * k3v);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    if (i % every === 0) out.push(x);
  }
  return out;
}

/** 12 parameter sets: the four presets, ζ = 0, ζ = 1 exactly (twice), over-damped (twice), and mixed masses. */
const SETS: SpringParams[] = [
  sp(120, 14, 1), sp(170, 26, 1), sp(180, 12, 1), sp(180, 8, 1),
  sp(100, 0, 1), sp(1000, 0, 0.1), sp(100, 20, 1), sp(1, 2, 1),
  sp(1000, 100, 0.1), sp(1, 100, 10), sp(50, 5, 2), sp(500, 30, 3),
];

describe('springAt (closed form)', () => {
  it('matches an RK4 reference (h = 1e-5) at 200 points over 1 s for 12 parameter sets within 1e-6', () => {
    for (const s of SETS) {
      const ref = rk4(s, 1e-5, 100_000, 500);
      expect(ref).toHaveLength(201);
      ref.forEach((x, i) => expect(Math.abs(springAt(s, i / 200) - x), `${JSON.stringify(s)} τ=${i / 200}`).toBeLessThan(1e-6));
    }
  });

  it('starts exactly at 0 (and reads 0 before release) and tends to 1', () => {
    for (const s of SETS) {
      expect(springAt(s, 0)).toBe(0);
      expect(springAt(s, -1)).toBe(0);
      if (s.damping > 0) expect(Math.abs(springAt(s, 1e4) - 1)).toBeLessThan(1e-6);
    }
  });

  it('is continuous across ζ = 1: ζ = 1 ± 1e-9 within 1e-9 of the critically damped value', () => {
    for (const [stiffness, mass] of [[170, 1], [1, 0.1], [1000, 0.1], [1, 10], [100, 2], [1000, 10]]) {
      const crit = 2 * Math.sqrt(stiffness * mass);
      for (const f of [1 + 1e-9, 1 - 1e-9]) {
        for (let i = 0; i <= 300; i++) {
          const tau = (i / 300) * 3;
          const d = Math.abs(springAt(sp(stiffness, crit * f, mass), tau) - springAt(sp(stiffness, crit, mass), tau));
          expect(d, `k=${stiffness} m=${mass} f=${f} τ=${tau}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('over-damped springs rise monotonically from 0 to 1 without overshoot (long segments stay finite)', () => {
    for (const s of [sp(1000, 100, 0.1), sp(1, 100, 10), sp(100, 40, 1), sp(1, 100, 0.1)]) {
      let prev = 0;
      for (let i = 0; i <= 400; i++) {
        const x = springAt(s, (i / 400) * 60);
        expect(Number.isFinite(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(prev);
        expect(x).toBeLessThanOrEqual(1);
        prev = x;
      }
      for (let i = 0; i <= 50; i++) expect(easeAt(ease(s), i / 50, 0.7)).toBeGreaterThanOrEqual(easeAt(ease(s), Math.max(0, (i - 1) / 50), 0.7));
      expect(Number.isFinite(springAt(s, 1e6))).toBe(true);
    }
  });

  it('damping 0 oscillates forever, bounded in [0, 2]; its ease stays within [−1, 3]', () => {
    for (const s of [sp(100, 0, 1), sp(1000, 0, 0.1), sp(1, 0, 10)]) {
      for (let i = 0; i <= 2000; i++) {
        const x = springAt(s, i * 0.05);
        expect(x).toBeGreaterThanOrEqual(-1e-12);
        expect(x).toBeLessThanOrEqual(2 + 1e-12);
      }
      for (let i = 0; i <= 200; i++) {
        const e = easeAt(ease(s), i / 200, 3.3);
        expect(e).toBeGreaterThanOrEqual(-1);
        expect(e).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('springEase (endpoint-corrected, physical seconds)', () => {
  it('is EXACTLY 0 at u = 0 and EXACTLY 1 at u = 1 for every set and segment length', () => {
    for (const s of SETS) {
      for (const S of [0.05, 0.25, 0.5, 1, 2, 7.3]) {
        expect(springEase(s, 0, S)).toBe(0);
        expect(springEase(s, 1, S)).toBe(1);
      }
    }
  });

  it('is continuous into both ends even when the spring has not settled (no jump at the last frame)', () => {
    for (const s of [sp(180, 8, 1), sp(100, 0, 1), sp(1, 2, 1)]) {
      for (const S of [0.25, 0.5]) {
        expect(springResidual(s, S)).toBeGreaterThan(0.05); // genuinely unsettled
        expect(Math.abs(easeAt(ease(s), 1 - 1e-9, S) - 1)).toBeLessThan(1e-6);
        expect(Math.abs(easeAt(ease(s), 1e-9, S))).toBeLessThan(1e-6);
      }
    }
  });

  it('is the physical motion in seconds: the same τ gives the same x on a 0.5 s and a 2 s segment (minus the correction)', () => {
    for (const s of SETS) {
      const c05 = 1 - springAt(s, 0.5);
      const c2 = 1 - springAt(s, 2);
      for (let i = 0; i <= 50; i++) {
        const tau = (i / 50) * 0.5;
        const a = springEase(s, tau / 0.5, 0.5) - (tau / 0.5) * c05;
        const b = springEase(s, tau / 2, 2) - (tau / 2) * c2;
        expect(Math.abs(a - b), `${JSON.stringify(s)} τ=${tau}`).toBeLessThan(1e-12);
        expect(Math.abs(a - springAt(s, tau))).toBeLessThan(1e-12);
        // A settled spring feels the same on both segments within the two corrections.
        expect(Math.abs(springEase(s, tau / 0.5, 0.5) - springEase(s, tau / 2, 2))).toBeLessThanOrEqual(Math.abs(c05) + Math.abs(c2) + 1e-12);
      }
    }
  });

  it('easeAt reads the spring (missing params = the defaults), clamps u and defaults `seconds` to 1', () => {
    const s = sp(180, 12, 1);
    expect(easeAt(ease(s), 0.3, 0.8)).toBe(springEase(s, 0.3, 0.8));
    expect(easeAt(ease(s), 0.3)).toBe(springEase(s, 0.3, 1));
    expect(easeAt({ kind: 'spring' }, 0.3, 0.8)).toBe(springEase(SPRING_DEFAULT, 0.3, 0.8));
    expect(easeAt(ease(s), -2, 0.8)).toBe(0);
    expect(easeAt(ease(s), 5, 0.8)).toBe(1);
    expect(easeAt(ease(s), Number.NaN, 0.8)).toBe(0);
    expect(easeAt(ease(s), 0.4, 0.8)).not.toBe(0.4); // not linear any more (Task 2's temporary rule is gone)
    expect(springEase(s, 0.3, 0)).toBe(springEase(s, 0.3, 1));
    expect(springEase(s, 0.3, Number.NaN)).toBe(springEase(s, 0.3, 1));
  });

  it('a bouncy spring overshoots; a snappy one settles within 2 % on a 0.5 s segment', () => {
    const bouncy = SPRING_PRESETS.find((p) => p.key === 'bouncy')!.spring;
    let peak = 0;
    for (let i = 0; i <= 200; i++) peak = Math.max(peak, easeAt(ease(bouncy), i / 200, 1));
    expect(peak).toBeGreaterThan(1.1);
    expect(springResidual(SPRING_PRESETS.find((p) => p.key === 'snappy')!.spring, 0.5)).toBeLessThan(0.02);
  });

  it('presets are Gentle 120/14/1, Snappy 170/26/1 (the default), Bouncy 180/12/1, Wobbly 180/8/1', () => {
    expect(SPRING_PRESETS.map((p) => [p.key, p.label, p.spring])).toEqual([
      ['gentle', 'Gentle', sp(120, 14, 1)], ['snappy', 'Snappy', sp(170, 26, 1)],
      ['bouncy', 'Bouncy', sp(180, 12, 1)], ['wobbly', 'Wobbly', sp(180, 8, 1)],
    ]);
    expect(SPRING_PRESETS[1].spring).toEqual(SPRING_DEFAULT);
  });
});

describe('valueAt with a spring segment (segment seconds from the key times)', () => {
  it('a 0.5 s and a 2 s segment follow springEase with their own durations; keys stay exact', () => {
    const s = sp(180, 12, 1);
    for (const S of [0.5, 2]) {
      const list = [k(1, 10, ease(s)), k(1 + S, 110)];
      expect(valueAt(list, 1)).toBe(10);
      expect(valueAt(list, 1 + S)).toBe(110);
      for (let i = 1; i < 20; i++) {
        const u = 1 + (S * i) / 20;
        expect(valueAt(list, u)).toBeCloseTo(10 + 100 * springEase(s, (u - 1) / S, S), 12);
      }
    }
    // Physical time: at τ = 0.25 s after the key both segments show nearly the same value (snappy has settled by 0.5 s).
    const snap = sp(170, 26, 1);
    const a = valueAt([k(0, 0, ease(snap)), k(0.5, 100)], 0.25);
    const b = valueAt([k(0, 0, ease(snap)), k(2, 100)], 0.25);
    expect(Math.abs(a - b)).toBeLessThan(2);
    expect(Math.abs(a - b)).toBeGreaterThan(0); // and not the same normalised curve: a linear-time ease would differ by far more
    expect(Math.abs(a - 100 * easeAt({ kind: 'easeOut' }, 0.5))).toBeGreaterThan(5);
  });

  it('overshoot is clamped to the property range (opacity 0..1)', () => {
    const list = [k(0, 0, ease(sp(180, 8, 1))), k(1, 1)];
    let max = 0;
    for (let i = 0; i <= 100; i++) max = Math.max(max, valueAt(list, i / 100, 0, 1));
    expect(max).toBe(1);
    let raw = 0;
    for (let i = 0; i <= 100; i++) raw = Math.max(raw, valueAt(list, i / 100));
    expect(raw).toBeGreaterThan(1.2);
  });
});
