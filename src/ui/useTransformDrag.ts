import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { resolvedTransform } from '../core/animate';
import type { Clip, Project, Transform } from '../core/model';
import type { Handle } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import { isStaleDrag } from './dragStale';
import { pastThreshold } from './drag';
import { canvasBoxOf, dragPatch, handleAt, transformFor } from './overlayHit';
import type { DragInput, DragTarget, LiveTransform } from './overlayHit';
import { cssToFormat } from './overlayMath';
import { guard } from './Toast';
import { setTransformAt } from './transformEdits';

/** Class on <html> while a transform drag runs: no text selection, and Space does not toggle playback. */
export const TRANSFORMING_CLASS = 'is-transforming';

interface Gesture extends DragInput {
  pointerId: number;
  clipId: string;
  /** The store's transform and keys objects at the press (see dragStale.ts): if anything else replaces them, the drag's start is stale. */
  storeTransform: Transform;
  storeKeys: Clip['keys'];
  /** The playhead at the press: the drag edits the clip as seen then, and commits there (a key when animated). */
  at: number;
  /** Press position (viewport CSS px); the gesture stays a click until the pointer is past the drag threshold. */
  down: { x: number; y: number };
  active: boolean;
  current: Transform;
}

const editor = () => useEditor.getState();
const clipIn = (p: Project, id: string): Clip | undefined => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id);

/**
 * Pointer dragging on the transform overlay. A press on a handle or the body starts a gesture with the clip's
 * transform AS SEEN AT THE PLAYHEAD (resolved keys) and the pointer (format px); it stays a click until the pointer
 * moves past the drag threshold (4 CSS px), then moves update `onLive` (the overlay and the preview follow at once,
 * the store is untouched) and release commits ONE `setTransformAt` of the changed fields at the press's playhead
 * (keys for animated properties, static values otherwise). Escape cancels. Only the pointer that started counts;
 * pointercancel, lost capture, a mouse move with the button no longer down, and the window losing focus end it
 * without committing; so does any edit that removes the clip, replaces its transform or keys, changes the format, or a
 * playhead move (a hidden, locked or deselected clip unmounts the overlay, which ends it too). Unrelated edits leave
 * it running.
 */
export function useTransformDrag(canvasRef: RefObject<HTMLCanvasElement | null>, onLive: (l: LiveTransform | null) => void) {
  const active = useRef<Gesture | null>(null);
  const stop = useRef<() => void>(() => undefined);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => () => stop.current(), []);

  const begin = (e: ReactPointerEvent<Element>, target: DragTarget): Handle | null => {
    const canvas = canvasRef.current;
    const present = editor().history.present;
    const clip = clipIn(present, target.clipId);
    if (e.button !== 0 || active.current || !canvas || !clip) return null;
    const format = { width: present.format.width, height: present.format.height };
    const handle = handleAt(canvas, format, target, e.clientX, e.clientY);
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
    const at = editor().playhead;
    const start = resolvedTransform(clip, at, present.format.fps);
    const g: Gesture = {
      clipId: target.clipId,
      size: target.size,
      handle,
      format,
      start,
      storeTransform: clip.transform,
      storeKeys: clip.keys,
      at,
      startPointer: cssToFormat({ x: e.clientX, y: e.clientY }, canvasBoxOf(canvas), format),
      last: { x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey },
      pointerId,
      down: { x: e.clientX, y: e.clientY },
      active: false,
      current: start,
    };
    active.current = g;
    document.documentElement.classList.add(TRANSFORMING_CLASS);

    const update = (): void => {
      const c = canvasRef.current;
      if (!c || active.current !== g || !g.active) return;
      g.current = transformFor(g, c);
      onLiveRef.current({ clipId: g.clipId, transform: g.current, patch: dragPatch(g.start, g.current), t: g.at });
    };
    const mine = (ev: PointerEvent): boolean => ev.pointerId === pointerId;
    const onMove = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      // The release happened where we could not see it (a context menu, another window): cancel, never stick.
      if (ev.pointerType === 'mouse' && (ev.buttons & 1) === 0) {
        end();
        return;
      }
      g.last = { x: ev.clientX, y: ev.clientY, alt: ev.altKey, shift: ev.shiftKey };
      if (!g.active && !pastThreshold(ev.clientX - g.down.x, ev.clientY - g.down.y)) return;
      g.active = true;
      update();
    };
    const onUp = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      unsubscribe();
      const patch = dragPatch(g.start, g.current);
      if (g.active && Object.keys(patch).length > 0) guard(() => editor().apply((p) => setTransformAt(p, g.clipId, patch, g.at)));
      end();
    };
    const onCancel = (ev: PointerEvent): void => {
      if (mine(ev)) end();
    };
    const onBlur = (): void => end();
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
      if (s.playhead !== g.at) return end();
      if (isStaleDrag(g, s.history.present, prev.history.present)) end();
    });
    const listeners: [string, EventListener, boolean][] = [
      ['pointermove', onMove as EventListener, false],
      ['pointerup', onUp as EventListener, false],
      ['pointercancel', onCancel as EventListener, false],
      ['lostpointercapture', onCancel as EventListener, false],
      ['blur', onBlur, false],
      ['keydown', onKey as EventListener, true],
      ['keyup', onKey as EventListener, true],
    ];
    const end = (): void => {
      if (active.current !== g) return;
      active.current = null;
      stop.current = () => undefined;
      unsubscribe();
      for (const [type, fn, capture] of listeners) window.removeEventListener(type, fn, capture);
      document.documentElement.classList.remove(TRANSFORMING_CLASS);
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // The element may already be gone (the overlay unmounted).
      }
      onLiveRef.current(null);
    };
    stop.current = end;
    for (const [type, fn, capture] of listeners) window.addEventListener(type, fn, capture);
    return handle;
  };

  return { begin, dragging: (): boolean => active.current?.active === true };
}
