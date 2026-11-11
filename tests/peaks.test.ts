import { describe, expect, it } from 'vitest';
import { accumulatePeaks, finishPeaks, newAccumulator, peakAt } from '../src/media/peaks';

const sine = (n: number, rate: number): Float32Array =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate));

function run(chunks: Float32Array[], rate: number) {
  const acc = newAccumulator();
  for (const c of chunks) accumulatePeaks(acc, c, rate);
  return finishPeaks(acc);
}

describe('peaks', () => {
  it('a full-scale 1 s sine gives >= 99 buckets spanning -1..1', () => {
    const p = run([sine(48000, 48000)], 48000);
    expect(p.data.length / 2).toBeGreaterThanOrEqual(99);
    expect(p.duration).toBeCloseTo(1, 6);
    const r = peakAt(p, 0, 1);
    expect(Math.abs(r.max - 1)).toBeLessThanOrEqual(1 / 255);
    expect(Math.abs(r.min + 1)).toBeLessThanOrEqual(1 / 255);
  });

  it('silence is all 128 with no NaN', () => {
    const p = run([new Float32Array(48000)], 48000);
    expect(p.data.length).toBeGreaterThan(0);
    expect([...p.data].every((v) => v === 128)).toBe(true);
    expect(peakAt(p, 0, 1)).toEqual({ min: 0, max: 0 });
  });

  it('chunk boundaries do not change the result', () => {
    const s = sine(48000, 48000);
    const whole = run([s], 48000);
    const split = run([s.subarray(0, 1234), s.subarray(1234, 30001), s.subarray(30001)], 48000);
    expect(split.duration).toBe(whole.duration);
    expect([...split.data]).toEqual([...whole.data]);
  });

  it('peakAt reads a sub-range', () => {
    const s = new Float32Array(48000);
    s.fill(0.5, 24000); // quiet first half, 0.5 in the second
    const p = run([s], 48000);
    expect(peakAt(p, 0, 0.4).max).toBe(0);
    expect(peakAt(p, 0.6, 1).max).toBeCloseTo(0.5, 1);
    expect(peakAt(p, 5, 6)).toEqual({ min: 0, max: 0 });
  });

  it('empty input has no duration and no data', () => {
    const p = run([], 48000);
    expect(p.duration).toBe(0);
    expect(p.data.length).toBe(0);
    expect(peakAt(p, 0, 1)).toEqual({ min: 0, max: 0 });
  });
});
