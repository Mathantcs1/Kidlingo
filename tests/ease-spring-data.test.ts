// The spring ease's DATA (Plan 5B Task 2, D5): kind, params, repair and comparison. Its maths come in Task 3; until
// then `easeAt` evaluates a spring as linear (pinned below so Task 3 must replace this test, not silently change it).
import { describe, it, expect } from 'vitest';
import { EASE_KINDS, SPRING_DEFAULT, SPRING_LIMITS, easeAt, isSameEase, repairEase } from '../src/core/easing';
import type { Ease } from '../src/core/easing';

const spring = (stiffness: number, damping: number, mass: number): Ease => ({ kind: 'spring', spring: { stiffness, damping, mass } });

describe('spring ease data', () => {
  it('spring is a stored ease kind with defaults 170/26/1 and limits 1..1000, 0..100, 0.1..10', () => {
    expect(EASE_KINDS).toContain('spring');
    expect(SPRING_DEFAULT).toEqual({ stiffness: 170, damping: 26, mass: 1 });
    expect(SPRING_LIMITS).toEqual({ stiffness: [1, 1000], damping: [0, 100], mass: [0.1, 10] });
  });

  it('TEMPORARY (until 5B Task 3): easeAt treats spring as linear, exact at both ends, any segment length', () => {
    for (const u of [0, 0.1, 0.37, 0.5, 0.99, 1]) {
      expect(easeAt(spring(180, 8, 1), u)).toBe(u);
      expect(easeAt(spring(180, 8, 1), u, 0.25)).toBe(u);
    }
    expect(easeAt(spring(180, 8, 1), -1)).toBe(0);
    expect(easeAt(spring(180, 8, 1), 2)).toBe(1);
  });

  it('repairEase keeps valid params, defaults non-finite or missing ones, clamps out-of-range ones', () => {
    expect(repairEase(spring(120, 14, 1))).toEqual(spring(120, 14, 1));
    expect(repairEase({ kind: 'spring' })).toEqual(spring(170, 26, 1));
    expect(repairEase({ kind: 'spring', spring: null })).toEqual(spring(170, 26, 1));
    expect(repairEase({ kind: 'spring', spring: { stiffness: Infinity, damping: '3', mass: Number.NaN } })).toEqual(spring(170, 26, 1));
    expect(repairEase(spring(0, 101, 0.01))).toEqual(spring(1, 100, 0.1));
    expect(repairEase(spring(5000, -3, 11))).toEqual(spring(1000, 0, 10));
    expect(repairEase({ kind: 'spring', spring: { stiffness: 200, damping: 20, mass: 2, extra: 1 }, bezier: [0, 0, 1, 1] })).toEqual(spring(200, 20, 2));
  });

  it('repairEase never gives a spring field to other kinds', () => {
    expect(repairEase({ kind: 'linear', spring: { stiffness: 1, damping: 1, mass: 1 } })).toEqual({ kind: 'linear' });
  });

  it('repair is idempotent', () => {
    for (const raw of [{ kind: 'spring' }, spring(0, 101, 0.01), spring(180, 12, 1)]) expect(repairEase(repairEase(raw))).toEqual(repairEase(raw));
  });

  it('isSameEase compares spring params (a missing spring reads as the defaults)', () => {
    expect(isSameEase(spring(180, 12, 1), spring(180, 12, 1))).toBe(true);
    expect(isSameEase(spring(180, 12, 1), spring(180, 12, 2))).toBe(false);
    expect(isSameEase(spring(180, 12, 1), spring(181, 12, 1))).toBe(false);
    expect(isSameEase(spring(180, 13, 1), spring(180, 12, 1))).toBe(false);
    expect(isSameEase({ kind: 'spring' }, spring(170, 26, 1))).toBe(true);
    expect(isSameEase(spring(170, 26, 1), { kind: 'linear' })).toBe(false);
  });
});
