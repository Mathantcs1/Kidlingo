// Screen-side helpers of the transform overlay: on-screen sizes, the displayed canvas box, hit testing and the
// transform for a pointer position (all geometry itself lives in render/overlayGeometry.ts, in format px).
import type { Id, Transform } from '../core/model';
import type { Size } from '../render/geometry';
import { scaleBounds } from '../core/scale';
import {
  clipCentre, clipCorners, dragMove, dragRotate, dragScale, hitTest, normaliseDegrees, snapToCanvas,
} from '../render/overlayGeometry';
import type { Handle, Point } from '../render/overlayGeometry';
import { cssToFormat, toleranceInFormatPx } from './overlayMath';
import type { Box } from './overlayMath';

/** On-screen sizes, in CSS px (converted to format px for the geometry). */
export const HANDLE_PX = 10;
export const HIT_PX = 10;
export const ROTATE_PX = 28;
const SNAP_PX = 8;
const ROTATE_SNAP_DEG = 15;

/**
 * A clip being edited live: the overlay draws it at `transform`; the preview shows `patch` written at timeline time
 * `t` (withLiveValue: exactly what the release commits) until the drag ends.
 */
export interface LiveTransform {
  clipId: Id;
  transform: Transform;
  patch: Partial<Transform>;
  t: number;
}

export interface DragTarget {
  clipId: Id;
  size: Size;
  transform: Transform;
}

/** What a pointer position means for a drag: the handle, its start, and the pointer with its modifiers. */
export interface DragInput {
  handle: Handle;
  size: Size;
  format: Size;
  start: Transform;
  /** Pointer at the press, format px. */
  startPointer: Point;
  /** Latest pointer (viewport CSS px) and modifiers. */
  last: { x: number; y: number; alt: boolean; shift: boolean };
}

/** The displayed canvas's content box in viewport CSS px, read fresh (layout may have changed since the last drag). */
export function canvasBoxOf(canvas: HTMLCanvasElement): Box {
  const r = canvas.getBoundingClientRect();
  return { left: r.left + canvas.clientLeft, top: r.top + canvas.clientTop, width: canvas.clientWidth, height: canvas.clientHeight };
}

/** Which handle the viewport point grabs on `target`, or null (empty canvas). */
export function handleAt(canvas: HTMLCanvasElement, format: Size, target: DragTarget, clientX: number, clientY: number): Handle | null {
  const box = canvasBoxOf(canvas);
  const p = cssToFormat({ x: clientX, y: clientY }, box, format);
  const corners = clipCorners(target.size, target.transform, format);
  return hitTest(corners, p, toleranceInFormatPx(HIT_PX, box, format), toleranceInFormatPx(ROTATE_PX, box, format));
}

/** The transform for the latest pointer: move (snapped unless Alt), uniform scale, or rotate (Shift: 15° steps). */
export function transformFor(g: DragInput, canvas: HTMLCanvasElement): Transform {
  const box = canvasBoxOf(canvas);
  const p = cssToFormat({ x: g.last.x, y: g.last.y }, box, g.format);
  if (g.handle === 'move') {
    const moved = dragMove(g.start, p.x - g.startPointer.x, p.y - g.startPointer.y);
    return g.last.alt ? moved : snapToCanvas(moved, g.size, g.format, toleranceInFormatPx(SNAP_PX, box, g.format));
  }
  if (g.handle === 'rotate') {
    const snap = g.last.shift ? ROTATE_SNAP_DEG : undefined;
    return dragRotate(g.start, clipCentre(g.start, g.format), g.startPointer, p, snap);
  }
  if (!(g.start.scale > 0)) return scaleFromZero(g.start, g.size, p, g.format);
  return dragScale(g.start, g.size, g.handle, g.startPointer, p, g.format);
}

/**
 * A corner drag of a clip shown at scale 0 (a keyed scale at 0, or a static 0 written back by the stopwatch): a ratio
 * of distances would stay 0, so the grabbed corner follows the pointer instead (scale = distance from the centre /
 * the source's half-diagonal), within the edit bounds.
 */
export function scaleFromZero(start: Transform, size: Size, pointer: Point, format: Size): Transform {
  const c = clipCentre(start, format);
  const half = Math.hypot(size.width, size.height) / 2;
  const raw = half > 0 ? Math.hypot(pointer.x - c.x, pointer.y - c.y) / half : 0;
  const [lo, hi] = scaleBounds(0);
  return { ...start, scale: Number.isFinite(raw) ? Math.min(hi, Math.max(lo, raw)) : lo };
}

/**
 * The fields a drag changed, as the patch the release commits (setTransformAt) and the live preview shows. Unchanged
 * fields are left out (an animated property the drag did not touch gets no key). The rotation is the start plus the
 * drag's turn: dragRotate normalises to (−180, 180], which would turn a keyed 400° into 40° (Plan 5 ruling M-drag).
 */
export function dragPatch(start: Transform, current: Transform): Partial<Transform> {
  const patch: Partial<Transform> = {};
  if (current.x !== start.x) patch.x = current.x;
  if (current.y !== start.y) patch.y = current.y;
  if (current.scale !== start.scale) patch.scale = current.scale;
  if (current.rotation !== start.rotation) patch.rotation = start.rotation + normaliseDegrees(current.rotation - start.rotation);
  return patch;
}
