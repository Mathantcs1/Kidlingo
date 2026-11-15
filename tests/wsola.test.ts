// Plan 5D Task 9: block-anchored WSOLA (pure). Pitch is kept, overlap-add has unit gain, and any slicing / ordering of the
// output blocks gives identical samples.
import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { clipDuration } from '../src/core/clipTime';
import { chainStartBlock, geometry, stretch, stretchVirtualSpan } from '../src/audio/retime/wsola';

const RATE = 48000;
const mk = (extra: Partial<Clip> = {}): Clip => ({
  id: 'a', mediaId: 'm', kind: 'audio', start: 0, in: 0, out: 3, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const sine = (hz: number, seconds: number): Float32Array => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE));
const run = (clip: Clip, x: Float32Array, outFirst = 0, outLength?: number, inFirst = 0): Float32Array =>
  stretch({ clip, input: [x], inFirst, rate: RATE, outFirst, outLength: outLength ?? Math.round(clipDuration(clip) * RATE) })[0];

/** Dominant frequency of x[a, b) by a zero-crossing count (clean tones only). */
function freq(x: Float32Array, a: number, b: number): number {
  let crossings = 0;
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  return crossings / ((b - a) / RATE);
}

describe('stretch', () => {
  it('keeps 440 Hz at 0.25x, 0.5x, 1.5x, 2x and 4x (±2 Hz) and has the length of the mapped clip', () => {
    const x = sine(440, 3);
    for (const speed of [0.25, 0.5, 1.5, 2, 4]) {
      const clip = mk({ speed, out: speed === 0.25 ? 1 : 3 });
      const y = run(clip, x);
      expect(y.length).toBe(Math.round(clipDuration(clip) * RATE));
      const mid = Math.floor(y.length * 0.2);
      expect(Math.abs(freq(y, mid, y.length - mid) - 440), `speed ${speed}`).toBeLessThanOrEqual(2);
    }
  });
  it('overlap-add has unit gain: a DC input stays 1 in the interior', () => {
    const x = new Float32Array(3 * RATE).fill(1);
    const y = run(mk({ speed: 1.7 }), x);
    for (const k of [5000, 20000, 40000, y.length - 5000]) expect(Math.abs(y[k] - 1)).toBeLessThan(1e-5);
  });
  it('is a pure function of the footage: windows in any order equal one pass, bit for bit', () => {
    const clip = mk({ speed: 1.37 });
    const x = Float32Array.from({ length: 3 * RATE }, (_, i) => 0.4 * Math.sin(i * 0.031) + 0.2 * Math.sin(i * 0.0113 + 1) + 0.1 * Math.sin(i * 0.17));
    const whole = run(clip, x);
    const cuts = [0, 7001, 30011, 51234, 99999, whole.length];
    const order = [3, 0, 4, 2, 1];
    const pieces: Float32Array[] = [];
    for (const i of order) {
      const [a, b] = [cuts[i], cuts[i + 1]];
      const [vFrom, vTo] = stretchVirtualSpan(RATE, a, b - a);
      const lo = Math.max(0, Math.floor(clip.in * RATE + vFrom * RATE * 1.37) - 4000);
      const hi = Math.min(x.length, Math.ceil(vTo * RATE * 1.37) + 4000);
      pieces[i] = run(clip, x.subarray(lo, hi), a, b - a, lo);
    }
    expect(Array.from(pieces.flatMap((p) => Array.from(p)))).toEqual(Array.from(whole));
  });
  it('chains restart on a global grid', () => {
    const g = geometry(RATE);
    expect(chainStartBlock(g, g.anchor * 3 + 5)).toBe(g.anchor * 3);
    expect(chainStartBlock(g, 0)).toBe(0);
  });
  it('reverse keeps the pitch and mirrors a chirp: an up-chirp comes out as a down-chirp', () => {
    const n = 3 * RATE;
    const chirp = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * (300 * (i / RATE) + 100 * (i / RATE) ** 2)));
    const y = run(mk({ speed: 1.5, reverse: true }), chirp);
    const early = freq(y, 4000, 12000);
    const late = freq(y, y.length - 12000, y.length - 4000);
    expect(early).toBeGreaterThan(late + 100);
  });
});
