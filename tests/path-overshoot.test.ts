// Plan 5B Task 4 fix round 1 (M1/M2): an overshooting ease (back, elastic, spring) leaves a curved segment straight
// along the TRUE end direction (C1 at f = 0 and f = 1): the derivative there, or, where the derivative is zero (a
// one-sided or absent tangent), the limit direction towards the first control point that differs from the end.
import { describe, expect, it } from 'vitest';
import type { PositionKeyframe, Vec } from '../src/core/model';
import { bezierTangent, curvedPoint } from '../src/core/pathCurve';
import { pk } from './keyframe-fixtures';

const unitOf = (v: Vec): Vec => {
  const n = Math.hypot(v.x, v.y);
  return { x: v.x / n, y: v.y / n };
};
const dir = (from: Vec, to: Vec): Vec => unitOf({ x: to.x - from.x, y: to.y - from.y });

/** The direction of travel just after the end (f > 1) and just before the start (f < 0). */
function overshootDirs(a: PositionKeyframe, b: PositionKeyframe): { end: Vec; start: Vec } {
  return { end: dir(b, curvedPoint(a, b, 1.05)), start: dir(curvedPoint(a, b, -0.05), a) };
}

function expectDir(got: Vec, want: Vec): void {
  expect(Math.abs(got.x - want.x)).toBeLessThan(1e-9);
  expect(Math.abs(got.y - want.y)).toBeLessThan(1e-9);
}

describe('overshoot beyond a curved segment (C1 continuity)', () => {
  it('continues along the unit end tangent after the end and the unit start tangent before the start', () => {
    // Both tangents present and far from the chord direction (a chord-based overshoot fails here).
    const a: PositionKeyframe = { ...pk(0, 0, 0), out: { x: 0, y: 300 } };
    const b: PositionKeyframe = { ...pk(1, 400, 0), in: { x: 100, y: 250 } };
    const { end, start } = overshootDirs(a, b);
    expectDir(end, unitOf(bezierTangent(a, b, 1)));
    expectDir(start, unitOf(bezierTangent(a, b, 0)));
    // Continuous speed too: the overshoot distance is |f − 1| × arc length, so points just past the end lie on the line.
    const p1 = curvedPoint(a, b, 1.02);
    const p2 = curvedPoint(a, b, 1.04);
    expect(Math.hypot(p2.x - b.x, p2.y - b.y)).toBeCloseTo(2 * Math.hypot(p1.x - b.x, p1.y - b.y), 9);
  });

  it('a zero derivative at an end (absent a.out / b.in) uses the limit direction to the next distinct control point', () => {
    // No a.out: B'(0) = 0, the curve leaves towards P2 = b + b.in; no b.in: it arrives from P1 = a + a.out.
    const a: PositionKeyframe = pk(0, 0, 0);
    const b: PositionKeyframe = { ...pk(1, 300, 300), in: { x: -300, y: 0 } };
    expectDir(overshootDirs(a, b).start, dir({ x: 0, y: 0 }, { x: 0, y: 300 }));
    const c: PositionKeyframe = { ...pk(0, 0, 0), out: { x: 300, y: 0 } };
    const d: PositionKeyframe = pk(1, 300, 300);
    expectDir(overshootDirs(c, d).end, dir({ x: 300, y: 0 }, { x: 300, y: 300 }));
    // An inner control point coincident with the end as well: the next one (P3 from P0, P0 to P3).
    const e: PositionKeyframe = pk(0, 0, 0);
    const f: PositionKeyframe = { ...pk(1, 200, 100), in: { x: -200, y: -100 } };
    expectDir(overshootDirs(e, f).start, dir({ x: 0, y: 0 }, { x: 200, y: 100 }));
    const g: PositionKeyframe = { ...pk(0, 0, 0), out: { x: 200, y: 100 } };
    const h: PositionKeyframe = pk(1, 200, 100);
    expectDir(overshootDirs(g, h).end, dir({ x: 0, y: 0 }, { x: 200, y: 100 }));
  });
});
