import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { followScroll } from './layout';

/** After the user scrolls the timeline, following pauses this long so it does not fight them. */
const USER_SCROLL_PAUSE_MS = 2000;

/**
 * Keeps the playhead (at `x` px) in view while `playing`: when it leaves the visible part of the scroll container,
 * the container jumps so the playhead is near its left edge. A scroll the user makes pauses following for ~2 s.
 * `inset` px on the container's left are covered by sticky content (the track headers) and do not count as visible.
 * Returns the container's onScroll handler.
 */
export function useFollowPlayhead(
  scrollRef: RefObject<HTMLElement | null>,
  x: number,
  playing: boolean,
  inset = 0,
): () => void {
  const expected = useRef<number | null>(null);
  const userScrollAt = useRef(-Infinity);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing || performance.now() - userScrollAt.current < USER_SCROLL_PAUSE_MS) return;
    const next = followScroll(x, el.scrollLeft, el.clientWidth - inset);
    if (next === null || next === el.scrollLeft) return;
    el.scrollLeft = next;
    expected.current = el.scrollLeft; // as the browser clamped it
  }, [scrollRef, x, playing, inset]);

  return () => {
    const el = scrollRef.current;
    if (!el) return;
    // Our own jump lands at (about) the expected position; anything else is the user.
    if (expected.current !== null && Math.abs(el.scrollLeft - expected.current) <= 1) {
      expected.current = null;
      return;
    }
    expected.current = null;
    userScrollAt.current = performance.now();
  };
}
