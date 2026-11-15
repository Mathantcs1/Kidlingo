// Plan 5D Task 2: the speed ramp (a keyframed speed curve over footage time): grid anchoring, exact edges, the integral
// and its inverse, split invariance (I5), trim round trip (I6), Simpson sanity (I8), overshoot clamping, hold, cache.
import { describe, it, expect } from 'vitest';
import { clipDuration, sourceAtOffset, sourceTimeAt, timelineTimeAt } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip, Keyframe } from '../src/core/model';
import { CELLS_PER_SEGMENT, rampInverse, rampOffset, rampTable, speedAt } from '../src/core/speedRamp';

let seed = 99;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const k = (t: number, v: number, kind: Keyframe['ease']['kind'] = 'linear'): Keyframe => ({ t, v, ease: { kind } });
const clip = (extra: Partial<Clip>): Clip => ({
  id: 'c', mediaId: 'm', kind: 'video', start: 3, in: 1, out: 9, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const RAMP = [k(0, 0.5, 'easeInOut'), k(4, 3), k(10, 1, 'easeOut'), k(14, 2)];

/** Independent oracle for the duration: Simpson's rule on 1/s over [a, b] with 4096 sub-intervals. */
function simpson(keys: Keyframe[], a: number, b: number): number {
  const n = 4096;
  const h = (b - a) / n;
  let sum = 1 / speedAt(keys, a) + 1 / speedAt(keys, b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) / speedAt(keys, a + i * h);
  return (sum * h) / 3;
}

describe('the table', () => {
  it('is anchored on the KEY times: 64 cells per segment, boundaries independent of any clip', () => {
    const t = rampTable(RAMP);
    expect(t.rl.length).toBe(3 * CELLS_PER_SEGMENT);
    expect(t.b[0]).toBe(0);
    expect(t.b[CELLS_PER_SEGMENT]).toBe(4);
    expect(t.b[2 * CELLS_PER_SEGMENT]).toBe(10);
    expect(t.b[3 * CELLS_PER_SEGMENT]).toBe(14);
    for (let i = 1; i < t.cum.length; i++) expect(t.cum[i]).toBeGreaterThan(t.cum[i - 1]);
  });
  it('is memoised per array (cache identity) and rebuilt for a new array', () => {
    expect(rampTable(RAMP)).toBe(rampTable(RAMP));
    expect(rampTable([...RAMP])).not.toBe(rampTable(RAMP));
  });
  it('one key is a constant speed; speeds clamp to 0.25..4', () => {
    expect(rampOffset([k(0, 2)], 6)).toBeCloseTo(3, 12);
    expect(speedAt([k(0, 100)], 0)).toBe(4);
    expect(speedAt([k(0, 0.001)], 0)).toBe(0.25);
  });
});

describe('integral and inverse', () => {
  it('T is continuous at the key times and linear outside the keys', () => {
    expect(rampOffset(RAMP, 0)).toBe(0);
    const before = rampOffset(RAMP, -2);
    expect(before).toBeCloseTo(-2 / 0.5, 12);
    expect(rampOffset(RAMP, 16) - rampOffset(RAMP, 14)).toBeCloseTo(2 / 2, 12);
  });
  it('I8: the duration equals Simpson\'s integral of 1/s within 1e-3 s (the 64-cell definition is the contract; Simpson is a sanity bound)', () => {
    for (const [a, b] of [[0, 14], [1, 9], [2.5, 12.25], [4, 10]]) {
      const c = clip({ in: a, out: b, speedKeys: RAMP });
      expect(Math.abs(clipDuration(c) - simpson(RAMP, a, b))).toBeLessThan(1e-3);
    }
  });
  it('I1: inverse round trip within 1e-9 s, forward and reverse, many random clips', () => {
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * 9;
      const b = a + 0.5 + rnd() * 8;
      const c = clip({ in: a, out: b, speedKeys: RAMP, ...(i % 2 ? { reverse: true as const } : {}) });
      const t = c.start + rnd() * clipDuration(c);
      expect(Math.abs(timelineTimeAt(c, sourceTimeAt(c, t)) - t)).toBeLessThan(1e-9);
      const u = a + rnd() * (b - a);
      expect(Math.abs(sourceTimeAt(c, timelineTimeAt(c, u)) - u)).toBeLessThan(1e-9);
    }
  });
  it('rampInverse agrees with a plain bisection on T (the independent oracle)', () => {
    for (let i = 0; i < 300; i++) {
      const y = -3 + rnd() * 30;
      let lo = -100;
      let hi = 200;
      for (let n = 0; n < 300; n++) {
        const mid = (lo + hi) / 2;
        if (rampOffset(RAMP, mid) < y) lo = mid;
        else hi = mid;
      }
      expect(Math.abs(rampInverse(RAMP, y) - (lo + hi) / 2)).toBeLessThan(1e-9);
    }
  });
  it('I2/I3: monotone, and the clip edges are exactly in/out (===)', () => {
    for (const reverse of [false, true]) {
      const c = clip({ in: 1.3, out: 11.7, speedKeys: RAMP, ...(reverse ? { reverse: true as const } : {}) });
      const D = clipDuration(c);
      let prev = sourceAtOffset(c, 0);
      expect(prev).toBe(reverse ? c.out : c.in);
      expect(sourceAtOffset(c, D)).toBe(reverse ? c.in : c.out);
      for (let n = 1; n <= 200; n++) {
        const cur = sourceAtOffset(c, (D * n) / 200);
        expect(reverse ? cur < prev : cur > prev).toBe(true);
        prev = cur;
      }
    }
  });
});

describe('I3 (random ramp clips): the start edge is exactly the first footage time played', () => {
  it('500 random clips, forward and reverse: sourceAtOffset(0) === in / out and sourceAtOffset(D) === out / in', () => {
    for (let i = 0; i < 500; i++) {
      const a = rnd() * 12;
      const b = a + 0.3 + rnd() * 6;
      const reverse = i % 2 === 1;
      const c = clip({ in: a, out: b, speedKeys: RAMP, ...(reverse ? { reverse: true as const } : {}) });
      expect(sourceAtOffset(c, 0)).toBe(reverse ? b : a);
      expect(sourceAtOffset(c, clipDuration(c))).toBe(reverse ? a : b);
    }
  });
});

describe('I5: split invariance (footage-anchored ramps)', () => {
  it('each half maps exactly like the original, forward and reverse', () => {
    for (let i = 0; i < 400; i++) {
      const reverse = i % 2 === 1;
      const a = rnd() * 6;
      const b = a + 2 + rnd() * 6;
      const c = clip({ in: a, out: b, start: 3, speedKeys: RAMP, ...(reverse ? { reverse: true as const } : {}) });
      const D = clipDuration(c);
      const tc = c.start + (0.05 + 0.9 * rnd()) * D; // the cut (timeline)
      const cut = sourceTimeAt(c, tc);
      const left = reverse ? { ...c, in: cut } : { ...c, out: cut };
      const right = reverse ? { ...c, start: tc, out: cut } : { ...c, start: tc, in: cut };
      expect(Math.abs(clipDuration(left) + clipDuration(right) - D)).toBeLessThan(1e-9);
      for (let n = 0; n < 8; n++) {
        const tl = c.start + rnd() * (tc - c.start);
        const tr = tc + rnd() * (c.start + D - tc);
        expect(Math.abs(sourceTimeAt(left, tl) - sourceTimeAt(c, tl))).toBeLessThan(1e-9);
        expect(Math.abs(sourceTimeAt(right, tr) - sourceTimeAt(c, tr))).toBeLessThan(1e-9);
      }
    }
  });
  it('a grid anchored on `in` would break it: a trim moves no boundary', () => {
    const before = Array.from(rampTable(RAMP).b);
    clipDuration(clip({ in: 2.2, out: 6.1, speedKeys: RAMP }));
    clipDuration(clip({ in: 0.4, out: 13, speedKeys: RAMP }));
    expect(Array.from(rampTable(RAMP).b)).toEqual(before);
  });
});

describe('I6: trim then untrim returns the same clip', () => {
  it('trimming a ramp clip by moving `in` and back restores its length within 1e-9', () => {
    const c = clip({ in: 2, out: 9, speedKeys: RAMP });
    const D = clipDuration(c);
    const trimmed = { ...c, in: 3.1 };
    expect(clipDuration(trimmed)).toBeLessThan(D);
    expect(Math.abs(clipDuration({ ...trimmed, in: 2 }) - D)).toBeLessThan(1e-12);
  });
});

describe('eases', () => {
  it('an overshooting ease (back/elastic/spring) can never push the speed outside 0.25..4, so durations stay finite', () => {
    for (const kind of ['back', 'elastic', 'bounce'] as const) {
      const keys = [k(0, 0.25, kind), k(5, 4, kind), k(10, 0.25)];
      for (let u = -1; u <= 11; u += 0.05) {
        const s = speedAt(keys, u);
        expect(s).toBeGreaterThanOrEqual(0.25);
        expect(s).toBeLessThanOrEqual(4);
      }
      const d = clipDuration(clip({ in: 0, out: 10, speedKeys: keys }));
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(10 / 4 - 1e-9);
      expect(d).toBeLessThan(10 / 0.25 + 1e-9);
    }
  });
  it('a hold ease keeps its step: the speed stays constant until the next key', () => {
    const keys = [k(0, 1, 'hold'), k(4, 4)];
    const c = clip({ in: 0, out: 4, speedKeys: keys });
    expect(clipDuration(c)).toBeCloseTo(4, 6); // speed 1 the whole way (the last cell samples the LEFT limit)
    expect(rampOffset(keys, 2)).toBeCloseTo(2, 6);
  });
});

describe('extrapolation beyond the edges (handles)', () => {
  it('continues along the ramp itself (so a trimmed clip agrees with its duration) and round-trips', () => {
    const c = clip({ in: 4, out: 10, start: 10, speedKeys: RAMP });
    const end = c.start + clipDuration(c);
    for (const t of [8, 9, 9.99, end + 0.5, end + 1]) expect(timelineTimeAt(c, sourceTimeAt(c, t))).toBeCloseTo(t, 8);
    expect(sourceTimeAt(c, 9)).toBeLessThan(4);
    expect(sourceTimeAt(c, end + 1)).toBeGreaterThan(10);
    expect(sourceTimeAt(c, c.start)).toBe(4);
    expect(sourceTimeAt(c, end)).toBeCloseTo(10, 9);
  });
});
