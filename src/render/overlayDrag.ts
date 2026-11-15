// Pure drag maths of the on-canvas transform overlay (move, uniform scale about the pivot, rotate, snapping), split from
// overlayGeometry.ts (Plan 5E Task 6). Everything is in FORMAT pixels, like the geometry it uses.
import type { Transform } from '../core/model';
import { isCropped } from '../core/cropTypes';
import { scaleBounds } from '../core/scale';
import { normaliseDegrees } from '../core/transformLimits';
import type { ClipView, Size } from './geometry';
import { clipCentre, clipCorners } from './overlayGeometry';
import type { Handle, Point } from './overlayGeometry';

const CORNER_HANDLES: Handle[] = ['scale-tl', 'scale-tr', 'scale-br', 'scale-bl'];
const fin = (...v: number[]): boolean => v.every(Number.isFinite);
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Translates by (dx, dy) format px; the start itself for non-finite or zero deltas. */
export function dragMove(start: Transform, dx: number, dy: number): Transform {
  if (!fin(dx, dy, start.x, start.y) || (dx === 0 && dy === 0)) return start;
  return { ...start, x: start.x + dx, y: start.y + dy };
}

/**
 * Uniform scale about the CLIP CENTRE (Ruling D): scale × |pointer − centre| / |startPointer − centre|, clamped
 * to `scaleBounds(start.scale)` (0.02..20, widened to include the start scale). Only scale-* handles scale; anything else, or non-finite input, returns `start`. (`_size` is kept
 * for the planned signature: the ratio of distances does not depend on it.)
 */
export function dragScale(start: Transform, _size: Size, handle: Handle, startPointer: Point, pointer: Point, format: Size): Transform {
  if (!CORNER_HANDLES.includes(handle)) return start;
  if (!fin(start.scale, start.x, start.y, startPointer.x, startPointer.y, pointer.x, pointer.y, format.width, format.height)) {
    return start;
  }
  const c = clipCentre(start, format);
  const d0 = dist(startPointer, c);
  if (d0 < 1e-9) return start;
  const [lo, hi] = scaleBounds(start.scale);
  const scale = Math.min(hi, Math.max(lo, start.scale * (dist(pointer, c) / d0)));
  return scale === start.scale ? start : { ...start, scale };
}

/** Rotation follows the pointer's angle about `centre` (degrees clockwise, y down), optionally snapped. */
export function dragRotate(start: Transform, centre: Point, startPointer: Point, pointer: Point, snapDeg?: number): Transform {
  if (!fin(start.rotation, centre.x, centre.y, startPointer.x, startPointer.y, pointer.x, pointer.y)) return start;
  const a = { x: startPointer.x - centre.x, y: startPointer.y - centre.y };
  const b = { x: pointer.x - centre.x, y: pointer.y - centre.y };
  if (Math.hypot(a.x, a.y) < 1e-9 || Math.hypot(b.x, b.y) < 1e-9) return start;
  const delta = ((Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)) * 180) / Math.PI;
  let rotation = normaliseDegrees(start.rotation + delta);
  if (snapDeg !== undefined && Number.isFinite(snapDeg) && snapDeg > 0) {
    rotation = normaliseDegrees(Math.round(rotation / snapDeg) * snapDeg);
  }
  return rotation === start.rotation ? start : { ...start, rotation };
}

/** The smallest shift (≤ threshold) that puts one of `edges` on one of `targets`, or 0. */
function edgeShift(edges: number[], targets: number[], threshold: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (const e of edges) {
    for (const g of targets) {
      const d = g - e;
      if (Math.abs(d) <= threshold && Math.abs(d) < bestAbs) {
        best = d;
        bestAbs = Math.abs(d);
      }
    }
  }
  return best;
}

/**
 * Snaps the clip's centre (its visible quad's centre when a `view` is given) to the canvas centre, else its axis-aligned bounding box edges to the canvas edges or
 * centre lines, within `thresholdPx`; x and y independently. Returns `t` itself when nothing moves.
 */
export function snapToCanvas(t: Transform, size: Size, format: Size, thresholdPx: number, view?: ClipView): Transform {
  if (!fin(t.x, t.y, t.scale, t.rotation, size.width, size.height, format.width, format.height, thresholdPx)) return t;
  const q = clipCorners(size, t, format, view);
  // With a crop or a moved pivot the visible quad's centre is what lands on the canvas centre (no view: the pivot, as before).
  const moved = view !== undefined && (isCropped(view.crop) || (view.anchor !== undefined && (view.anchor.x !== 0 || view.anchor.y !== 0)));
  const c = moved ? { x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4 } : clipCentre(t, format);
  const axis = (centre: number, coords: number[], extent: number): number => {
    const mid = extent / 2;
    if (Math.abs(mid - centre) <= thresholdPx) return mid - centre;
    return edgeShift([Math.min(...coords), Math.max(...coords)], [0, mid, extent], thresholdPx);
  };
  const dx = axis(c.x, q.map((p) => p.x), format.width);
  const dy = axis(c.y, q.map((p) => p.y), format.height);
  if (dx === 0 && dy === 0) return t;
  return { ...t, x: t.x + dx, y: t.y + dy };
}
