// Reverse playback support for the video decoder (Plan 5D Task 7). A reversed clip asks for frames in DESCENDING time,
// but decoders only run forward from a key frame. The cache decodes a WINDOW of N frames ending where the previous window
// began (keeping the LAST frames of a pass, served in descending order) and decodes the same GOP again, up to the oldest
// frame served, when the window is exhausted: O(G²/N) decodes per GOP (G frames per GOP, N frames that fit the budget).
// This file is the DOM-free part: the budget arithmetic and the window planner (tests/reverse-cache.test.ts).

/** Decoded bytes one source may hold for reverse playback. */
export const REVERSE_CACHE_BYTES = 128 * 1024 * 1024;
/** Decoded bytes all sources together may hold for reverse playback (preview and export pools coexist). */
export const REVERSE_CACHE_TOTAL_BYTES = 384 * 1024 * 1024;
/** Fewest frames a window holds even when they do not fit the budget (4K frames: the re-decode passes dominate). */
export const MIN_WINDOW_FRAMES = 2;
/** Most frames a window holds (a small frame must not make the first pass decode a whole GOP at once). */
export const MAX_WINDOW_FRAMES = 120;

/** How many frames of `frameBytes` each fit `ownBudget` and the `globalFree` bytes left across all sources. */
export function windowFrames(frameBytes: number, ownBudget = REVERSE_CACHE_BYTES, globalFree = REVERSE_CACHE_TOTAL_BYTES): number {
  if (!(frameBytes > 0)) return MIN_WINDOW_FRAMES;
  const n = Math.floor(Math.min(ownBudget, globalFree) / frameBytes);
  return Math.max(MIN_WINDOW_FRAMES, Math.min(MAX_WINDOW_FRAMES, n));
}

export interface ReverseWindow {
  /** Decode frames whose time lies in [lo, hi) (the decoder still starts at the key frame before `lo`). */
  lo: number;
  hi: number;
}

/**
 * The window to decode for a request at `t` when frames are `dur` seconds long and `n` fit: ending at the start of the
 * previous window (`runStart`) so the new frames continue downwards, or just past `t` for the first window. `floor` is the
 * first timestamp of the file (never ask before it).
 */
export function nextWindow(t: number, runStart: number | null, dur: number, n: number, floor: number): ReverseWindow {
  const hi = runStart !== null && runStart > t ? runStart : t + dur * 0.5;
  const lo = Math.max(floor, Math.min(t, hi - (n - 1) * dur));
  return { lo, hi };
}

/** Bytes of one decoded frame as ImageBitmap/RGBA. */
export const frameBytes = (width: number, height: number): number => Math.max(0, width) * Math.max(0, height) * 4;

/** The running total of bytes held by every reverse window (a module-level tally, like the video source stats). */
const held = { bytes: 0, peak: 0 };

export function reverseBytes(): { held: number; peak: number } {
  return { held: held.bytes, peak: held.peak };
}

export function resetReverseBytes(): void {
  held.peak = held.bytes;
}

/** Adds (or, negative, releases) bytes to the global tally; returns what is still free of the global cap. */
export function holdBytes(delta: number): number {
  held.bytes = Math.max(0, held.bytes + delta);
  held.peak = Math.max(held.peak, held.bytes);
  return REVERSE_CACHE_TOTAL_BYTES - held.bytes;
}
