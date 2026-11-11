import { describe, it, expect } from 'vitest';
import { DENOISE_FRAME, YIELD_FRAMES, denoiseChannel, denoiseChannelAsync } from '../src/audio/denoise';
import { PROBE_COUNT, PROBE_SECONDS, estimateNoise, profileProbes } from '../src/audio/denoiseProfile';
import { SR, db, noise, toneAmp } from './signal';

const tone = (n: number, amp: number, from = 0): Float32Array => {
  const out = new Float32Array(n);
  for (let i = from; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * 440 * i) / SR);
  return out;
};
const sum = (a: Float32Array, b: Float32Array): Float32Array => a.map((v, i) => v + b[i]);

describe('profileProbes (one noise profile per clip, ruling of review round 1)', () => {
  it('spreads PROBE_COUNT probes of PROBE_SECONDS evenly over [in, out]; a short clip is one probe', () => {
    const probes = profileProbes(2, 30);
    expect(probes).toHaveLength(PROBE_COUNT);
    expect(probes[0][0]).toBe(2);
    expect(probes[PROBE_COUNT - 1][1]).toBeCloseTo(30, 12);
    for (const [a, b] of probes) expect(b - a).toBeCloseTo(PROBE_SECONDS, 12);
    for (let i = 1; i < probes.length; i++) expect(probes[i][0]).toBeGreaterThan(probes[i - 1][1]);
    expect(profileProbes(2, 30)).toEqual(probes);
    expect(profileProbes(1, 1 + PROBE_COUNT * PROBE_SECONDS)).toEqual([[1, 1 + PROBE_COUNT * PROBE_SECONDS]]);
    expect(profileProbes(1, 1)).toEqual([]);
  });
});

describe('estimateNoise', () => {
  const brief = sum(noise(4 * SR, 0.05), tone(4 * SR, 0.3, 2 * SR));

  it('does not depend on probe order', () => {
    const probes = [0, 1, 2, 3].map((k) => brief.subarray(k * SR, k * SR + SR / 2));
    const a = estimateNoise(probes);
    const b = estimateNoise([...probes].reverse());
    expect(b.scale).toBe(a.scale);
    for (let k = 0; k < a.floor.length; k++) expect(b.floor[k]).toBeCloseTo(a.floor[k], 12);
  });

  it('stationarity guard: full strength with a noise-only region, none for steady material', () => {
    expect(estimateNoise([brief]).scale).toBe(1);
    expect(estimateNoise([sum(noise(4 * SR, 0.05), tone(4 * SR, 0.3))]).scale).toBe(0);
    expect(estimateNoise([tone(4 * SR, 0.3)]).scale).toBe(0);
    expect(estimateNoise([new Float32Array(SR)]).scale).toBe(0);
  });
});

describe('denoiseChannel with a profile', () => {
  it('leaves a steady 440 Hz tone (with noise, no pauses) within 1.5 dB at strength 0.8', () => {
    const input = sum(noise(4 * SR, 0.05), tone(4 * SR, 0.3));
    const out = denoiseChannel(input, SR, 0.8);
    const [a, e] = [Math.round(0.5 * SR), Math.round(3.5 * SR)];
    expect(Math.abs(db(toneAmp(out, 440, a, e) / toneAmp(input, 440, a, e)))).toBeLessThan(1.5);
  });

  it('a cut piece denoised with the clip profile equals the uncut render inside (non-stationary audio)', () => {
    // Noise, then a tone that steps from 0.1 to 0.4: a per-piece floor would differ from piece to piece.
    const sig = sum(noise(3 * SR, 0.05, 9), tone(3 * SR, 0.1));
    for (let i = 1.5 * SR; i < sig.length; i++) sig[i] += 0.3 * Math.sin((2 * Math.PI * 440 * i) / SR);
    for (let i = 0; i < 0.5 * SR; i++) sig[i] = noise(1, 0.05, i + 1)[0];
    const profile = estimateNoise([sig.subarray(0, SR / 2), sig.subarray(2 * SR, 2.5 * SR)]);
    const whole = denoiseChannel(sig, SR, 0.6, 0, profile);
    const a = 1.2 * SR + 77;
    const piece = denoiseChannel(sig.subarray(a, a + SR), SR, 0.6, a, profile);
    let m = 0;
    for (let i = DENOISE_FRAME; i < SR - DENOISE_FRAME; i++) m = Math.max(m, Math.abs(piece[i] - whole[a + i]));
    expect(m).toBeLessThan(1e-6);
    // Without the shared profile the piece estimates its own floor and differs.
    const own = denoiseChannel(sig.subarray(a, a + SR), SR, 0.6, a);
    let m2 = 0;
    for (let i = DENOISE_FRAME; i < SR - DENOISE_FRAME; i++) m2 = Math.max(m2, Math.abs(own[i] - whole[a + i]));
    expect(m2).toBeGreaterThan(1e-3);
  });
});

describe('denoiseChannelAsync', () => {
  it('yields to the event loop at least once per YIELD_FRAMES frames and equals the sync result', async () => {
    const input = sum(noise(3 * SR, 0.05), tone(3 * SR, 0.3, 1.5 * SR));
    let yields = 0;
    const out = await denoiseChannelAsync(input, SR, 0.7, 0, undefined, async () => {
      yields++;
    });
    const frames = Math.ceil(input.length / 256);
    expect(yields).toBeGreaterThanOrEqual(Math.floor(frames / YIELD_FRAMES));
    expect(yields).toBeGreaterThan(1);
    expect(out).toEqual(denoiseChannel(input, SR, 0.7));
  });
});
