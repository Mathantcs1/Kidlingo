// Plan 5D Task 7: the pure part of reverse decoding: budget arithmetic and the window planner.
import { describe, it, expect } from 'vitest';
import {
  MAX_WINDOW_FRAMES, MIN_WINDOW_FRAMES, REVERSE_CACHE_BYTES, REVERSE_CACHE_TOTAL_BYTES, frameBytes, holdBytes, nextWindow, resetReverseBytes, reverseBytes, windowFrames,
} from '../src/media/reverseCache';

describe('windowFrames', () => {
  it('1080p fits 15 frames of the 128 MiB budget; 4K fits the minimum', () => {
    expect(windowFrames(frameBytes(1920, 1080))).toBe(16); // 128 MiB / 8.29 MB = 16.18
    expect(windowFrames(frameBytes(3840, 2160))).toBe(4);
    expect(windowFrames(frameBytes(7680, 4320))).toBe(MIN_WINDOW_FRAMES);
  });
  it('tiny frames are capped, and the global budget caps a source', () => {
    expect(windowFrames(frameBytes(16, 16))).toBe(MAX_WINDOW_FRAMES);
    expect(windowFrames(frameBytes(1920, 1080), REVERSE_CACHE_BYTES, 2 * frameBytes(1920, 1080))).toBe(2);
    expect(windowFrames(0)).toBe(MIN_WINDOW_FRAMES);
  });
});

describe('nextWindow', () => {
  const dur = 1 / 30;
  it('the first window ends just past the request and spans n frames', () => {
    const w = nextWindow(10, null, dur, 15, 0);
    expect(w.hi).toBeCloseTo(10 + dur / 2, 9);
    expect(w.hi - w.lo).toBeGreaterThanOrEqual(14 * dur - 1e-9); // n-1 spans: the frame covering lo makes n frames
    expect(w.lo).toBeLessThanOrEqual(10);
  });
  it('the next window continues downwards from the previous window start', () => {
    const first = nextWindow(10, null, dur, 15, 0);
    const t = first.lo - dur; // one frame below the old window
    const next = nextWindow(t, first.lo, dur, 15, 0);
    expect(next.hi).toBe(first.lo);
    expect(next.lo).toBeCloseTo(first.lo - 14 * dur, 9);
  });
  it('never asks before the first timestamp of the file', () => {
    expect(nextWindow(0.01, null, dur, 15, 0).lo).toBe(0);
    expect(nextWindow(5.01, null, dur, 15, 5).lo).toBe(5);
  });
  it('a request far below the previous window starts a fresh window around it', () => {
    const w = nextWindow(2, 10, dur, 15, 0);
    expect(w.hi).toBe(10); // still ends at runStart: must reach t
    expect(w.lo).toBe(2); // lo reaches down to t when t is below hi - n*dur
  });
  it('a request above the previous window start ignores it', () => {
    const w = nextWindow(10, 9, dur, 15, 0);
    expect(w.hi).toBeCloseTo(10 + dur / 2, 9);
  });
});

describe('the byte tally', () => {
  it('adds, releases, never goes negative and remembers its peak', () => {
    resetReverseBytes();
    const base = reverseBytes().held;
    expect(holdBytes(1000)).toBe(REVERSE_CACHE_TOTAL_BYTES - base - 1000);
    holdBytes(-5000000);
    expect(reverseBytes().held).toBe(0);
    holdBytes(2000);
    expect(reverseBytes().peak).toBeGreaterThanOrEqual(2000);
    holdBytes(-2000);
  });
});
