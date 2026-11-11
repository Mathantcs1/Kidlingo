// Noise reduction (D4): an offline spectral gate over a decoded segment, before the clip's node graph (chain.ts).
// Pure TS STFT (1024 / hop 256, Hann analysis and synthesis, weighted overlap-add, see stft.ts). The noise floor
// comes from the clip's profile (denoiseProfile.ts / denoiseSource.ts), the same for every render window.
import { estimateNoise } from './denoiseProfile';
import type { ChannelNoise } from './denoiseProfile';
import { DENOISE_FRAME, DENOISE_HOP, HANN, fft, load } from './stft';

export { DENOISE_FRAME, DENOISE_HOP } from './stft';

/** STFT frames processed between two yields of the async variant (about 20 ms of work at 48 kHz). */
export const YIELD_FRAMES = 200;
/** Lowest gain a bin is ever multiplied by (spectral floor: keeps some ambience, avoids "musical noise"). */
const GAIN_FLOOR = 0.1;
/** Over-subtraction at strength 1: the floor's mean magnitude × this is subtracted from every bin. */
const OVER = 2;

const N = DENOISE_FRAME;

/**
 * Local start samples of every frame overlapping `data`. Frames sit on the absolute grid of multiples of the hop,
 * `origin` being the absolute index of data[0], so two pieces of the same source share their frames.
 */
function frameStarts(length: number, origin: number): number[] {
  const first = Math.ceil((origin - N + 1) / DENOISE_HOP) * DENOISE_HOP - origin;
  const out: number[] = [];
  for (let s = first; s < length; s += DENOISE_HOP) out.push(s);
  return out;
}

/**
 * The spectral gate as a generator that pauses after every YIELD_FRAMES frames and returns the output (see
 * denoiseChannel for the maths). `out` is null when there is nothing to change.
 */
function* gate(data: Float32Array, strength: number, origin: number, noise?: ChannelNoise): Generator<void, Float32Array | null> {
  if (data.length < N) return null;
  const s0 = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0));
  if (s0 <= 0) return Float32Array.from(data);
  const { floor, scale } = noise ?? estimateNoise([data]);
  const beta = OVER * s0 * scale;
  if (beta <= 0) return Float32Array.from(data);
  const sum = new Float64Array(data.length);
  const norm = new Float64Array(data.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let done = 0;
  for (const s of frameStarts(data.length, origin)) {
    load(data, s, re, im);
    fft(re, im);
    for (let k = 0; k <= N / 2; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const g = Math.max(GAIN_FLOOR, 1 - (beta * floor[k]) / Math.max(mag, 1e-30));
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < N / 2) {
        re[N - k] *= g;
        im[N - k] *= g;
      }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      const j = s + i;
      if (j < 0 || j >= data.length) continue;
      sum[j] += (re[i] / N) * HANN[i];
      norm[j] += HANN[i] * HANN[i];
    }
    if (++done % YIELD_FRAMES === 0) yield;
  }
  const out = new Float32Array(data.length);
  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-12 ? sum[i] / norm[i] : 0;
  return out;
}

/**
 * Spectral-subtraction noise reduction of one channel. Each bin of each frame is scaled by
 * max(0.1, 1 − 2·strength·scale·floor/|X|), then the frames are overlap-added. `noise` is the clip's profile; when
 * absent it is estimated from `data` itself (estimateNoise: quietest 10 % of frames, stationarity guard `scale`).
 * Output length = input length. strength ≤ 0 (or a guard scale of 0) returns an equal copy; input shorter than one
 * frame is returned unchanged (the same array). `origin` is the absolute sample index of data[0] (frame grid).
 */
export function denoiseChannel(data: Float32Array, sampleRate: number, strength: number, origin = 0, noise?: ChannelNoise): Float32Array {
  void sampleRate; // The gate works per bin; the rate is part of the interface for future frequency-aware tuning.
  const steps = gate(data, strength, origin, noise);
  for (let r = steps.next(); ; r = steps.next()) if (r.done) return r.value ?? data;
}

/** A macrotask turn: lets input, rendering and audio callbacks run between chunks of work. */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}

/** denoiseChannel awaiting `yieldNow` after every YIELD_FRAMES frames, so no single task runs long. */
export async function denoiseChannelAsync(
  data: Float32Array,
  sampleRate: number,
  strength: number,
  origin = 0,
  noise?: ChannelNoise,
  yieldNow: () => Promise<void> = nextTask,
): Promise<Float32Array> {
  void sampleRate;
  const steps = gate(data, strength, origin, noise);
  for (let r = steps.next(); ; r = steps.next()) {
    if (r.done) return r.value ?? data;
    await yieldNow();
  }
}

/**
 * denoiseChannelAsync on every channel of `buffer` with the clip's per-channel `profile` (the last entry serves
 * extra channels; estimated from the data when absent): a new AudioBuffer of the same shape, or `buffer` itself
 * when shorter than one frame or at strength 0.
 */
export async function denoiseBuffer(
  buffer: AudioBuffer,
  strength: number,
  origin = 0,
  profile?: readonly ChannelNoise[],
  yieldNow: () => Promise<void> = nextTask,
): Promise<AudioBuffer> {
  if (buffer.length < N || !(strength > 0)) return buffer;
  const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const noise = profile?.length ? profile[Math.min(c, profile.length - 1)] : undefined;
    const data = await denoiseChannelAsync(buffer.getChannelData(c), buffer.sampleRate, strength, origin, noise, yieldNow);
    // Long enough and strength > 0: always a fresh array on its own ArrayBuffer.
    out.copyToChannel(data as Float32Array<ArrayBuffer>, c);
  }
  return out;
}
