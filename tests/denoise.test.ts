import { describe, it, expect } from 'vitest';
import { DENOISE_FRAME, denoiseChannel } from '../src/audio/denoise';

const SR = 48000;

/** Deterministic white noise in [-amp, amp) (mulberry32). */
function noise(n: number, amp: number, seed = 1): Float32Array {
  let a = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out[i] = amp * (2 * (((t ^ (t >>> 14)) >>> 0) / 4294967296) - 1);
  }
  return out;
}

const rms = (d: Float32Array, a: number, e: number): number => {
  let s = 0;
  for (let i = a; i < e; i++) s += d[i] * d[i];
  return Math.sqrt(s / (e - a));
};

/** Amplitude of the `f` Hz component over [a, e) (projection on sin and cos). */
function toneAmp(d: Float32Array, f: number, a: number, e: number): number {
  let s = 0;
  let c = 0;
  for (let i = a; i < e; i++) {
    const w = (2 * Math.PI * f * i) / SR;
    s += d[i] * Math.sin(w);
    c += d[i] * Math.cos(w);
  }
  return (2 * Math.hypot(s, c)) / (e - a);
}

const db = (r: number): number => 20 * Math.log10(r);

describe('denoiseChannel', () => {
  // 2 s of noise only, then 2 s of noise + a 0.3 amplitude 440 Hz tone.
  const n = 4 * SR;
  const input = noise(n, 0.05);
  for (let i = 2 * SR; i < n; i++) input[i] += 0.3 * Math.sin((2 * Math.PI * 440 * i) / SR);

  it('lowers noise-only audio by >= 6 dB at strength 0.8 and keeps the tone within 1.5 dB', () => {
    const out = denoiseChannel(input, SR, 0.8);
    const quiet = [Math.round(0.25 * SR), Math.round(1.75 * SR)] as const;
    const drop = db(rms(out, ...quiet) / rms(input, ...quiet));
    expect(drop).toBeLessThanOrEqual(-6);
    const loud = [Math.round(2.25 * SR), Math.round(3.75 * SR)] as const;
    expect(Math.abs(db(toneAmp(out, 440, ...loud) / toneAmp(input, 440, ...loud)))).toBeLessThan(1.5);
  });

  it('keeps the length and leaves nothing non-finite', () => {
    for (const len of [DENOISE_FRAME, DENOISE_FRAME + 1, 12345, n]) {
      const out = denoiseChannel(input.subarray(0, len), SR, 0.6);
      expect(out.length).toBe(len);
      expect(out.every(Number.isFinite)).toBe(true);
    }
  });

  it('strength 0 returns the same values (a copy, not the input)', () => {
    const out = denoiseChannel(input, SR, 0);
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });

  it('all-zero input stays all zero without NaN', () => {
    const out = denoiseChannel(new Float32Array(SR), SR, 1);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('input shorter than one frame is returned unchanged', () => {
    const short = input.subarray(0, DENOISE_FRAME - 1);
    expect(denoiseChannel(short, SR, 1)).toEqual(short);
  });

  it('frames are placed on the absolute sample grid (`origin`), so a cut piece matches the uncut one inside', () => {
    // Noise repeating every 256 samples has harmonics 4 bins apart, so a Hann frame sees the same magnitudes at any
    // phase: every piece estimates the same broadband floor. Clicks then make the per-frame gains differ, so only the
    // shared frame grid makes a piece agree with the uncut render.
    const period = noise(256, 0.05, 3);
    const sig = new Float32Array(3 * SR);
    for (let i = 0; i < sig.length; i++) sig[i] = period[i % 256];
    for (let c = 0.4 * SR; c < sig.length; c += 0.31 * SR) sig[Math.round(c)] += 0.9;
    const whole = denoiseChannel(sig, SR, 0.7);
    const a = 777;
    const [from, to] = [Math.round(0.3 * SR), Math.round(1.7 * SR)];
    const diff = (origin: number): number => {
      const piece = denoiseChannel(sig.subarray(a, a + 2 * SR), SR, 0.7, origin);
      let m = 0;
      for (let i = from; i < to; i++) m = Math.max(m, Math.abs(piece[i] - whole[a + i]));
      return m;
    };
    expect(diff(a)).toBeLessThan(1e-6);
    // The guard can fail: the same piece on its own grid differs.
    expect(diff(0)).toBeGreaterThan(1e-4);
  });
});
