import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Id, PositionKeyframe, Vec } from '../core/model';
import type { PathChange } from '../core/pathEdits';
import { useEditor } from '../state/store';
import { isStaleDrag } from './dragStale';
import type { DragSnapshot } from './dragStale';
import { canvasBoxOf } from './overlayHit';
import { cssToFormat } from './overlayMath';
import { commitPathChangeCmd } from './pathCommands';
import { draggedKeyXY, draggedTangent, pathDragStarted, tangentDragPatch } from './pathDragMath';
import type { TangentSide } from './pathDragMath';
import { TRANSFORMING_CLASS } from './useTransformDrag';

/** A path drag in progress, as the preview shows it (withLivePath) until the release commits it. */
export interface LivePath { clipId: Id; change: PathChange }

/** What a press grabbed: a key dot (`key`) or one of the tangent handles of a key; `start` is its xy or tangent. */
export interface PathGrab { clipId: Id; list: readonly PositionKeyframe[]; index: number; part: 'key' | TangentSide; start: Vec }

const editor = () => useEditor.getState();

/**
 * Pointer dragging of motion path key dots and tangent handles (Plan 5B Task 8). A press stays a click (the dot seeks)
 * until the pointer travels 4 CSS px; then moves update `onLive` (the preview draws withLivePath: exactly what the
 * release commits) and the release commits ONE apply. Escape, pointercancel, lost capture, the window losing focus and
 * any store change that replaces the clip's keys, transform or presets (isStaleDrag) end it without committing. Alt
 * (pressed or released mid-drag) breaks a smooth key's tangents. `consumeClick` tells the dot to ignore the click that
 * follows a drag.
 */
export function usePathDrag(canvasRef: RefObject<HTMLCanvasElement | null>, onLive: (l: LivePath | null) => void) {
  const stop = useRef<() => void>(() => undefined);
  const dragged = useRef(false);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  useEffect(() => () => stop.current(), []);

  const begin = (e: ReactPointerEvent<Element>, grab: PathGrab): void => {
    dragged.current = false;
    const canvas = canvasRef.current;
    const present = editor().history.present;
    const clip = present.tracks.flatMap((t) => t.clips).find((c) => c.id === grab.clipId);
    if (e.button !== 0 || !canvas || !clip) return;
    stop.current(); // never two gestures at once
    e.stopPropagation(); // the stage's ghost selection never sees a press on the path
    const el = e.currentTarget;
    const { pointerId } = e;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // A pointer that is already up cannot be captured; the window listeners still see the gesture.
    }
    const format = { width: present.format.width, height: present.format.height };
    const snap: DragSnapshot = { clipId: grab.clipId, storeTransform: clip.transform, storeKeys: clip.keys, storeMotion: clip.motion, format };
    const toFormat = (x: number, y: number): Vec => cssToFormat({ x, y }, canvasBoxOf(canvas), format);
    const down = { x: e.clientX, y: e.clientY };
    const from = toFormat(e.clientX, e.clientY);
    let last = { x: e.clientX, y: e.clientY, alt: e.altKey };
    let active = false;
    let change: PathChange | null = null;
    const u = grab.list[grab.index].t;

    const update = (): void => {
      const to = toFormat(last.x, last.y);
      change = grab.part === 'key'
        ? { u, xy: draggedKeyXY(grab.start, from, to) }
        : { u, tangents: tangentDragPatch(grab.list, grab.index, grab.part, draggedTangent(grab.start, from, to), last.alt) };
      onLiveRef.current({ clipId: grab.clipId, change });
    };
    const mine = (ev: PointerEvent): boolean => ev.pointerId === pointerId;
    const onMove = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      if (ev.pointerType === 'mouse' && (ev.buttons & 1) === 0) return end(); // released where we could not see it
      last = { x: ev.clientX, y: ev.clientY, alt: ev.altKey };
      if (!active && !pathDragStarted(down, last)) return;
      if (!active) {
        active = true;
        dragged.current = true;
        if (editor().playing) editor().setPlaying(false);
        document.documentElement.classList.add(TRANSFORMING_CLASS);
      }
      update();
    };
    const onUp = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      // Commit first: the store change and the end of the live preview render together (no flash of the old frame).
      if (active && change) commitPathChangeCmd(grab.clipId, change);
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
      } else if (ev.key === 'Alt' && active) {
        ev.preventDefault();
        last = { ...last, alt: ev.type === 'keydown' };
        update();
      }
    };
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (isStaleDrag(snap, s.history.present, prev.history.present)) end();
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
    let done = false;
    const end = (): void => {
      if (done) return;
      done = true;
      stop.current = () => undefined;
      unsubscribe();
      for (const [type, fn, capture] of listeners) window.removeEventListener(type, fn, capture);
      document.documentElement.classList.remove(TRANSFORMING_CLASS);
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // The element may already be gone.
      }
      if (active) onLiveRef.current(null);
    };
    stop.current = end;
    for (const [type, fn, capture] of listeners) window.addEventListener(type, fn, capture);
  };

  /** True (once) when the click that follows belongs to a drag, so the dot does not seek. */
  const consumeClick = (): boolean => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  };
  return { begin, consumeClick };
}
