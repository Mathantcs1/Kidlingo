// Plan 5D Task 2: the speed-aware time map (constant speed, reverse, freeze; ramps are in speed-ramp.test.ts).
// Invariants I1-I4 and I9 of the plan, plus the reverse mid-frame rule and the edge extrapolation.
import { describe, it, expect } from 'vitest';
import { clipDuration, clipEnd, isIdentityTime, sourceAtOffset, sourceSpan, sourceTimeAt, timelineTimeAt, videoSourceTime } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const mk = (extra: Partial<Clip> = {}): Clip => {
  const inn = rnd() * 30;
  return {
    id: 'c', mediaId: 'm', kind: 'video', start: rnd() * 50, in: inn, out: inn + 0.5 + rnd() * 20, transform: defaultTransform(), volume: 1,
    fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
  };
};
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3.3, 4];

describe('constant speed', () => {
  it('lasts (out - in) / s on the timeline, in both directions', () => {
    for (const s of SPEEDS) for (const reverse of [false, true]) {
      const c = mk({ speed: s, ...(reverse ? { reverse: true as const } : {}) });
      expect(clipDuration(c)).toBeCloseTo((c.out - c.in) / s, 12);
      expect(clipEnd(c)).toBeCloseTo(c.start + (c.out - c.in) / s, 12);
    }
  });
  it('forward maps tau to in + s*tau, reverse to out - s*tau', () => {
    const f = mk({ speed: 2, in: 10, out: 20, start: 5 });
    expect(sourceTimeAt(f, 5)).toBe(10);
    expect(sourceTimeAt(f, 7.5)).toBeCloseTo(15, 12);
    const r = mk({ speed: 2, in: 10, out: 20, start: 5, reverse: true });
    expect(sourceTimeAt(r, 5)).toBe(20);
    expect(sourceTimeAt(r, 7.5)).toBeCloseTo(15, 12);
    expect(sourceTimeAt(r, 5 + 5)).toBe(10); // the clip lasts 5 s: its end is exactly `in`
  });
  it('I1: the two directions invert each other (forward, reverse, every speed)', () => {
    for (let i = 0; i < 2000; i++) {
      const c = mk({ speed: SPEEDS[i % SPEEDS.length], ...(i % 2 ? { reverse: true as const } : {}) });
      const t = c.start + rnd() * clipDuration(c);
      expect(timelineTimeAt(c, sourceTimeAt(c, t))).toBeCloseTo(t, 9);
      const u = c.in + rnd() * (c.out - c.in);
      expect(sourceTimeAt(c, timelineTimeAt(c, u))).toBeCloseTo(u, 9);
    }
  });
  it('I2: forward is increasing, reverse decreasing', () => {
    for (const reverse of [false, true]) {
      const c = mk({ speed: 1.7, ...(reverse ? { reverse: true as const } : {}) });
      let prev = sourceTimeAt(c, c.start);
      for (let k = 1; k <= 50; k++) {
        const cur = sourceTimeAt(c, c.start + (clipDuration(c) * k) / 50);
        expect(reverse ? cur < prev : cur > prev).toBe(true);
        prev = cur;
      }
    }
  });
  it('I3: the clip edges map EXACTLY to in and out (===), forward and reverse', () => {
    for (let i = 0; i < 500; i++) {
      const s = SPEEDS[i % SPEEDS.length];
      const f = mk({ speed: s });
      expect(sourceAtOffset(f, 0)).toBe(f.in);
      expect(sourceAtOffset(f, clipDuration(f))).toBe(f.out);
      const r = mk({ speed: s, reverse: true });
      expect(sourceAtOffset(r, 0)).toBe(r.out);
      expect(sourceAtOffset(r, clipDuration(r))).toBe(r.in);
    }
  });
  it('extrapolates beyond the edges at the edge speed (handles)', () => {
    const c = mk({ speed: 2, in: 10, out: 20, start: 5 });
    expect(sourceTimeAt(c, 4)).toBeCloseTo(8, 12); // one second before the start: 2 s of footage earlier
    expect(sourceTimeAt(c, 11)).toBeCloseTo(22, 12); // one second after the end
    expect(timelineTimeAt(c, 9)).toBeCloseTo(4.5, 12);
    expect(timelineTimeAt(c, 22)).toBeCloseTo(11, 12);
    const r = mk({ speed: 2, in: 10, out: 20, start: 5, reverse: true });
    expect(sourceTimeAt(r, 4)).toBeCloseTo(22, 12);
    expect(sourceTimeAt(r, 11)).toBeCloseTo(8, 12);
    expect(timelineTimeAt(r, 22)).toBeCloseTo(4, 12);
  });
  it('sourceSpan is sorted whichever way the clip plays', () => {
    const r = mk({ speed: 2, in: 10, out: 20, start: 0, reverse: true });
    expect(sourceSpan(r, 1, 2)).toEqual([16, 18]);
    expect(sourceSpan(r, 2, 1)).toEqual([16, 18]);
  });
});

describe('identity', () => {
  it('no speed field, speed 1 and an absent reverse are identity-timed; anything else is not', () => {
    expect(isIdentityTime(mk())).toBe(true);
    expect(isIdentityTime(mk({ speed: 1 }))).toBe(true);
    expect(isIdentityTime(mk({ speed: 1.01 }))).toBe(false);
    expect(isIdentityTime(mk({ reverse: true }))).toBe(false);
    expect(isIdentityTime(mk({ freeze: { at: 3 } }))).toBe(false);
    expect(isIdentityTime(mk({ speedKeys: [{ t: 0, v: 1, ease: { kind: 'linear' } }] }))).toBe(false);
  });
  it('speed 1 forward is bit-identical to the old expressions (I4)', () => {
    for (let i = 0; i < 5000; i++) {
      const c = mk({ speed: 1 });
      const t = c.start + rnd() * 30;
      expect(sourceTimeAt(c, t)).toBe(c.in + (t - c.start));
      expect(clipDuration(c)).toBe(c.out - c.in);
      expect(timelineTimeAt(c, 3)).toBe(c.start + (3 - c.in));
    }
  });
});

describe('freeze (I9)', () => {
  it('every timeline time shows the frozen footage time; the clip lasts out - in', () => {
    const c = mk({ in: 0, out: 2, start: 4, freeze: { at: 7.25 } });
    for (const t of [-3, 4, 4.7, 5.99, 6, 9]) expect(sourceTimeAt(c, t)).toBe(7.25);
    expect(clipDuration(c)).toBe(2);
    expect(clipEnd(c)).toBe(6);
  });
});

describe('the reverse mid-frame rule (D11)', () => {
  it('forward video reads the frame start, reverse the MIDDLE of its footage interval, never past out', () => {
    const fps = 30;
    const f = mk({ in: 0, out: 10, start: 0, speed: 1 });
    expect(videoSourceTime(f, 1, fps)).toBe(1);
    const r = mk({ in: 0, out: 10, start: 0, reverse: true });
    expect(videoSourceTime(r, 0, fps)).toBeCloseTo(10 - 0.5 / fps, 12);
    expect(videoSourceTime(r, 0, fps)).toBeLessThan(10);
    expect(videoSourceTime(r, 10 - 1 / fps, fps)).toBeCloseTo(0.5 / fps, 9);
    const r2 = mk({ in: 0, out: 10, start: 0, reverse: true, speed: 2 });
    expect(videoSourceTime(r2, 0, fps)).toBeCloseTo(10 - 2 * (0.5 / fps), 12);
    const z = mk({ in: 0, out: 2, start: 0, freeze: { at: 5 } });
    expect(videoSourceTime(z, 1, fps)).toBe(5);
  });
});
