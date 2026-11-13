// Position along a (possibly curved) motion path with its loop, and the path heading for orient along path (data v7,
// Plan 5B D6/D7). The ONE position evaluator behind the resolver, the inspector and the drag routing. Pure.
import { easeAt } from './easing';
import { loopedTime } from './keyLoops';
import { positionAt, segmentIndex } from './keyframes';
import type { KeyLoop, PositionKeyframe, TransformKeys, Vec } from './model';
import { ARC_SAMPLES, arcParam, bezierPoint, bezierTangent, isCurved, unit } from './pathCurve';

/**
 * The position at local time `u` with its optional loop (D4: 'offset' adds cycle × (last − first) per axis); curved
 * segments through positionAt (D6). Without a loop this is exactly `positionAt(list, u)`. Unclamped.
 */
export function evalPosition(list: readonly PositionKeyframe[], loop: KeyLoop | undefined, u: number): Vec {
  if (!loop || list.length < 2) return positionAt(list, u);
  const m = loopedTime(list, loop, u);
  const p = positionAt(list, m.u);
  if (loop.mode !== 'offset' || m.cycle === 0) return p;
  const a = list[0];
  const b = list[list.length - 1];
  return { x: p.x + m.cycle * (b.x - a.x), y: p.y + m.cycle * (b.y - a.y) };
}

const DEG = 180 / Math.PI;

/** Whether segment i → i+1 gives no direction of travel: a hold, or all four control points on one spot. */
function stationary(list: readonly PositionKeyframe[], i: number): boolean {
  const a = list[i];
  const b = list[i + 1];
  if (a.ease.kind === 'hold') return true;
  return a.x === b.x && a.y === b.y && !isCurved(a, b);
}

/** The direction of travel on segment i at Bezier parameter `t` (the chord on a straight segment); null when none. */
function direction(list: readonly PositionKeyframe[], i: number, t: number): Vec | null {
  const a = list[i];
  const b = list[i + 1];
  const chord = { x: b.x - a.x, y: b.y - a.y };
  if (!isCurved(a, b)) return unit(chord);
  // A cusp or a zero-length tangent at an end has no derivative: the direction between two nearby points instead.
  const h = 1 / ARC_SAMPLES;
  const p = bezierPoint(a, b, Math.max(0, t - h));
  const q = bezierPoint(a, b, Math.min(1, t + h));
  return unit(bezierTangent(a, b, t), { x: q.x - p.x, y: q.y - p.y }) ?? unit(chord);
}

/** The heading of segment i at its start (`atEnd` false) or end, or null when it gives none. */
const endDirection = (list: readonly PositionKeyframe[], i: number, atEnd: boolean): Vec | null =>
  stationary(list, i) ? null : direction(list, i, atEnd ? 1 : 0);

/**
 * The path heading in degrees (D7) at local time `u`: `atan2(dy, dx)` of the direction of travel (y down, so
 * clockwise like Transform.rotation; 0 = moving right). Before the first key the start of the first segment, after
 * the last key the end of the last. Where the path gives no direction (a hold, a zero-length segment, a cusp with no
 * neighbouring direction) the heading of the nearest PREVIOUS moving segment is kept (its end), else the next one's
 * start, else 0 - never a jump to 0 in the middle of a path. Loops read the mapped time; a ping-pong cycle played
 * backwards faces the other way (+180). 0 with fewer than two keys.
 */
export function pathHeading(list: readonly PositionKeyframe[], loop: KeyLoop | undefined, u: number): number {
  const n = list.length;
  if (n < 2) return 0;
  const m = loopedTime(list, loop, u);
  const v = m.u;
  let i: number;
  let t: number;
  if (!(v > list[0].t)) {
    i = 0;
    t = 0;
  } else if (v >= list[n - 1].t) {
    i = n - 2;
    t = 1;
  } else {
    i = segmentIndex(list, v);
    const a = list[i];
    const b = list[i + 1];
    t = isCurved(a, b) ? arcParam(a, b, easeAt(a.ease, (v - a.t) / (b.t - a.t), b.t - a.t)) : 0;
  }
  let d = stationary(list, i) ? null : direction(list, i, t);
  for (let j = i - 1; d === null && j >= 0; j--) d = endDirection(list, j, true);
  for (let j = i + 1; d === null && j < n - 1; j++) d = endDirection(list, j, false);
  if (d === null) return 0;
  const deg = Math.atan2(d.y, d.x) * DEG;
  return m.reverse ? deg + 180 : deg;
}

/** The heading orient along path adds to the rotation at local time `u` (D7): 0 unless `orient` is on with ≥ 2 position keys. */
export function orientHeading(keys: TransformKeys | undefined, u: number): number {
  if (!keys?.orient || (keys.position?.length ?? 0) < 2) return 0;
  return pathHeading(keys.position!, keys.loops?.position, u);
}
