// The speed ramp maths (Plan 5D D4). The ramp is a keyframed speed curve s(u) over FOOTAGE time u (5A eases, clamped to
// MIN_SPEED..MAX_SPEED so an overshooting ease cannot reach 0). The timeline time footage needs is the integral of
// r(u) = 1 / s(u). DEFINITION (not an approximation of something else, so preview and export agree by construction): r is
// sampled at the ends of FIXED cells, 64 per key segment, anchored on the KEY times (never on a clip's in/out, so a split
// or a trim cannot move them), and is linear inside a cell; before the first and after the last key s is constant. The
// integral T(u) is then a closed-form quadratic per cell and strictly increasing (r >= 1/MAX_SPEED > 0), so it has an
// exact closed-form inverse. T is absolute (T = 0 at the first key); a clip over footage [in, out] lasts T(out) - T(in).
import type { Keyframe } from './keyTypes';
import { valueAt } from './keyframes';
import { MAX_SPEED, MIN_SPEED } from './speedTypes';

/** Cells per key segment. */
export const CELLS_PER_SEGMENT = 64;
/** The right end of a cell is sampled this fraction of the cell short of the boundary, so a hold ease keeps its step. */
const LEFT_LIMIT = 1e-9;

export interface RampTable {
  /** Cell boundaries b[0..N] (b[0] = the first key time, b[N] = the last). */
  b: Float64Array;
  /** r at the start / end of each cell (N entries). */
  rl: Float64Array;
  rr: Float64Array;
  /** T at each boundary (N + 1 entries, cum[0] = 0). */
  cum: Float64Array;
  /** r before the first and after the last key. */
  rFirst: number;
  rLast: number;
}

const tables = new WeakMap<readonly Keyframe[], RampTable>();

/** The speed at footage time `u`, clamped to MIN_SPEED..MAX_SPEED. */
export function speedAt(keys: readonly Keyframe[], u: number): number {
  return valueAt(keys, u, MIN_SPEED, MAX_SPEED);
}

/** The table of `keys` (sorted, >= 1 key), memoised per array (an edit makes a new array, like the motion path cache). */
export function rampTable(keys: readonly Keyframe[]): RampTable {
  const hit = tables.get(keys);
  if (hit) return hit;
  const n = keys.length;
  const segs = Math.max(0, n - 1);
  const cells = segs * CELLS_PER_SEGMENT;
  const b = new Float64Array(cells + 1);
  const rl = new Float64Array(cells);
  const rr = new Float64Array(cells);
  const cum = new Float64Array(cells + 1);
  b[0] = keys[0].t;
  for (let i = 0; i < segs; i++) {
    const a = keys[i].t;
    const z = keys[i + 1].t;
    for (let j = 0; j < CELLS_PER_SEGMENT; j++) {
      const c = i * CELLS_PER_SEGMENT + j;
      const ua = j === 0 ? a : a + ((z - a) * j) / CELLS_PER_SEGMENT;
      const ub = j === CELLS_PER_SEGMENT - 1 ? z : a + ((z - a) * (j + 1)) / CELLS_PER_SEGMENT;
      b[c] = ua;
      b[c + 1] = ub;
      const h = ub - ua;
      rl[c] = 1 / speedAt(keys, ua);
      rr[c] = 1 / speedAt(keys, ub - h * LEFT_LIMIT);
      cum[c + 1] = cum[c] + ((rl[c] + rr[c]) / 2) * h;
    }
  }
  const table: RampTable = { b, rl, rr, cum, rFirst: 1 / speedAt(keys, keys[0].t), rLast: 1 / speedAt(keys, keys[n - 1].t) };
  tables.set(keys, table);
  return table;
}

/** The index of the last boundary <= u in [0, N - 1] (binary search over the sorted boundaries). */
function cellOf(arr: Float64Array, v: number): number {
  let lo = 0;
  let hi = arr.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** T(u): the timeline seconds footage needs from the first key to footage time `u` (absolute; negative before the first key). */
export function rampOffset(keys: readonly Keyframe[], u: number): number {
  const t = rampTable(keys);
  const N = t.rl.length;
  if (N === 0 || u <= t.b[0]) return (u - t.b[0]) * t.rFirst;
  if (u >= t.b[N]) return t.cum[N] + (u - t.b[N]) * t.rLast;
  const c = cellOf(t.b, u);
  const h = t.b[c + 1] - t.b[c];
  const d = u - t.b[c];
  return t.cum[c] + t.rl[c] * d + ((t.rr[c] - t.rl[c]) * d * d) / (2 * h);
}

/** The inverse of T: the footage time whose offset is `y` (exact closed-form root inside a cell; linear outside the keys). */
export function rampInverse(keys: readonly Keyframe[], y: number): number {
  const t = rampTable(keys);
  const N = t.rl.length;
  if (N === 0 || y <= 0) return t.b[0] + y / t.rFirst;
  if (y >= t.cum[N]) return t.b[N] + (y - t.cum[N]) / t.rLast;
  const c = cellOf(t.cum, y);
  const h = t.b[c + 1] - t.b[c];
  const e = y - t.cum[c];
  const a = (t.rr[c] - t.rl[c]) / (2 * h);
  // Root of a d^2 + rl d - e = 0 in the stable form (rl > 0, so no cancellation); the cell's own width bounds it.
  const d = Math.abs(a * e) < 1e-18 ? e / t.rl[c] : (2 * e) / (t.rl[c] + Math.sqrt(t.rl[c] * t.rl[c] + 4 * a * e));
  return t.b[c] + Math.min(h, Math.max(0, d));
}

/** The speed at footage time `u` as the integral sees it, for edge extrapolation (same clamp as speedAt). */
export const edgeSpeed = speedAt;
