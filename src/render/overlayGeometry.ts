// Pure geometry for on-canvas transform editing (no DOM). Everything — points, tolerances, offsets, thresholds —
// is in FORMAT pixels with the origin at the canvas top-left and y pointing down (the overlay must convert CSS
// pixels to format pixels with the displayed canvas box, both ways); `Transform.x/y` stay offsets from the canvas centre, as in `clipMatrix`,
// whose quad `clipCorners` reproduces exactly (see tests/overlay-geometry.test.ts).
import type { Transform } from '../core/model';
import { scaleBounds } from '../core/scale';
import { normaliseDegrees } from '../core/transformLimits';
import type { Size } from './geometry';

export type Point = { x: number; y: number };
/** TL, TR, BR, BL of the clip's (source) quad after scale, clockwise rotation about its centre and translation. */
export type Corners = [Point, Point, Point, Point];
export type Handle = 'move' | 'scale-tl' | 'scale-tr' | 'scale-br' | 'scale-bl' | 'rotate';

export { MAX_SCALE, MIN_SCALE, scaleBounds } from '../core/scale';
export { normaliseDegrees } from '../core/transformLimits';
/**
 * Distance of the rotate handle beyond the top edge when the caller gives none, in FORMAT pixels (not CSS px: the
 * overlay should pass its own CSS offset converted to format px).
 */
export const ROTATE_HANDLE_OFFSET = 24;

const CORNER_HANDLES: Handle[] = ['scale-tl', 'scale-tr', 'scale-br', 'scale-bl'];
const fin = (...v: number[]): boolean => v.every(Number.isFinite);
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);


/** The clip centre: (format.width/2 + t.x, format.height/2 + t.y); the canvas centre for a non-finite offset. */
export function clipCentre(t: Transform, format: Size): Point {
  const cx = fin(format.width) ? format.width / 2 : 0;
  const cy = fin(format.height) ? format.height / 2 : 0;
  return fin(t.x, t.y) ? { x: cx + t.x, y: cy + t.y } : { x: cx, y: cy };
}

/** `size` is the clip's displayed source size (rotated size for rotated video), as the compositor uses it. */
export function clipCorners(size: Size, t: Transform, format: Size): Corners {
  const c = clipCentre(t, format);
  if (!fin(size.width, size.height, t.scale, t.rotation, t.x, t.y)) return [c, { ...c }, { ...c }, { ...c }];
  const hw = (size.width * t.scale) / 2;
  const hh = (size.height * t.scale) / 2;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Clockwise on screen with y down: (a, b) → (a·cos − b·sin, a·sin + b·cos), the same as clipMatrix.
  const at = (a: number, b: number): Point => ({ x: c.x + a * cos - b * sin, y: c.y + a * sin + b * cos });
  return [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
}

/** Unit vector pointing "up" out of the clip (rotates with it); straight up when the quad has no extent. */
function outwardNormal(corners: Corners): Point {
  const [tl, tr, , bl] = corners;
  const ex = tr.x - tl.x;
  const ey = tr.y - tl.y;
  const len = Math.hypot(ex, ey);
  // Rotating the TL→TR direction a quarter turn counter-clockwise on screen gives the outward normal of the top.
  if (len > 1e-12) return { x: ey / len, y: -ex / len };
  const ux = tl.x - bl.x;
  const uy = tl.y - bl.y;
  const up = Math.hypot(ux, uy);
  return up > 1e-12 ? { x: ux / up, y: uy / up } : { x: 0, y: -1 };
}

/** A point `offsetPx` (format px) beyond the middle of the top edge (TL→TR), along its outward normal. */
export function rotateHandlePoint(corners: Corners, offsetPx: number): Point {
  const [tl, tr] = corners;
  const n = outwardNormal(corners);
  const off = Number.isFinite(offsetPx) ? offsetPx : 0;
  return { x: (tl.x + tr.x) / 2 + n.x * off, y: (tl.y + tr.y) / 2 + n.y * off };
}

/**
 * True when `p` is inside the convex quad (either winding) or exactly on its boundary (within 1e-9 px); a
 * degenerate quad (no area) contains nothing.
 */
function insideQuad(q: Corners, p: Point): boolean {
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  if (Math.abs(area) < 1e-9) return false;
  const orient = Math.sign(area);
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-12) continue;
    // Signed distance of p from edge a→b, positive on the inner side.
    const d = (orient * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))) / len;
    if (d < -1e-9) return false;
  }
  return true;
}

/**
 * Which handle `p` grabs; `p`, `tolerancePx` and `rotateOffsetPx` are in FORMAT pixels. Priority: the rotate
 * handle (within the tolerance), then the nearest corner (within the tolerance), then the inside or boundary
 * ('move'), else null. On a quad whose shorter side is under 2× the tolerance, corners are only tested for a
 * pointer OUTSIDE the quad, so the inside of a tiny clip still moves it.
 */
export function hitTest(corners: Corners, p: Point, tolerancePx: number, rotateOffsetPx = ROTATE_HANDLE_OFFSET): Handle | null {
  if (!fin(p.x, p.y, tolerancePx) || !corners.every((c) => fin(c.x, c.y))) return null;
  if (dist(rotateHandlePoint(corners, rotateOffsetPx), p) <= tolerancePx) return 'rotate';
  const inside = insideQuad(corners, p);
  const shorterSide = Math.min(dist(corners[0], corners[1]), dist(corners[0], corners[3]));
  if (!inside || shorterSide >= 2 * tolerancePx) {
    let best = -1;
    let bestDist = Infinity;
    corners.forEach((c, i) => {
      const d = dist(c, p);
      if (d <= tolerancePx && d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best >= 0) return CORNER_HANDLES[best];
  }
  return inside ? 'move' : null;
}

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
 * Snaps the clip's centre to the canvas centre, else its axis-aligned bounding box edges to the canvas edges or
 * centre lines, within `thresholdPx`; x and y independently. Returns `t` itself when nothing moves.
 */
export function snapToCanvas(t: Transform, size: Size, format: Size, thresholdPx: number): Transform {
  if (!fin(t.x, t.y, t.scale, t.rotation, size.width, size.height, format.width, format.height, thresholdPx)) return t;
  const q = clipCorners(size, t, format);
  const c = clipCentre(t, format);
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
