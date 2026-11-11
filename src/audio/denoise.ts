// Noise reduction (D4): an offline spectral gate over a decoded segment, before the clip's node graph (chain.ts).
// Pure TS STFT (1024 / hop 256, Hann analysis and synthesis, weighted overlap-add) with an in-file radix-2 FFT.

/** STFT frame length (samples). */
export const DENOISE_FRAME = 1024;
/** STFT hop (samples): 75 % overlap. */
export const DENOISE_HOP = 256;
/** Share of the quietest frames whose mean spectrum is the noise floor. */
const QUIET_SHARE = 0.1;
/** Lowest gain a bin is ever multiplied by (spectral floor: keeps some ambience, avoids "musical noise"). */
const GAIN_FLOOR = 0.1;
/** Over-subtraction at strength 1: the floor's mean magnitude × this is subtracted from every bin. */
const OVER = 2;
/** Frames quieter than this energy are digital silence and never define the noise floor. */
const SILENT = 1e-10;

const N = DENOISE_FRAME;
const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
const COS = Float64Array.from({ length: N / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / N));
const SIN = Float64Array.from({ length: N / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / N));
const BITS = Math.log2(N);
const REV = Uint16Array.from({ length: N }, (_, i) => {
  let r = 0;
  for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b);
  return r;
});

/** In-place forward FFT of size N (re, im); `inverse` conjugates the twiddles (no 1/N scaling). */
function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  const sign = inverse ? -1 : 1;
  for (let size = 2; size <= N; size *= 2) {
    const half = size / 2;
    const step = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = COS[k * step];
        const wi = sign * SIN[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** Loads the Hann-windowed frame starting at local sample `s` (zero outside the data) into re / im. */
function load(data: Float32Array, s: number, re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < N; i++) {
    const k = s + i;
    re[i] = k >= 0 && k < data.length ? data[k] * HANN[i] : 0;
    im[i] = 0;
  }
}

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

/** Mean magnitude spectrum (bins 0..N/2) of the quietest QUIET_SHARE of the frames lying wholly inside the data. */
function noiseFloor(data: Float32Array, starts: number[]): Float64Array {
  const inside = starts.filter((s) => s >= 0 && s + N <= data.length);
  const energy = (s: number): number => {
    let e = 0;
    for (let i = 0; i < N; i++) e += (data[s + i] * HANN[i]) ** 2;
    return e;
  };
  const ranked = inside.map((s) => [s, energy(s)] as const).filter(([, e]) => e > SILENT).sort((a, b) => a[1] - b[1]);
  const quiet = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * QUIET_SHARE))).map(([s]) => s);
  const floor = new Float64Array(N / 2 + 1);
  if (!ranked.length) return floor;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (const s of quiet) {
    load(data, s, re, im);
    fft(re, im);
    for (let k = 0; k <= N / 2; k++) floor[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]) / quiet.length;
  }
  return floor;
}

/**
 * Spectral-subtraction noise reduction of one channel. Each bin of each frame is scaled by
 * max(0.1, 1 − 2·strength·floor/|X|), the floor being the mean spectrum of the quietest 10 % of frames (digital
 * silence excluded), then the frames are overlap-added. Output length = input length. strength ≤ 0 returns an
 * equal copy; input shorter than one frame is returned unchanged (the same array). `origin` is the absolute
 * sample index of data[0] (frame grid, see frameStarts).
 */
export function denoiseChannel(data: Float32Array, sampleRate: number, strength: number, origin = 0): Float32Array {
  void sampleRate; // The gate works per bin; the rate is part of the interface for future frequency-aware tuning.
  if (data.length < N) return data;
  const s0 = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0));
  if (s0 <= 0) return Float32Array.from(data);
  const starts = frameStarts(data.length, origin);
  const floor = noiseFloor(data, starts);
  const sum = new Float64Array(data.length);
  const norm = new Float64Array(data.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const beta = OVER * s0;
  for (const s of starts) {
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
  }
  const out = new Float32Array(data.length);
  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-12 ? sum[i] / norm[i] : 0;
  return out;
}

/**
 * denoiseChannel on every channel of `buffer` (a new AudioBuffer of the same shape; `buffer` itself when shorter
 * than one frame or at strength 0). `origin` is the absolute
 * source sample index of the buffer's first sample, so pieces of one clip share their STFT frame grid.
 */
export function denoiseBuffer(buffer: AudioBuffer, strength: number, origin = 0): AudioBuffer {
  // Nothing to change: the same buffer (denoiseChannel would copy or return each channel as it is).
  if (buffer.length < DENOISE_FRAME || !(strength > 0)) return buffer;
  const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    // Long enough and strength > 0: always a fresh array on its own ArrayBuffer.
    const data = denoiseChannel(buffer.getChannelData(c), buffer.sampleRate, strength, origin) as Float32Array<ArrayBuffer>;
    out.copyToChannel(data, c);
  }
  return out;
}
