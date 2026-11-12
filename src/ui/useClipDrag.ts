import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { clipEnd } from '../core/model';
import type { Id, Project, TrackKind } from '../core/model';
import { findClip, moveClip, trimClip } from '../core/timeline';
import { MAX_TRACKS_PER_KIND, isLocked } from '../core/tracks';
import { useEditor } from '../state/store';
import { moveTarget, pastThreshold, trimTarget } from './drag';
import { dropTargetAt } from './dragTargets';
import { guard } from './Toast';
import { moveToNewLayer } from './trackCommands';

export type DragKind = 'move' | 'start' | 'end';

/** Where the dragged clip would land, for the live ghost. */
export interface DragPreview {
  clipId: Id;
  kind: DragKind;
  trackId: Id;
  start: number;
  duration: number;
  /** The new edge time (trims) or start (moves) to commit. */
  value: number;
  /** Over a new-layer zone of this kind (moves only): releasing creates a track there. `trackId` stays the source. */
  zone: TrackKind | null;
  /** Releasing here is refused (shown as a rejected ghost): a locked source/target, or a zone that cannot take it. */
  rejected: boolean;
}

interface Gesture {
  /** Only this pointer drives the gesture; other pointers (a second touch, a pen) are ignored. */
  pointerId: number;
  clipId: Id;
  kind: DragKind;
  x: number;
  y: number;
  active: boolean;
  preview: DragPreview | null;
}

const editor = () => useEditor.getState();

const hasClip = (p: Project, id: Id): boolean => p.tracks.some((t) => t.clips.some((c) => c.id === id));

/** A zone refuses a clip of the other kind, and any clip once its kind has the most tracks allowed. */
function zoneRejects(p: Project, zone: TrackKind, kind: TrackKind): boolean {
  return zone !== kind || p.tracks.filter((t) => t.kind === zone).length >= MAX_TRACKS_PER_KIND;
}

/** Where the drag would land, or null over the sticky ruler/header column (no ghost; releasing there does nothing). */
function previewFor(p: Project, g: Gesture, dx: number, x: number, y: number, pps: number): DragPreview | null {
  const { track, clip } = findClip(p, g.clipId);
  if (g.kind === 'move') {
    const start = moveTarget(p, clip.id, dx, pps);
    const over = dropTargetAt(x, y, track.kind);
    if (over === 'blocked') return null;
    const trackId = over?.lane ?? track.id;
    const zone = over?.zone ?? null;
    const rejected = track.locked || (zone ? zoneRejects(p, zone, track.kind) : isLocked(p, trackId));
    return { clipId: clip.id, kind: g.kind, trackId, zone, start, duration: clip.out - clip.in, value: start, rejected };
  }
  const t = trimTarget(p, clip.id, g.kind, dx, pps);
  const start = g.kind === 'start' ? t : clip.start;
  const end = g.kind === 'start' ? clipEnd(clip) : t;
  const duration = Math.max(0, end - start);
  return { clipId: clip.id, kind: g.kind, trackId: track.id, zone: null, start, duration, value: t, rejected: track.locked };
}

/** Swallows the click that follows a drag, so it does not also select or deselect. */
export function swallowNextClick(): void {
  const stop = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/**
 * Pointer dragging of clip bodies (move, also onto a new-layer zone) and edges (trim). A press becomes a drag after
 * 4 px; until then it stays a click. The ghost follows the pointer through local state and the edit is committed
 * with ONE apply on release (a TimelineError reverts and shows a toast). Escape cancels. Only the pointer that
 * started the gesture counts; pointercancel / lostpointercapture end it without committing. If the clip disappears meanwhile
 * (undo, delete) the gesture ends quietly at once.
 */
export function useClipDrag(pps: number) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const detach = useRef<() => void>(() => undefined);

  useEffect(() => () => detach.current(), []);

  const begin = (e: ReactPointerEvent<HTMLElement>, clipId: Id, kind: DragKind): void => {
    if (e.button !== 0 || gesture.current) return;
    e.stopPropagation();
    const pointerId = e.pointerId;
    gesture.current = { pointerId, clipId, kind, x: e.clientX, y: e.clientY, active: false, preview: null };
    let cancelled = false;

    const end = (): void => {
      gesture.current = null;
      setPreview(null);
      detach.current();
    };
    const mine = (ev: PointerEvent): boolean => ev.pointerId === pointerId;
    const onMove = (ev: PointerEvent): void => {
      const g = gesture.current;
      if (!g || cancelled || !mine(ev)) return;
      const dx = ev.clientX - g.x;
      if (!g.active) {
        if (!pastThreshold(dx, ev.clientY - g.y)) return;
        g.active = true;
        if (!editor().selection.includes(g.clipId)) editor().select([g.clipId]);
        if (editor().playing) editor().setPlaying(false);
      }
      const p = editor().history.present;
      if (!hasClip(p, g.clipId)) {
        end();
        return;
      }
      try {
        g.preview = previewFor(p, g, dx, ev.clientX, ev.clientY, ppsRef.current);
        setPreview(g.preview);
      } catch (err) {
        // One report, then the gesture is over (never a toast per pointer move).
        end();
        guard(() => {
          throw err;
        });
      }
    };
    const onUp = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      const g = gesture.current;
      if (g?.active) swallowNextClick();
      const pv = !cancelled && g?.active ? g.preview : null;
      end();
      if (!pv || !hasClip(editor().history.present, pv.clipId)) return;
      // A refused zone drop still goes through the command, which reports why (kind, lock, limit) as a toast.
      if (pv.zone) {
        moveToNewLayer(pv.clipId, pv.zone, pv.value);
        return;
      }
      guard(() =>
        editor().apply((p) =>
          pv.kind === 'move' ? moveClip(p, pv.clipId, pv.value, pv.trackId) : trimClip(p, pv.clipId, pv.kind, pv.value),
        ),
      );
    };
    const onCancel = (ev: PointerEvent): void => {
      if (mine(ev)) end();
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape' || !gesture.current) return;
      ev.preventDefault();
      cancelled = true;
      setPreview(null);
    };
    // Undo/delete during the drag can remove the clip: drop the ghost right away.
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.history.present !== prev.history.present && !hasClip(s.history.present, clipId)) end();
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('keydown', onKey);
    detach.current = () => {
      unsubscribe();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onKey);
      detach.current = () => undefined;
    };
  };

  return { preview, begin };
}
