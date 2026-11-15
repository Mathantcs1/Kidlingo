import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Id } from '../core/model';
import type { Point } from '../render/overlayGeometry';
import { movePivotCmd } from './cropCommands';
import { canvasBoxOf } from './overlayHit';
import { cssToFormat } from './overlayMath';

const DRAG_PX = 3;

/**
 * The on-canvas pivot drag (Plan 5E): Shift + press on the pivot dot, then move; the dot follows the pointer (`onLive`,
 * format px) while the picture stays where it is, and the release commits ONE apply (movePivotTo). A press that never
 * moves, Escape, pointercancel and the window losing focus end it without committing.
 */
export function usePivotDrag(canvasRef: RefObject<HTMLCanvasElement | null>, onLive: (p: Point | null) => void) {
  const stop = useRef<() => void>(() => undefined);
  const busy = useRef(false);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  useEffect(() => () => stop.current(), []);

  const begin = (e: ReactPointerEvent<Element>, clipId: Id, format: { width: number; height: number }): boolean => {
    const canvas = canvasRef.current;
    if (e.button !== 0 || busy.current || !canvas) return false;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The window listeners below still see the gesture.
    }
    busy.current = true;
    const down = { x: e.clientX, y: e.clientY };
    let last: Point | null = null;
    const move = (ev: PointerEvent): void => {
      if (!last && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < DRAG_PX) return;
      last = cssToFormat({ x: ev.clientX, y: ev.clientY }, canvasBoxOf(canvas), format);
      onLiveRef.current(last);
    };
    const end = (commit: boolean): void => {
      stop.current();
      busy.current = false;
      onLiveRef.current(null);
      if (commit && last) movePivotCmd(clipId, last);
    };
    const up = (ev: PointerEvent): void => {
      if (ev.pointerId === e.pointerId) end(true);
    };
    const cancel = (): void => end(false);
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    stop.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
    };
    return true;
  };
  return { begin, dragging: (): boolean => busy.current };
}
