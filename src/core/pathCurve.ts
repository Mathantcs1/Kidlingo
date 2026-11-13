// Spatial Bezier segments of a position path (data v7, Plan 5B D6): the cubic a, a + a.out, b + b.in, b, travelled at
// EVEN speed: the eased fraction is a fraction of the ARC LENGTH (a fixed 32-step table), not the Bezier parameter.
// Pure, deterministic, closed form; imported by keyframes.ts (positionAt), so it imports only types.
import type { PositionKeyframe, Vec } from './keyTypes';

/** Chords of the arc-length table (D6: a fixed table, so every evaluation is deterministic). */
export const ARC_SAMPLES = 32;

type End = Pick<PositionKeyframe, 'x' | 'y' | 'in' | 'out'>;

const nonZero = (v: Vec | undefined): boolean => v !== undefined && (v.x !== 0 || v.y !== 0);

/** Whether segment a → b is curved: a non-zero `a.out` or `b.in`. Otherwise it is the straight 5A line. */
export const isCurved = (a: End, b: End): boolean => nonZero(a.out) || nonZero(b.in);

/** The point at Bezier parameter `t` (exactly `a` at 0 and `b` at 1). */
export function bezierPoint(a: End, b: End, t: number): Vec {
  if (t === 0) return { x: a.x, y: a.y };
  if (t === 1) return { x: b.x, y: b.y };
  const s = 1 - t;
  const w0 = s * s * s;
  const w1 = 3 * s * s * t;
  const w2 = 3 * s * t * t;
  const w3 = t * t * t;
  const x1 = a.x + (a.out?.x ?? 0);
  const y1 = a.y + (a.out?.y ?? 0);
  const x2 = b.x + (b.in?.x ?? 0);
  const y2 = b.y + (b.in?.y ?? 0);
  return { x: w0 * a.x + w1 * x1 + w2 * x2 + w3 * b.x, y: w0 * a.y + w1 * y1 + w2 * y2 + w3 * b.y };
}

/** The derivative dB/dt at `t` (its direction is the path's heading there). */
export function bezierTangent(a: End, b: End, t: number): Vec {
  const s = 1 - t;
  const x1 = a.x + (a.out?.x ?? 0);
  const y1 = a.y + (a.out?.y ?? 0);
  const x2 = b.x + (b.in?.x ?? 0);
  const y2 = b.y + (b.in?.y ?? 0);
  return {
    x: 3 * s * s * (x1 - a.x) + 6 * s * t * (x2 - x1) + 3 * t * t * (b.x - x2),
    y: 3 * s * s * (y1 - a.y) + 6 * s * t * (y2 - y1) + 3 * t * t * (b.y - y2),
  };
}

const SCRATCH = new Float64Array(ARC_SAMPLES + 1);

// 3-point Gauss-Legendre nodes and weights on [0, 1].
const GX = [0.5 - Math.sqrt(0.15), 0.5, 0.5 + Math.sqrt(0.15)];
const GW = [5 / 18, 8 / 18, 5 / 18];

/** |dB/dt| at `t`, allocation-free (the arc-length integrand). */
function speedAt(a: End, b: End, t: number): number {
  const s = 1 - t;
  const ax = a.out?.x ?? 0;
  const ay = a.out?.y ?? 0;
  const cx = b.x + (b.in?.x ?? 0) - a.x - ax;
  const cy = b.y + (b.in?.y ?? 0) - a.y - ay;
  const ex = -(b.in?.x ?? 0);
  const ey = -(b.in?.y ?? 0);
  // dB/dt = 3(1−t)²·(P1 − P0) + 6(1−t)t·(P2 − P1) + 3t²·(P3 − P2).
  const dx = 3 * s * s * ax + 6 * s * t * cx + 3 * t * t * ex;
  const dy = 3 * s * s * ay + 6 * s * t * cy + 3 * t * t * ey;
  return Math.sqrt(dx * dx + dy * dy); // coordinates are bounded by ±1e7 (no overflow; hypot is several times slower)
}

/** The arc length of the cubic between parameters t0 and t1 (3-point Gauss-Legendre). */
function arcBetween(a: End, b: End, t0: number, t1: number): number {
  return (GW[0] * speedAt(a, b, t0 + (t1 - t0) * GX[0]) + GW[1] * speedAt(a, b, t0 + (t1 - t0) * GX[1])
    + GW[2] * speedAt(a, b, t0 + (t1 - t0) * GX[2])) * (t1 - t0);
}

/**
 * The cumulative arc lengths at t = k / 32 (k = 0..32), written into `out` (a shared scratch buffer by default, so
 * evaluation allocates nothing; copy it to keep it). `out[32]` is the segment's length.
 */
export function arcTable(a: End, b: End, out: Float64Array = SCRATCH): Float64Array {
  out[0] = 0;
  for (let k = 1; k <= ARC_SAMPLES; k++) out[k] = out[k - 1] + arcBetween(a, b, (k - 1) / ARC_SAMPLES, k / ARC_SAMPLES);
  return out;
}

/**
 * The Bezier parameter at arc-length fraction `f` (0..1) of a segment with table `cum`: the table step holding it, a
 * linear first guess inside the step, then three Newton steps on the arc length (fixed count: deterministic).
 */
function paramAt(a: End, b: End, cum: Float64Array, f: number): number {
  const s = f * cum[ARC_SAMPLES];
  let lo = 0;
  let hi = ARC_SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const d = cum[hi] - cum[lo];
  const t0 = lo / ARC_SAMPLES;
  const t1 = hi / ARC_SAMPLES;
  let t = t0 + (d > 0 ? Math.min(1, Math.max(0, (s - cum[lo]) / d)) : 0) * (t1 - t0);
  for (let it = 0; it < 3; it++) {
    const speed = speedAt(a, b, t);
    if (!(speed > 0)) break;
    const next = t - (cum[lo] + arcBetween(a, b, t0, t) - s) / speed;
    t = next < t0 ? t0 : next > t1 ? t1 : next;
  }
  return t;
}

/** The Bezier parameter at arc-length fraction `f`, clamped to 0..1; `f` itself for a segment without usable length. */
export function arcParam(a: End, b: End, f: number): number {
  const c = f <= 0 ? 0 : f >= 1 ? 1 : f;
  if (c === 0 || c === 1) return c;
  const cum = arcTable(a, b);
  const len = cum[ARC_SAMPLES];
  return len > 0 && Number.isFinite(len) ? paramAt(a, b, cum, c) : c;
}

/** The unit direction of `v`, or of `w` when `v` has no length; null when neither has. */
export function unit(v: Vec, w?: Vec): Vec | null {
  const n = Math.hypot(v.x, v.y);
  if (n > 0 && Number.isFinite(n)) return { x: v.x / n, y: v.y / n };
  return w ? unit(w) : null;
}

/**
 * The position on curved segment a → b at eased fraction `f` (D6): the point at arc-length fraction `f`, so a linear
 * ease moves at constant speed; exactly `a` at 0 and `b` at 1; an overshoot (f < 0 or > 1, `back`/`elastic`)
 * continues straight along the end tangent at the same speed. A segment without finite length falls back to the
 * straight formula.
 */
export function curvedPoint(a: End, b: End, f: number): Vec {
  if (f === 0) return { x: a.x, y: a.y };
  if (f === 1) return { x: b.x, y: b.y };
  const cum = arcTable(a, b);
  const len = cum[ARC_SAMPLES];
  const chord = { x: b.x - a.x, y: b.y - a.y };
  if (!(len > 0) || !Number.isFinite(len)) return { x: a.x + chord.x * f, y: a.y + chord.y * f };
  if (f > 0 && f < 1) return bezierPoint(a, b, paramAt(a, b, cum, f));
  const end = f < 0 ? a : b;
  const near = bezierPoint(a, b, f < 0 ? 1 / ARC_SAMPLES : 1 - 1 / ARC_SAMPLES);
  const step = f < 0 ? { x: near.x - a.x, y: near.y - a.y } : { x: b.x - near.x, y: b.y - near.y };
  const d = unit(bezierTangent(a, b, f < 0 ? 0 : 1), step) ?? unit(chord) ?? { x: 0, y: 0 };
  const over = (f < 0 ? f : f - 1) * len;
  return { x: end.x + d.x * over, y: end.y + d.y * over };
}
