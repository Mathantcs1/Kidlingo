import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { clipEnd } from '../core/model';
import type { Id, Project } from '../core/model';
import { findClip, moveClip, trimClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { moveTarget, pastThreshold, trimTarget } from './drag';
import { guard } from './Toast';

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
}

interface Gesture {
  clipId: Id;
  kind: DragKind;
  x: number;
  y: number;
  active: boolean;
  preview: DragPreview | null;
}

const editor = () => useEditor.getState();

/** The lane under a page point that holds clips of `kind`, if any. */
function laneAt(x: number, y: number, kind: string): Id | null {
  const el = document
    .elementsFromPoint(x, y)
    .find((e) => e instanceof HTMLElement && e.dataset.testid === 'timeline-lane') as HTMLElement | undefined;
  return el && el.dataset.trackKind === kind ? (el.dataset.trackId ?? null) : null;
}

function previewFor(p: Project, g: Gesture, dx: number, x: number, y: number, pps: number): DragPreview {
  const { track, clip } = findClip(p, g.clipId);
  if (g.kind === 'move') {
    const start = moveTarget(p, clip.id, dx, pps);
    const trackId = laneAt(x, y, track.kind) ?? track.id;
    return { clipId: clip.id, kind: g.kind, trackId, start, duration: clip.out - clip.in, value: start };
  }
  const t = trimTarget(p, clip.id, g.kind, dx, pps);
  const start = g.kind === 'start' ? t : clip.start;
  const end = g.kind === 'start' ? clipEnd(clip) : t;
  return { clipId: clip.id, kind: g.kind, trackId: track.id, start, duration: Math.max(0, end - start), value: t };
}

/** Swallows the click that follows a drag, so it does not also select or deselect. */
function swallowNextClick(): void {
  const stop = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/**
 * Pointer dragging of clip bodies (move) and edges (trim). A press becomes a drag after 4 px; until then it
 * stays a click. The ghost follows the pointer through local state and the edit is committed with ONE apply
 * on release (a TimelineError reverts and shows a toast). Escape cancels.
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
    gesture.current = { clipId, kind, x: e.clientX, y: e.clientY, active: false, preview: null };
    let cancelled = false;

    const end = (): void => {
      gesture.current = null;
      setPreview(null);
      detach.current();
    };
    const onMove = (ev: PointerEvent): void => {
      const g = gesture.current;
      if (!g || cancelled) return;
      const dx = ev.clientX - g.x;
      if (!g.active) {
        if (!pastThreshold(dx, ev.clientY - g.y)) return;
        g.active = true;
        if (!editor().selection.includes(g.clipId)) editor().select([g.clipId]);
        if (editor().playing) editor().setPlaying(false);
      }
      guard(() => {
        g.preview = previewFor(editor().history.present, g, dx, ev.clientX, ev.clientY, ppsRef.current);
        setPreview(g.preview);
      });
    };
    const onUp = (): void => {
      const g = gesture.current;
      if (g?.active) swallowNextClick();
      const pv = !cancelled && g?.active ? g.preview : null;
      end();
      if (!pv) return;
      guard(() =>
        editor().apply((p) =>
          pv.kind === 'move' ? moveClip(p, pv.clipId, pv.value, pv.trackId) : trimClip(p, pv.clipId, pv.kind, pv.value),
        ),
      );
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape' || !gesture.current) return;
      ev.preventDefault();
      cancelled = true;
      setPreview(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', onKey);
    detach.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', onKey);
      detach.current = () => undefined;
    };
  };

  return { preview, begin };
}
