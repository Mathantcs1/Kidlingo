// Plan 5B Task 4 (D7): the path heading (atan2 of the direction of travel, y down = clockwise) with its fallbacks
// (holds, pauses, zero-length tangents never jump to 0), loops, and orient along path in the resolver and the
// rotation writes (the heading stays derived).
import { describe, expect, it } from 'vitest';
import { resolvedTransform } from '../src/core/animate';
import type { Ease } from '../src/core/easing';
import type { PositionKeyframe } from '../src/core/model';
import { bezierPoint } from '../src/core/pathCurve';
import { orientHeading, pathHeading } from '../src/core/spatialPath';
import { localTime } from '../src/core/keyframes';
import { setTransformAt, withLiveValue } from '../src/core/transformKeyEdits';
import { clipOf, k, mk, pk, project } from './keyframe-fixtures';

const DEG = 180 / Math.PI;
const hold: Ease = { kind: 'hold' };

describe('pathHeading', () => {
  it('a straight segment heads along its chord at every time, whatever the ease (also before/after the keys)', () => {
    const list = [pk(0, 0, 0, { kind: 'easeInOut' }), pk(2, 300, 400)];
    const want = Math.atan2(400, 300) * DEG;
    for (const u of [-1, 0, 0.3, 1, 1.99, 2, 5]) expect(pathHeading(list, undefined, u)).toBeCloseTo(want, 12);
    expect(pathHeading([pk(0, 0, 0), pk(1, -10, 0)], undefined, 0.5)).toBeCloseTo(180, 12);
    expect(pathHeading([pk(0, 0, 0), pk(1, 0, -10)], undefined, 0.5)).toBeCloseTo(-90, 12);
    expect(pathHeading([pk(0, 0, 0), pk(1, 10, 0)], undefined, 0.5)).toBe(0);
  });

  it('a curve heads along its derivative', () => {
    const list: PositionKeyframe[] = [{ ...pk(0, 0, 0), out: { x: 300, y: 0 } }, { ...pk(2, 400, 400), in: { x: 0, y: -300 } }];
    expect(pathHeading(list, undefined, 0)).toBeCloseTo(0, 9); // leaves along out = (300, 0)
    expect(pathHeading(list, undefined, 2)).toBeCloseTo(90, 9); // arrives along −in = (0, 300)
    const mid = pathHeading(list, undefined, 1);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(80);
  });

  it('holds, pauses and stationary segments keep the previous heading (never a jump to 0)', () => {
    // Down to (0, 100), pause there, then a HOLD segment to (300, 100), then moving right.
    const list = [pk(0, 0, 0), pk(1, 0, 100), pk(2, 0, 100, hold), pk(3, 300, 100), pk(4, 600, 100)];
    expect(pathHeading(list, undefined, 0.5)).toBeCloseTo(90, 12);
    expect(pathHeading(list, undefined, 1.5)).toBeCloseTo(90, 12); // pause (zero-length segment)
    expect(pathHeading(list, undefined, 2.5)).toBeCloseTo(90, 12); // hold: not moving, keeps arriving direction
    expect(pathHeading(list, undefined, 3.5)).toBe(0); // then moving right
    // A path that starts with a pause takes the first moving segment's heading.
    const late = [pk(0, 5, 5), pk(1, 5, 5), pk(2, 5, 205)];
    expect(pathHeading(late, undefined, 0.5)).toBeCloseTo(90, 12);
    expect(pathHeading(late, undefined, -3)).toBeCloseTo(90, 12);
    // Nothing moves at all: 0 (constant, so no jump either).
    expect(pathHeading([pk(0, 5, 5), pk(1, 5, 5)], undefined, 0.5)).toBe(0);
    expect(pathHeading([pk(0, 5, 5)], undefined, 0.5)).toBe(0);
    expect(pathHeading([], undefined, 0.5)).toBe(0);
  });

  it('a zero-length tangent at an end or a cusp uses the direction between nearby points (finite, not 0)', () => {
    // No out tangent at the start: the curve leaves towards b + b.in = (0, 300).
    const list: PositionKeyframe[] = [pk(0, 0, 0), { ...pk(1, 300, 300), in: { x: -300, y: 0 } }];
    const h0 = pathHeading(list, undefined, 0);
    expect(Math.abs(h0 - 90)).toBeLessThan(3);
    // A cusp at t = 0.5 (B'(0.5) = 0): finite and pointing the way the curve leaves the cusp.
    const cusp: PositionKeyframe[] = [{ ...pk(0, 0, 0), out: { x: 0, y: 100 } }, { ...pk(1, 0, 100), in: { x: -100, y: -100 } }];
    for (const u of [0.45, 0.5, 0.55]) expect(Number.isFinite(pathHeading(cusp, undefined, u))).toBe(true);
    const p = bezierPoint(cusp[0], cusp[1], 0.6);
    const q = bezierPoint(cusp[0], cusp[1], 0.4);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(0);
  });

  it('loops read the mapped time; a ping-pong cycle played backwards faces the other way', () => {
    const list = [pk(0, 0, 0), pk(1, 100, 0)];
    expect(pathHeading(list, { mode: 'repeat', count: null }, 1.5)).toBe(0);
    expect(pathHeading(list, { mode: 'pingPong', count: null }, 1.5)).toBe(180);
    expect(pathHeading(list, { mode: 'pingPong', count: null }, 2.5)).toBe(0);
    expect(pathHeading(list, { mode: 'offset', count: null }, 2.5)).toBe(0);
  });
});

describe('orient along path in the resolver (D7)', () => {
  const path = [pk(2, 0, 0), pk(4, 0, 300)]; // video 'c' shows local 2..6 at 10..14 s: heading 90 (down)
  it('adds the heading to the static rotation, and to the keyed rotation', () => {
    const c = mk('c', { transform: { x: 0, y: 0, scale: 1, rotation: 10, opacity: 1 }, keys: { position: path, orient: true } });
    expect(resolvedTransform(c, 11, 30).rotation).toBeCloseTo(100, 12);
    const keyed = mk('c', { keys: { position: path, rotation: [k(2, 0), k(4, 40)], orient: true } });
    expect(resolvedTransform(keyed, 11, 30).rotation).toBeCloseTo(110, 9);
    // Off: exactly the 5A value (no heading).
    const off = mk('c', { keys: { position: path, rotation: [k(2, 0), k(4, 40)] } });
    expect(resolvedTransform(off, 11, 30).rotation).toBeCloseTo(20, 9);
  });
  it('orientHeading is 0 without orient or with fewer than two position keys', () => {
    expect(orientHeading({ position: path }, 3)).toBe(0);
    expect(orientHeading({ position: [pk(2, 0, 0)], orient: true }, 3)).toBe(0);
    expect(orientHeading(undefined, 3)).toBe(0);
    expect(orientHeading({ position: path, orient: true }, 3)).toBeCloseTo(90, 12);
  });
  it('a typed/dragged rotation stores value − heading (static and keyed); retyping the shown value is a no-op', () => {
    const p = project({ keys: { position: path, orient: true } });
    const shown = resolvedTransform(clipOf(p, 'c'), 11, 30).rotation;
    expect(setTransformAt(p, 'c', { rotation: shown }, 11)).toBe(p);
    const q = setTransformAt(p, 'c', { rotation: 120 }, 11);
    expect(clipOf(q, 'c').transform.rotation).toBeCloseTo(30, 9);
    expect(resolvedTransform(clipOf(q, 'c'), 11, 30).rotation).toBeCloseTo(120, 9);
    // Rounding: (s + h) − h is not always s (here 10.893399999999929 + 53.15… − 53.15… differs in the last bit);
    // retyping the shown value of a keyed rotation must still be a no-op.
    const slanted = [pk(2, 0, 0), pk(4, 300, 400.3)];
    for (const rot of [10.893399999999929, 11.07269999999994, -33.7, 0.3]) {
      const q2 = project({ keys: { position: slanted, rotation: [k(3, rot)], orient: true } });
      expect(setTransformAt(q2, 'c', { rotation: resolvedTransform(clipOf(q2, 'c'), 11, 30).rotation }, 11), `${rot}`).toBe(q2);
    }
    const pk2 = project({ keys: { position: path, rotation: [k(2, 0)], orient: true } });
    const r = setTransformAt(pk2, 'c', { rotation: 150 }, 11);
    expect(resolvedTransform(clipOf(r, 'c'), 11, 30).rotation).toBeCloseTo(150, 9);
    expect(clipOf(withLiveValue(pk2, 'c', { rotation: 150 }, 11), 'c').keys?.rotation).toEqual(clipOf(r, 'c').keys?.rotation);
  });
  it('on a CURVED path the write-back subtracts the heading at the snapped playhead time (static, keyed, live)', () => {
    // The heading turns from 0 to 90 along this curve, so a heading read at any other time fails.
    const curve: PositionKeyframe[] = [{ ...pk(2, 0, 0), out: { x: 300, y: 0 } }, { ...pk(4, 400, 400), in: { x: 0, y: -300 } }];
    for (const t of [10.61, 11.37, 11.83]) {
      const u = localTime(clipOf(project(), 'c'), t, 30); // the frame start (floor)
      const h = pathHeading(curve, undefined, u);
      expect(Math.abs(h - pathHeading(curve, undefined, t - 8))).toBeGreaterThan(1e-6); // snapped ≠ raw time here
      const st = setTransformAt(project({ keys: { position: curve, orient: true } }), 'c', { rotation: 120 }, t);
      expect(clipOf(st, 'c').transform.rotation).toBeCloseTo(120 - h, 9);
      expect(resolvedTransform(clipOf(st, 'c'), t, 30).rotation).toBeCloseTo(120, 9);
      const keyed = project({ keys: { position: curve, rotation: [k(2, 5), k(6, 25)], orient: true } });
      const kq = setTransformAt(keyed, 'c', { rotation: -70 }, t);
      expect(resolvedTransform(clipOf(kq, 'c'), t, 30).rotation).toBeCloseTo(-70, 9);
      expect(clipOf(kq, 'c').keys!.rotation!.find((x) => Math.abs(x.t - u) < 1e-9)!.v).toBeCloseTo(-70 - h, 9);
      expect(clipOf(withLiveValue(keyed, 'c', { rotation: -70 }, t), 'c').keys?.rotation).toEqual(clipOf(kq, 'c').keys?.rotation);
      expect(clipOf(withLiveValue(project({ keys: { position: curve, orient: true } }), 'c', { rotation: 120 }, t), 'c').transform.rotation)
        .toBeCloseTo(120 - h, 9);
    }
  });
});
