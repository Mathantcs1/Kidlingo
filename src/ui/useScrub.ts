import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { timelineDuration } from '../core/timeline';
import { useEditor } from '../state/store';
import { scrubTime } from './playbackTime';

/**
 * Pointer handlers that scrub the playhead: pressing sets it under the pointer and dragging (with pointer
 * capture) keeps it there, clamped to [0, timeline duration]. `originRef` is the element whose left edge is
 * time 0 (the ruler). Scrubbing pauses playback.
 */
export function useScrub(originRef: RefObject<HTMLElement | null>, pps: number) {
  const active = useRef<number | null>(null);

  const seek = (clientX: number): void => {
    const origin = originRef.current;
    if (!origin) return;
    const { history, setPlayhead } = useEditor.getState();
    setPlayhead(scrubTime(clientX - origin.getBoundingClientRect().left, pps, timelineDuration(history.present)));
  };

  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>): void {
      if (e.button !== 0) return;
      e.preventDefault();
      active.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail for an already-released pointer; scrubbing then works only while over the element.
      }
      if (useEditor.getState().playing) useEditor.getState().setPlaying(false);
      seek(e.clientX);
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>): void {
      if (active.current === e.pointerId) seek(e.clientX);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>): void {
      if (active.current !== e.pointerId) return;
      active.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel(): void {
      active.current = null;
    },
  };
}
