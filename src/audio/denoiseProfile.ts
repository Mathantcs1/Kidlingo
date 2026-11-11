// DOM-free noise profile of noise reduction (D4, review ruling): ONE profile per clip, estimated from fixed probes
// spread over the clip's source range, so every render window (export 30 s, live 20 s, tests 1 s) uses the same one.
import { DENOISE_FRAME, DENOISE_HOP, fft, frameEnergy, load } from './stft';

const N = DENOISE_FRAME;
/** Most probes decoded per clip to estimate its profile. */
export const PROBE_COUNT = 8;
/** Seconds per probe. */
export const PROBE_SECONDS = 0.5;
/** Share of the quietest frames whose mean spectrum is the noise floor. */
const QUIET_SHARE = 0.1;
/** Frames quieter than this energy are digital silence and never define the noise floor. */
const SILENT = 1e-10;
/** Percentile of frame energy taken as the material's typical level for the stationarity guard. */
const TYPICAL = 0.75;
/** Guard: below LOW dB between typical and quiet frames no reduction; full reduction from HIGH dB; linear between. */
const LOW_DB = 3;
const HIGH_DB = 10;

/** One channel's noise: the floor's magnitude spectrum (bins 0..N/2) and the stationarity guard's scale (0..1). */
export interface ChannelNoise {
  floor: Float64Array;
  scale: number;
}

/**
 * Source ranges [from, to) of the probes of a clip [inPoint, outPoint): the whole clip when it is no longer than
 * PROBE_COUNT probes, else PROBE_COUNT probes of PROBE_SECONDS, evenly spaced from the in to the out point.
 */
export function profileProbes(inPoint: number, outPoint: number): [number, number][] {
  const span = outPoint - inPoint;
  if (!(span > 0)) return [];
  if (span <= PROBE_COUNT * PROBE_SECONDS) return [[inPoint, outPoint]];
  const gap = (span - PROBE_SECONDS) / (PROBE_COUNT - 1);
  return Array.from({ length: PROBE_COUNT }, (_, k) => {
    const from = k === PROBE_COUNT - 1 ? outPoint - PROBE_SECONDS : inPoint + k * gap;
    return [from, from + PROBE_SECONDS] as [number, number];
  });
}

/**
 * The noise of one channel from its probes: the mean magnitude spectrum of the quietest 10 % of the whole frames
 * (each probe on its own hop grid; digital silence excluded), ranked by energy, so probe order does not matter.
 *
 * Stationarity guard: spectral subtraction needs a noise-only region. When the typical frame (75th percentile of
 * energy) is less than HIGH_DB louder than the quiet frames, the material is steady (a held tone, continuous music
 * or speech without pauses) and its "floor" is the signal itself, so the reduction is scaled down linearly, to none
 * at LOW_DB or less. A clip of noise only is therefore left as is too.
 */
export function estimateNoise(probes: readonly Float32Array[]): ChannelNoise {
  const frames: { data: Float32Array; s: number; e: number }[] = [];
  for (const data of probes) {
    for (let s = 0; s + N <= data.length; s += DENOISE_HOP) {
      const e = frameEnergy(data, s);
      if (e > SILENT) frames.push({ data, s, e });
    }
  }
  const floor = new Float64Array(N / 2 + 1);
  if (!frames.length) return { floor, scale: 0 };
  frames.sort((a, b) => a.e - b.e);
  const quiet = frames.slice(0, Math.max(1, Math.ceil(frames.length * QUIET_SHARE)));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let quietEnergy = 0;
  for (const { data, s, e } of quiet) {
    quietEnergy += e / quiet.length;
    load(data, s, re, im);
    fft(re, im);
    for (let k = 0; k <= N / 2; k++) floor[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]) / quiet.length;
  }
  const typical = frames[Math.min(frames.length - 1, Math.floor(frames.length * TYPICAL))].e;
  const gapDb = 10 * Math.log10(typical / quietEnergy);
  const scale = Math.min(1, Math.max(0, (gapDb - LOW_DB) / (HIGH_DB - LOW_DB)));
  return { floor, scale };
}
