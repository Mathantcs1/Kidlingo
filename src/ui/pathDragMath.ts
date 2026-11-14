// DOM-free maths of on-canvas motion path editing (Plan 5B Task 8, D6): the drag threshold, a dragged key dot, the
// tangent handles shown for a key (stored, or Smooth path's defaults when absent), the tangent patch of a handle drag
// (a smooth key mirrors the other handle's DIRECTION keeping its length, and BOTH are passed so the key never becomes a
// one-sided visual corner; Alt breaks it) and the double-click corner/smooth toggle. All in FORMAT px.
import type { PositionKeyframe, Vec } from '../core/model';
import { smoothKey } from '../core/pathEdits';
import type { TangentPatch } from '../core/pathEdits';
import { unit } from '../core/pathCurve';
import { pastThreshold } from './drag';

export type TangentSide = 'in' | 'out';
/** A handle as drawn: its tangent (relative to the key) and whether the key really stores it (`empty`: a default). */
export interface ShownTangent { v: Vec; empty: boolean }

/** Whether a press at `down` that is now at `now` (CSS px) has become a drag (the 4 px timeline/canvas threshold). */
export const pathDragStarted = (down: Vec, now: Vec): boolean => pastThreshold(now.x - down.x, now.y - down.y);

/** The key position after a dot drag: where it was plus the pointer's travel (format px), so it never jumps to the pointer. */
export const draggedKeyXY = (start: Vec, from: Vec, to: Vec): Vec => ({ x: start.x + (to.x - from.x), y: start.y + (to.y - from.y) });

/** The tangent after a handle drag: the grabbed tangent plus the pointer's travel (format px). */
export const draggedTangent = (start: Vec, from: Vec, to: Vec): Vec => draggedKeyXY(start, from, to);

const other = (s: TangentSide): TangentSide => (s === 'in' ? 'out' : 'in');
const hasSide = (list: readonly PositionKeyframe[], i: number, s: TangentSide): boolean => (s === 'in' ? i > 0 : i < list.length - 1);

/** The default of side `s` when the key stores none: Smooth path's tangent, else a third of the chord to that neighbour. */
function fallback(list: readonly PositionKeyframe[], i: number, s: TangentSide): Vec | undefined {
  const sk = smoothKey(list, i)[s];
  if (sk) return sk;
  const nb = list[s === 'in' ? i - 1 : i + 1];
  const v = { x: (nb.x - list[i].x) / 3, y: (nb.y - list[i].y) / 3 };
  return v.x === 0 && v.y === 0 ? undefined : v;
}

/** The handles of key `i`: only for sides that have a neighbour (a segment); a stored tangent, else the default. */
export function shownTangents(list: readonly PositionKeyframe[], i: number): Partial<Record<TangentSide, ShownTangent>> {
  const out: Partial<Record<TangentSide, ShownTangent>> = {};
  for (const s of ['in', 'out'] as const) {
    if (!hasSide(list, i, s)) continue;
    const stored = list[i][s];
    const v = stored ?? fallback(list, i, s);
    if (v) out[s] = { v, empty: !stored };
  }
  return out;
}

/**
 * The tangent patch for dragging side `s` of key `i` to `v` (D6). Alt, or a key already broken: that handle alone (Alt
 * also sets `broken`). A smooth key: the other handle (when that side has a segment) points the opposite way and keeps
 * its length (its default length when absent), both passed. A handle dropped on its key removes that tangent.
 */
export function tangentDragPatch(list: readonly PositionKeyframe[], i: number, s: TangentSide, v: Vec, alt: boolean): TangentPatch {
  const k = list[i];
  const d = unit(v);
  if (!d) return { [s]: null };
  if (k.broken || alt) return alt && !k.broken ? { [s]: v, broken: true } : { [s]: v };
  const o = other(s);
  if (!hasSide(list, i, o)) return { [s]: v };
  const cur = k[o] ?? fallback(list, i, o);
  if (!cur) return { [s]: v };
  const l = Math.hypot(cur.x, cur.y);
  return { [s]: v, [o]: { x: -d.x * l + 0, y: -d.y * l + 0 } };
}

/** A key draws a corner when it is broken or a side with a segment has no tangent (a smooth key needs both). */
export function isCorner(list: readonly PositionKeyframe[], i: number): boolean {
  if (list.length < 2) return false;
  const k = list[i];
  return k.broken === true || (hasSide(list, i, 'in') && !k.in) || (hasSide(list, i, 'out') && !k.out);
}

/**
 * Double-click on a key dot: a corner becomes smooth (a broken key re-aligns its own tangents; otherwise Smooth path's
 * tangents for this key), a smooth key becomes a corner (tangents removed: straight segments meet at the key).
 */
export function cornerTogglePatch(list: readonly PositionKeyframe[], i: number): TangentPatch {
  const k = list[i];
  if (!isCorner(list, i)) return { in: null, out: null, broken: false };
  const full = (['in', 'out'] as const).every((s) => !hasSide(list, i, s) || k[s]);
  if (k.broken && full) return { broken: false };
  const sk = smoothKey(list, i);
  return { in: sk.in ?? null, out: sk.out ?? null, broken: false };
}
