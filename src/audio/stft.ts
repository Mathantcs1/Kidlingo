// Shared STFT pieces of noise reduction (D4): frame size, hop, Hann window and an in-file radix-2 FFT.

/** STFT frame length (samples). */
export const DENOISE_FRAME = 1024;
/** STFT hop (samples): 75 % overlap. */
export const DENOISE_HOP = 256;

const N = DENOISE_FRAME;
export const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
const COS = Float64Array.from({ length: N / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / N));
const SIN = Float64Array.from({ length: N / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / N));
const BITS = Math.log2(N);
const REV = Uint16Array.from({ length: N }, (_, i) => {
  let r = 0;
  for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b);
  return r;
});

/** In-place FFT of size DENOISE_FRAME (re, im); `inverse` conjugates the twiddles (no 1/N scaling). */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
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
export function load(data: Float32Array, s: number, re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < N; i++) {
    const k = s + i;
    re[i] = k >= 0 && k < data.length ? data[k] * HANN[i] : 0;
    im[i] = 0;
  }
}

/** Energy of the Hann-windowed frame at local sample `s` (wholly inside the data). */
export function frameEnergy(data: Float32Array, s: number): number {
  let e = 0;
  for (let i = 0; i < N; i++) e += (data[s + i] * HANN[i]) ** 2;
  return e;
}
