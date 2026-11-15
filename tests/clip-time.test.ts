// Plan 5D Task 1: the clip time map at speed 1 is bit-identical to the expressions it replaced.
import { describe, it, expect } from 'vitest';
import { clipDuration, clipEnd, isIdentityTime, sourceAtOffset, sourceSpan, sourceTimeAt, timelineTimeAt, trimLimits } from '../src/core/clipTime';
import * as model from '../src/core/model';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const clip = (): Clip => {
  const inn = rnd() * 50;
  return {
    id: 'c', mediaId: 'm', kind: 'video', start: rnd() * 100, in: inn, out: inn + 0.05 + rnd() * 30, transform: defaultTransform(), volume: 1,
    fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal',
  };
};

describe('speed-1 map equals the old expressions bit for bit (10 000 random clips)', () => {
  it('duration, end, source time, timeline time, offsets and spans', () => {
    for (let i = 0; i < 10_000; i++) {
      const c = clip();
      const t = c.start - 5 + rnd() * 60;
      const u = rnd() * 80;
      const tau = rnd() * 40;
      expect(clipDuration(c)).toBe(c.out - c.in);
      expect(clipEnd(c)).toBe(c.start + (c.out - c.in));
      expect(sourceTimeAt(c, t)).toBe(c.in + (t - c.start));
      expect(sourceAtOffset(c, tau)).toBe(c.in + tau);
      expect(timelineTimeAt(c, u)).toBe(c.start + (u - c.in));
      const [lo, hi] = sourceSpan(c, tau, tau + 3);
      expect(lo).toBe(c.in + tau);
      expect(hi).toBe(c.in + (tau + 3));
      expect(sourceSpan(c, tau + 3, tau)).toEqual([lo, hi]);
    }
  });
  it('model.ts still exports the same functions (existing imports keep working)', () => {
    const c = clip();
    expect(model.clipDuration(c)).toBe(clipDuration(c));
    expect(model.clipEnd(c)).toBe(clipEnd(c));
  });
  it('the two directions invert each other (to rounding)', () => {
    for (let i = 0; i < 1000; i++) {
      const c = clip();
      const t = c.start + rnd() * 20;
      expect(timelineTimeAt(c, sourceTimeAt(c, t))).toBeCloseTo(t, 9);
    }
  });
  it('every clip is identity-timed for now, and the clip edges map exactly', () => {
    const c = clip();
    expect(isIdentityTime(c)).toBe(true);
    expect(sourceTimeAt(c, c.start)).toBe(c.in);
  });
  it('trimLimits: media length for video/audio, none for images and unknown media', () => {
    expect(trimLimits({ kind: 'video', duration: 12 })).toEqual({ footageMin: 0, footageMax: 12 });
    expect(trimLimits({ kind: 'image', duration: 5 })).toEqual({ footageMin: 0, footageMax: Infinity });
    expect(trimLimits(undefined)).toEqual({ footageMin: 0, footageMax: Infinity });
    expect(trimLimits({ kind: 'video', duration: 0 })).toEqual({ footageMin: 0, footageMax: Infinity });
  });
});
