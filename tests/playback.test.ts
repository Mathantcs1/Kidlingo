import { describe, it, expect } from 'vitest';
import { END_EPS, clampTime, playStart, playbackTick, scrubTime } from '../src/ui/playbackTime';

describe('clampTime', () => {
  it('keeps times inside [0, duration]', () => {
    expect(clampTime(1.5, 3)).toBe(1.5);
    expect(clampTime(-1, 3)).toBe(0);
    expect(clampTime(4, 3)).toBe(3);
    expect(clampTime(0, 0)).toBe(0);
  });

  it('maps invalid input to 0 and handles huge values', () => {
    expect(clampTime(Number.NaN, 3)).toBe(0);
    expect(clampTime(1, Number.NaN)).toBe(0);
    expect(clampTime(1, -5)).toBe(0);
    expect(clampTime(Number.POSITIVE_INFINITY, 3)).toBe(3);
    expect(clampTime(Number.NEGATIVE_INFINITY, 3)).toBe(0);
    expect(clampTime(1e300, 1e6)).toBe(1e6);
  });
});

describe('playStart', () => {
  it('returns null when there is nothing to play', () => {
    expect(playStart(0, 0)).toBeNull();
    expect(playStart(1, Number.NaN)).toBeNull();
    expect(playStart(1, -2)).toBeNull();
  });

  it('plays from the playhead, restarting from 0 at or past the end', () => {
    expect(playStart(1.25, 3)).toBe(1.25);
    expect(playStart(3, 3)).toBe(0);
    expect(playStart(3 - END_EPS / 2, 3)).toBe(0);
    expect(playStart(10, 3)).toBe(0);
    expect(playStart(-1, 3)).toBe(0);
    expect(playStart(Number.NaN, 3)).toBe(0);
  });
});

describe('playbackTick', () => {
  it('follows the mixer clock until the end', () => {
    expect(playbackTick(1, 3)).toEqual({ t: 1, ended: false });
    expect(playbackTick(-0.1, 3)).toEqual({ t: 0, ended: false });
  });

  it('stops at exactly the duration once the clock reaches the end', () => {
    expect(playbackTick(3, 3)).toEqual({ t: 3, ended: true });
    expect(playbackTick(3.4, 3)).toEqual({ t: 3, ended: true });
    expect(playbackTick(3 - END_EPS / 2, 3)).toEqual({ t: 3, ended: true });
    expect(playbackTick(1e12, 3)).toEqual({ t: 3, ended: true });
  });

  it('treats an invalid clock or duration as ended at a safe time', () => {
    expect(playbackTick(Number.NaN, 3)).toEqual({ t: 0, ended: false });
    expect(playbackTick(1, 0)).toEqual({ t: 0, ended: true });
    expect(playbackTick(1, Number.NaN)).toEqual({ t: 0, ended: true });
  });
});

describe('scrubTime', () => {
  it('converts a ruler offset to a clamped time', () => {
    expect(scrubTime(90, 60, 3)).toBe(1.5);
    expect(scrubTime(-20, 60, 3)).toBe(0);
    expect(scrubTime(600, 60, 3)).toBe(3);
  });

  it('is safe with bad input', () => {
    expect(scrubTime(Number.NaN, 60, 3)).toBe(0);
    expect(scrubTime(90, 0, 3)).toBe(0);
    expect(scrubTime(90, Number.NaN, 3)).toBe(0);
    expect(scrubTime(90, 60, 0)).toBe(0);
  });
});
