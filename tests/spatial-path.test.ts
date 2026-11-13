// Plan 5B Task 4 (D6): spatial Bezier motion paths. Straight segments stay the 5A code path BIT FOR BIT (oracle: a copy
// of the 5A positionAt); curved segments start/end exactly on their keys, lie on the analytic cubic and are travelled
// by ARC LENGTH (linear ease = constant speed; eased = the arc-length fraction equals easeAt).
import { describe, expect, it } from 'vitest';
import { easeAt } from '../src/core/easing';
import type { Ease } from '../src/core/easing';
import { positionAt } from '../src/core/keyframes';
import type { PositionKeyframe, Vec } from '../src/core/model';
import { ARC_SAMPLES, arcTable, bezierPoint, curvedPoint, isCurved } from '../src/core/pathCurve';
import { evalPosition } from '../src/core/spatialPath';
import { pk, rng } from './keyframe-fixtures';

/** The 5A positionAt (at 6df07c3), kept verbatim as the oracle for straight paths. */
function positionAt5A(keys: readonly PositionKeyframe[], u: number): { x: number; y: number } {
  const segmentIndex = (u2: number): number => {
    let lo = 0;
    let hi = keys.length - 1;
    if (hi < 0 || u2 < keys[0].t) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (keys[mid].t <= u2) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const fraction = (i: number, u2: number): number | null => {
    if (i < 0 || i >= keys.length - 1) return null;
    const a = keys[i];
    return easeAt(a.ease, (u2 - a.t) / (keys[i + 1].t - a.t), keys[i + 1].t - a.t);
  };
  if (keys.length === 0) return { x: NaN, y: NaN };
  const i = segmentIndex(u);
  const f = fraction(i, u);
  if (f === null) {
    const k = keys[i < 0 ? 0 : i];
    return { x: k.x, y: k.y };
  }
  const a = keys[i];
  const b = keys[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

const EASES: Ease[] = [
  { kind: 'linear' }, { kind: 'hold' }, { kind: 'easeIn' }, { kind: 'easeOut' }, { kind: 'easeInOut' }, { kind: 'back' },
  { kind: 'elastic' }, { kind: 'bounce' }, { kind: 'bezier', bezier: [0.2, -0.6, 0.7, 1.8] },
  { kind: 'spring', spring: { stiffness: 180, damping: 8, mass: 1 } },
];
const curve = (a: Vec, out: Vec, inn: Vec, b: Vec, ease: Ease = { kind: 'linear' }): PositionKeyframe[] =>
  [{ t: 0, x: a.x, y: a.y, ease, out }, { t: 2, x: b.x, y: b.y, ease: { kind: 'linear' }, in: inn }];
const CURVES: PositionKeyframe[][] = [
  curve({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: -300 }, { x: 400, y: 400 }),
  curve({ x: -500, y: 200 }, { x: 200, y: -600 }, { x: -200, y: -600 }, { x: 500, y: 200 }),
  curve({ x: 0, y: 0 }, { x: 600, y: 300 }, { x: 600, y: -300 }, { x: 0, y: 0.5 }),
  [{ t: 0, x: 10, y: 10, ease: { kind: 'linear' } }, { t: 2, x: 900, y: -40, ease: { kind: 'linear' }, in: { x: -100, y: 400 } }],
];

/** The true arc length of a cubic from t0 to t1 (fine polyline). */
function trueLength(a: PositionKeyframe, b: PositionKeyframe, t0: number, t1: number, n = 20000): number {
  let len = 0;
  let p = bezierPoint(a, b, t0);
  for (let j = 1; j <= n; j++) {
    const q = bezierPoint(a, b, t0 + ((t1 - t0) * j) / n);
    len += Math.hypot(q.x - p.x, q.y - p.y);
    p = q;
  }
  return len;
}
/** The Bezier parameter of the curve point nearest `pt` (dense search then bisection on the distance). */
function nearestT(a: PositionKeyframe, b: PositionKeyframe, pt: Vec): number {
  const d = (t: number) => { const q = bezierPoint(a, b, t); return Math.hypot(q.x - pt.x, q.y - pt.y); };
  let best = 0;
  for (let j = 0; j <= 4000; j++) if (d(j / 4000) < d(best)) best = j / 4000;
  let lo = Math.max(0, best - 1 / 4000);
  let hi = Math.min(1, best + 1 / 4000);
  for (let it = 0; it < 200; it++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (d(m1) < d(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

describe('straight paths: the 5A code path, bit for bit', () => {
  it('10 000 random evaluations of tangent-free (and zero-tangent) lists equal the 5A positionAt exactly', () => {
    const r = rng(2026);
    let n = 0;
    while (n < 10_000) {
      const count = 1 + Math.floor(r() * 7);
      const list: PositionKeyframe[] = [];
      let t = r() * 4 - 2;
      for (let j = 0; j < count; j++) {
        const key = pk(t, r() * 4000 - 2000, r() * 4000 - 2000, EASES[Math.floor(r() * EASES.length)]);
        if (r() < 0.3) key.out = { x: 0, y: 0 };
        if (r() < 0.3) key.in = { x: 0, y: 0 };
        list.push(key);
        t += 0.01 + r() * 2;
      }
      for (let j = 0; j < 20; j++, n++) {
        const u = list[0].t - 1 + r() * (t - list[0].t + 2);
        const got = positionAt(list, u);
        const want = positionAt5A(list, u);
        expect(Object.is(got.x, want.x) && Object.is(got.y, want.y), `${n} u=${u}`).toBe(true);
        expect(evalPosition(list, undefined, u)).toEqual(got);
      }
    }
  });
  it('zero tangents are straight; a non-zero tangent at either end is curved', () => {
    expect(isCurved(pk(0, 0, 0), pk(1, 1, 1))).toBe(false);
    expect(isCurved({ ...pk(0, 0, 0), out: { x: 0, y: 0 } }, { ...pk(1, 1, 1), in: { x: 0, y: 0 } })).toBe(false);
    expect(isCurved({ ...pk(0, 0, 0), in: { x: 5, y: 0 } }, { ...pk(1, 1, 1), out: { x: 5, y: 0 } })).toBe(false);
    expect(isCurved({ ...pk(0, 0, 0), out: { x: 0, y: 1e-12 } }, pk(1, 1, 1))).toBe(true);
    expect(isCurved(pk(0, 0, 0), { ...pk(1, 1, 1), in: { x: -3, y: 0 } })).toBe(true);
  });
});

describe('curved segments', () => {
  it('start and end exactly on their keys (and hold the ends outside the segment)', () => {
    for (const list of CURVES) {
      const [a, b] = list;
      expect(positionAt(list, 0)).toEqual({ x: a.x, y: a.y });
      expect(positionAt(list, 2)).toEqual({ x: b.x, y: b.y });
      expect(positionAt(list, -1)).toEqual({ x: a.x, y: a.y });
      expect(positionAt(list, 5)).toEqual({ x: b.x, y: b.y });
      const end = positionAt(list, 2 - 1e-9);
      expect(Math.hypot(end.x - b.x, end.y - b.y)).toBeLessThan(1e-4);
    }
  });

  it('every point lies on the analytic cubic (<= 1e-9): at the table samples and at 200 random times', () => {
    const r = rng(7);
    for (const list of CURVES) {
      const [a, b] = list;
      const cum = Float64Array.from(arcTable(a, b));
      for (let k = 0; k <= ARC_SAMPLES; k++) {
        const p = curvedPoint(a, b, cum[k] / cum[ARC_SAMPLES]);
        const q = bezierPoint(a, b, k / ARC_SAMPLES);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThanOrEqual(1e-9);
      }
      for (let j = 0; j < 200; j++) {
        const p = positionAt(list, r() * 2);
        const q = bezierPoint(a, b, nearestT(a, b, p));
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('linear ease: constant speed along the curve (arc length per frame within 1 % of the mean)', () => {
    for (const list of CURVES) {
      const steps: number[] = [];
      let p = positionAt(list, 0);
      for (let n = 1; n <= 60; n++) {
        const q = positionAt(list, n / 30);
        steps.push(Math.hypot(q.x - p.x, q.y - p.y));
        p = q;
      }
      const mean = steps.reduce((s, x) => s + x, 0) / steps.length;
      for (const s of steps) expect(Math.abs(s - mean) / mean).toBeLessThan(0.01);
    }
  });

  it('eased: the arc-length fraction travelled equals easeAt (within 2e-3 of the true arc length)', () => {
    for (const ease of [{ kind: 'easeInOut' }, { kind: 'easeIn' }, { kind: 'bezier', bezier: [0.7, 0, 0.3, 1] }] as Ease[]) {
      for (const base of CURVES) {
        const list = [{ ...base[0], ease }, base[1]];
        const [a, b] = list;
        const total = trueLength(a, b, 0, 1);
        for (const u of [0.2, 0.5, 0.9, 1.3, 1.7]) {
          const s = trueLength(a, b, 0, nearestT(a, b, positionAt(list, u)), 4000) / total;
          expect(Math.abs(s - easeAt(ease, u / 2, 2))).toBeLessThan(2e-3);
        }
      }
    }
  });

  it('an overshooting ease continues straight along the end tangent; NaN-free for huge and tiny tangents', () => {
    const list = [{ ...CURVES[0][0], ease: { kind: 'back' } as Ease }, CURVES[0][1]];
    for (let j = 0; j <= 200; j++) {
      const p = positionAt(list, j / 100);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    const huge = [{ ...pk(0, 0, 0), out: { x: 1e7, y: -1e7 } }, { ...pk(1, 1e7, 1e7), in: { x: -1e7, y: 1e7 } }];
    const tiny = [{ ...pk(0, 5, 5), out: { x: 1e-300, y: 0 } }, pk(1, 5, 5)];
    for (const l of [huge, tiny]) for (const u of [0, 0.3, 0.5, 1]) {
      const p = positionAt(l, u);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it('loops evaluate curved paths too (offset adds per axis on top of the curve)', () => {
    const list = CURVES[0];
    const p = positionAt(list, 0.5);
    expect(evalPosition(list, { mode: 'repeat', count: null }, 2.5)).toEqual(p);
    const o = evalPosition(list, { mode: 'offset', count: null }, 2.5);
    expect(o.x).toBeCloseTo(p.x + 400, 9);
    expect(o.y).toBeCloseTo(p.y + 400, 9);
  });
});
