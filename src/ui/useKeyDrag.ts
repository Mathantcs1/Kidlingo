// Pointer gestures on the timeline keyframe diamonds (Plan 5 Task 8): a press selects (Shift/Ctrl/Cmd adds), a click
// moves the playhead to the key, and a drag past 4 px retimes every selected key. The drag lives in local state
// (whole frames, playhead snap, kept on the clip, refusal shown live) and commits ONE `moveKeys` on release; Escape,
// pointercancel or any project change ends it without committing. On a locked track nothing moves and the release
// reports the core's refusal.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Id } from '../core/model';
import { findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { pastThreshold } from './drag';
import { seekToKeyCmd } from './keyframeCommands';
import { dragDelta, moveRefusal } from './keyDrag';
import { isPicked, keySel, pickKey, selectedRefs, setKeySel, useKeySelection } from './keySelection';
import { moveSelectedKeysCmd, selectKeyCmd } from './keySelectionCommands';
import { swallowNextClick } from './useClipDrag';

/** The live drag: how far the selected keys would move, and whether releasing would be refused. */
export interface KeyDragLive {
  delta: number;
  rejected: boolean;
}

interface Press {
  pointerId: number;
  u: number;
  x: number;
  y: number;
  wasPicked: boolean;
  active: boolean;
  delta: number;
}

const editor = () => useEditor.getState();
const additive = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean => e.shiftKey || e.metaKey || e.ctrlKey;

export function useKeyDrag(clipId: Id, pps: number, locked: boolean) {
  const [live, setLive] = useState<KeyDragLive | null>(null);
  const press = useRef<Press | null>(null);
  const last = useRef<{ u: number; wasPicked: boolean } | null>(null);
  const detach = useRef<() => void>(() => undefined);
  const opts = useRef({ pps, locked });
  opts.current = { pps, locked };

  useEffect(() => () => detach.current(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, u: number): void => {
    if (e.button !== 0 || press.current) return;
    e.stopPropagation();
    const wasPicked = isPicked(keySel(), clipId, u);
    if (!wasPicked) setKeySel(pickKey(keySel(), clipId, u, additive(e)));
    last.current = { u, wasPicked };
    const g: Press = { pointerId: e.pointerId, u, x: e.clientX, y: e.clientY, wasPicked, active: false, delta: 0 };
    press.current = g;
    let cancelled = false;

    const end = (): void => {
      press.current = null;
      setLive(null);
      detach.current();
    };
    const mine = (ev: PointerEvent): boolean => ev.pointerId === g.pointerId;
    const onMove = (ev: PointerEvent): void => {
      if (!mine(ev) || cancelled) return;
      const dx = ev.clientX - g.x;
      if (!g.active) {
        if (!pastThreshold(dx, ev.clientY - g.y)) return;
        g.active = true;
        if (editor().playing) editor().setPlaying(false);
      }
      const { history, playhead } = editor();
      const p = history.present;
      const s = keySel();
      if (s.clipId !== clipId || s.times.length === 0) return end();
      const { clip } = findClip(p, clipId);
      g.delta = dragDelta({ clip, times: s.times, grabbed: g.u, dxPx: dx, pps: opts.current.pps, fps: p.format.fps, playhead });
      if (opts.current.locked) setLive({ delta: 0, rejected: true });
      else setLive({ delta: g.delta, rejected: g.delta !== 0 && moveRefusal(p, clipId, selectedRefs(clip, s.times), g.delta) !== null });
    };
    const onUp = (ev: PointerEvent): void => {
      if (!mine(ev)) return;
      const commit = g.active && !cancelled ? g.delta : 0;
      if (g.active || cancelled) swallowNextClick();
      end();
      // A refused move (overlap, locked track) is reported by the core as a toast; the diamonds snap back.
      if (commit !== 0) moveSelectedKeysCmd(commit);
    };
    const onCancel = (ev: PointerEvent): void => {
      if (mine(ev)) end();
    };
    // Capture phase: runs before the editor's Escape (which would also drop the key selection).
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      cancelled = true;
      setLive(null);
    };
    const unEditor = useEditor.subscribe((s, prev) => {
      if (s.history.present !== prev.history.present) end();
    });
    const unKeys = useKeySelection.subscribe((s) => {
      if (s.sel.clipId !== clipId) end();
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('keydown', onKey, { capture: true });
    detach.current = () => {
      unEditor();
      unKeys();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onKey, { capture: true });
      detach.current = () => undefined;
    };
  };

  /** A click without a drag (or Enter/Space): select and move the playhead to the key. */
  const onClick = (e: ReactMouseEvent<HTMLElement>, u: number): void => {
    e.stopPropagation();
    const fromPointer = e.detail > 0 && last.current?.u === u;
    const wasPicked = fromPointer ? last.current!.wasPicked : isPicked(keySel(), clipId, u);
    last.current = null;
    if (!additive(e)) selectKeyCmd(clipId, u, false);
    else if (fromPointer && !wasPicked) seekToKeyCmd(clipId, u); // added on press
    else selectKeyCmd(clipId, u, true); // toggles
  };

  return { live, onPointerDown, onClick };
}
