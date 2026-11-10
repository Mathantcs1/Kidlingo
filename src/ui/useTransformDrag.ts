import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Id, Transform } from '../core/model';
import type { Size } from '../render/geometry';
import { clipCentre, clipCorners, dragMove, dragRotate, dragScale, hitTest, snapToCanvas } from '../render/overlayGeometry';
import type { Handle, Point } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import { cssToFormat, toleranceInFormatPx } from './overlayMath';
import type { Box } from './overlayMath';
import { guard } from './Toast';
import { setClipTransform } from './transformEdits';

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

interface Gesture extends DragTarget {
  pointerId: number;
  handle: Handle;
  format: Size;
  /** Pointer at the press, format px. */
  startPointer: Point;
  current: Transform;
  last: { x: number; y: number; alt: boolean; shift: boolean };
}

const editor = () => useEditor.getState();

/** The displayed canvas's content box in viewport CSS px, read fresh (layout may have changed since the last drag). */
export function canvasBoxOf(canvas: HTMLCanvasElement): Box {
  const r = canvas.getBoundingClientRect();
  return { left: r.left + canvas.clientLeft, top: r.top + canvas.clientTop, width: canvas.clientWidth, height: canvas.clientHeight };
}

/** Which handle the viewport point grabs on `target`, or null (empty canvas). */
export function handleAt(canvas: HTMLCanvasElement, target: DragTarget, clientX: number, clientY: number): Handle | null {
  const format = editor().history.present.format;
  const box = canvasBoxOf(canvas);
  const p = cssToFormat({ x: clientX, y: clientY }, box, format);
  const corners = clipCorners(target.size, target.transform, format);
  return hitTest(corners, p, toleranceInFormatPx(HIT_PX, box, format), toleranceInFormatPx(ROTATE_PX, box, format));
}

/** The transform for the pointer at viewport (x, y): move (snapped unless Alt), uniform scale, or rotate (Shift: 15°). */
function transformFor(g: Gesture, canvas: HTMLCanvasElement): Transform {
  const box = canvasBoxOf(canvas);
  const p = cssToFormat({ x: g.last.x, y: g.last.y }, box, g.format);
  if (g.handle === 'move') {
    const moved = dragMove(g.transform, p.x - g.startPointer.x, p.y - g.startPointer.y);
    return g.last.alt ? moved : snapToCanvas(moved, g.size, g.format, toleranceInFormatPx(SNAP_PX, box, g.format));
  }
  if (g.handle === 'rotate') {
    const snap = g.last.shift ? ROTATE_SNAP_DEG : undefined;
    return dragRotate(g.transform, clipCentre(g.transform, g.format), g.startPointer, p, snap);
  }
  return dragScale(g.transform, g.size, g.handle, g.startPointer, p, g.format);
}

const changed = (a: Transform, b: Transform): boolean => a.x !== b.x || a.y !== b.y || a.scale !== b.scale || a.rotation !== b.rotation;

/**
 * Pointer dragging on the transform overlay. A press on a handle or the body starts a gesture with the clip's
 * transform and the pointer (format px); moves update `onLive` (the overlay and the preview follow at once, the
 * store is untouched); release commits ONE `setClipTransform` when the transform changed. Escape cancels; only the
 * pointer that started counts; pointercancel / lost capture end it without committing; any project change meanwhile
 * (undo, delete, a layer hidden or locked) ends it quietly. A press on empty canvas does nothing.
 */
export function useTransformDrag(canvasRef: RefObject<HTMLCanvasElement | null>, onLive: (l: LiveTransform | null) => void) {
  const active = useRef<Gesture | null>(null);
  const stop = useRef<() => void>(() => undefined);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => () => stop.current(), []);

  const begin = (e: ReactPointerEvent<Element>, target: DragTarget): Handle | null => {
    const canvas = canvasRef.current;
    if (e.button !== 0 || active.current || !canvas) return null;
    const handle = handleAt(canvas, target, e.clientX, e.clientY);
    if (!handle) return null;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const { pointerId } = e;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Capture can fail for a pointer that is already up; the window listeners still see the gesture.
    }
    if (editor().playing) editor().setPlaying(false);
    const format = { width: editor().history.present.format.width, height: editor().history.present.format.height };
    const g: Gesture = {
      ...target,
      pointerId,
      handle,
      format,
      startPointer: cssToFormat({ x: e.clientX, y: e.clientY }, canvasBoxOf(canvas), format),
      current: target.transform,
      last: { x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey },
    };
    active.current = g;
    document.documentElement.classList.add('is-transforming');

    const update = (): void => {
      const c = canvasRef.current;
      if (!c || active.current !== g) return;
      g.current = transformFor(g, c);
      onLiveRef.current({ clipId: g.clipId, transform: g.current });
    };
    const mine = (ev: PointerEvent): boolean => ev.pointerId === pointerId;
    const onMove = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      g.last = { x: ev.clientX, y: ev.clientY, alt: ev.altKey, shift: ev.shiftKey };
      update();
    };
    const onUp = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      unsubscribe();
      const final = g.current;
      if (changed(final, g.transform)) {
        const patch = { x: final.x, y: final.y, scale: final.scale, rotation: final.rotation };
        guard(() => editor().apply((p) => setClipTransform(p, g.clipId, patch)));
      }
      end();
    };
    const onCancel = (ev: PointerEvent): void => {
      if (mine(ev)) end();
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        end();
      } else if (ev.key === 'Shift' || ev.key === 'Alt') {
        // Holding or releasing a modifier re-applies the drag at the last pointer position.
        if (ev.key === 'Alt') ev.preventDefault();
        g.last = { ...g.last, alt: ev.altKey, shift: ev.shiftKey };
        update();
      }
    };
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.history.present !== prev.history.present) end();
    });
    const end = (): void => {
      if (active.current !== g) return;
      active.current = null;
      stop.current = () => undefined;
      unsubscribe();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      document.documentElement.classList.remove('is-transforming');
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // The element may already be gone (the overlay unmounted).
      }
      onLiveRef.current(null);
    };
    stop.current = end;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return handle;
  };

  return { begin, dragging: (): boolean => active.current !== null };
}
