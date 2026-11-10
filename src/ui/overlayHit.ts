// Screen-side helpers of the transform overlay: on-screen sizes, the displayed canvas box, hit testing and the
// transform for a pointer position (all geometry itself lives in render/overlayGeometry.ts, in format px).
import type { Id, Transform } from '../core/model';
import type { Size } from '../render/geometry';
import { clipCentre, clipCorners, dragMove, dragRotate, dragScale, hitTest, snapToCanvas } from '../render/overlayGeometry';
import type { Handle, Point } from '../render/overlayGeometry';
import { cssToFormat, toleranceInFormatPx } from './overlayMath';
import type { Box } from './overlayMath';

/** On-screen sizes, in CSS px (converted to format px for the geometry). */
export const HANDLE_PX = 10;
export const HIT_PX = 10;
export const ROTATE_PX = 28;
const SNAP_PX = 8;
const ROTATE_SNAP_DEG = 15;

/** A clip being edited live: drawn by the overlay and the preview at `transform` until the drag ends. */
export interface LiveTransform {
  clipId: Id;
  transform: Transform;
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
  return dragScale(g.start, g.size, g.handle, g.startPointer, p, g.format);
}
