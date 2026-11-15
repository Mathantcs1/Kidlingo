// Plan 5D Task 8: the resampler of audio retiming (pure). Pitch follows speed, no aliasing when sped up, reversal is exact and
// any slicing of the output into windows gives bit-identical samples.
import { describe, it, expect } from 'vitest';
import { clipDuration } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { resample } from '../src/audio/retime/resample';
import { footageToDecode, isRetimedAudio } from '../src/audio/retime/retimeMath';

const RATE = 48000;
const lin = { kind: 'linear' as const };
const mk = (extra: Partial<Clip> = {}): Clip => ({
  id: 'a', mediaId: 'm', kind: 'audio', start: 0, in: 0, out: 1, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const tone = (hz: number, seconds: number): Float32Array => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / RATE));

/** Amplitude of frequency `hz` in `x` (single-bin DFT over the whole signal, normalised to a unit sine = 1). */
function amp(x: Float32Array, hz: number, skip = 0): number {
  let re = 0;
  let im = 0;
  const n = x.length - 2 * skip;
  for (let i = skip; i < x.length - skip; i++) {
    const p = (2 * Math.PI * hz * i) / RATE;
    re += x[i] * Math.cos(p);
    im += x[i] * Math.sin(p);
  }
  return (2 * Math.hypot(re, im)) / n;
}

const run = (clip: Clip, input: Float32Array, outFirst = 0, outLength?: number): Float32Array =>
  resample({ clip, input: [input], inFirst: 0, rate: RATE, outFirst, outLength: outLength ?? Math.round(clipDuration(clip) * RATE) })[0];

describe('resample', () => {
  it('a 1 kHz tone at 2x is a 2 kHz tone of half the length; at 0.5x a 500 Hz tone of twice the length', () => {
    const x = tone(1000, 1);
    const fast = run(mk({ speed: 2 }), x);
    expect(fast.length).toBe(RATE / 2);
    expect(amp(fast, 2000, 400)).toBeGreaterThan(0.98);
    expect(amp(fast, 1000, 400)).toBeLessThan(0.02);
    const slow = run(mk({ speed: 0.5 }), x);
    expect(slow.length).toBe(RATE * 2);
    expect(amp(slow, 500, 400)).toBeGreaterThan(0.98);
  });
  it('does not alias when sped up: a 10 kHz tone at 4x (40 kHz) leaves nothing at its 8 kHz alias (-40 dB)', () => {
    const y = run(mk({ speed: 4 }), tone(10000, 1));
    expect(amp(y, 8000, 400)).toBeLessThan(0.01);
  });
  it('reverse at speed 1 is the input reversed (exactly, on the sample grid)', () => {
    const x = Float32Array.from({ length: RATE }, (_, i) => Math.sin(i * 0.01) * 0.5 + (i % 7) * 0.01);
    const y = run(mk({ reverse: true }), x);
    for (const k of [0, 1, 2, 1000, 20000, RATE - 40]) expect(y[k]).toBeCloseTo(x[RATE - 1 - k], 5);
  });
  it('slicing the output into windows gives bit-identical samples (input windows differ)', () => {
    const clip = mk({ speed: 1.7, in: 0.1, out: 0.9 });
    const x = tone(440, 1);
    const whole = run(clip, x);
    const cut = 12345;
    const margin = 200;
    const sub = (from: number, to: number): Float32Array => {
      const lo = Math.max(0, Math.floor(from * 1.7) + 4800 - margin);
      const hi = Math.min(x.length, Math.ceil(to * 1.7) + 4800 + margin);
      return resample({ clip, input: [x.subarray(lo, hi)], inFirst: lo, rate: RATE, outFirst: from, outLength: to - from })[0];
    };
    const a = sub(0, cut);
    const b = sub(cut, whole.length);
    expect(Array.from(a)).toEqual(Array.from(whole.subarray(0, cut)));
    expect(Array.from(b)).toEqual(Array.from(whole.subarray(cut)));
  });
  it('a ramp stretches by the integral: slow then fast changes the tone progressively', () => {
    const ramp = [{ t: 0, v: 1, ease: lin }, { t: 1, v: 2, ease: lin }];
    const clip = mk({ speedKeys: ramp });
    const y = run(clip, tone(1000, 1));
    expect(y.length).toBe(Math.round(clipDuration(clip) * RATE));
    const early = y.subarray(0, 4000);
    const late = y.subarray(y.length - 4000);
    expect(amp(early, 1000)).toBeGreaterThan(amp(early, 2000));
    expect(amp(late, 2000)).toBeGreaterThan(amp(late, 1000));
  });
});

describe('retimeMath', () => {
  it('only speed, reverse or a ramp retime audio; freeze and identity do not', () => {
    expect(isRetimedAudio(mk())).toBe(false);
    expect(isRetimedAudio(mk({ speed: 2 }))).toBe(true);
    expect(isRetimedAudio(mk({ reverse: true }))).toBe(true);
    expect(isRetimedAudio(mk({ speedKeys: [{ t: 0, v: 1, ease: lin }, { t: 1, v: 2, ease: lin }] }))).toBe(true);
    expect(isRetimedAudio(mk({ kind: 'video', freeze: { at: 0.5 } }))).toBe(false);
  });
  it('decodes the footage of the virtual range plus a kernel margin, kept inside in/out', () => {
    const c = mk({ speed: 2, in: 1, out: 5 });
    const [a, b] = footageToDecode(c, 0.5, 1, 48000);
    expect(a).toBeLessThan(2);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeGreaterThan(3);
    expect(b).toBeLessThanOrEqual(5);
    const [x, y] = footageToDecode(c, 0, 2, 48000);
    expect([x, y]).toEqual([1, 5]);
  });
});
