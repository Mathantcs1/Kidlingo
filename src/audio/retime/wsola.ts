// Pitch-preserving time stretch (Plan 5D Task 9): block-anchored WSOLA. Output block b is the overlap-add (Hann, 50 %) of
// grain b and grain b + 1; grain b is read from the footage at its nominal position (the time map) shifted by the offset
// that best continues the previous grain. The offsets form a chain that restarts (offset 0) at every ANCHOR block of a
// GLOBAL grid, so any slice of the output is a pure function of the footage: rendering windows in any order or subset gives
// identical samples. A restart costs one mild phase seam per ANCHOR_SECONDS (WSOLA's known limit).
import { sourceAtOffset } from '../../core/clipTime';
import type { ResampleArgs } from './resample';

/** Seconds between chain restarts. */
export const ANCHOR_SECONDS = 2;

export interface Geometry {
  /** Output hop in samples (a grain is 2 hops long). */
  hop: number;
  /** Largest offset (samples) a grain may be shifted by, each way. */
  search: number;
  /** Blocks between chain restarts. */
  anchor: number;
}

export function geometry(rate: number): Geometry {
  const hop = Math.max(16, Math.round(rate * 0.015));
  return { hop, search: Math.round(hop / 2), anchor: Math.max(1, Math.round((ANCHOR_SECONDS * rate) / hop)) };
}

/** The first output block a chain restart before `block` begins at (the grid is global: multiples of `anchor`). */
export const chainStartBlock = (g: Geometry, block: number): number => Math.floor(block / g.anchor) * g.anchor;

/** Virtual-time range [from, to) (seconds) whose footage a render of output samples [first, first + length) reads: the chain from its restart, plus the grains past the end. */
export function stretchVirtualSpan(rate: number, first: number, length: number): [number, number] {
  const g = geometry(rate);
  const bLo = Math.floor(first / g.hop);
  const bHi = Math.floor((first + Math.max(1, length) - 1) / g.hop) + 1;
  const start = Math.max(0, (chainStartBlock(g, bLo) - 1) * g.hop);
  return [start / rate, ((bHi + 1) * g.hop) / rate];
}

const DECIMATE = 4;

/** Similarity of `ref[0..len)` with `x` read from `at` (zero outside), normalised by the candidate's energy. */
function score(x: Float32Array, ref: Float32Array, at: number, len: number, step: number): number {
  let dot = 0;
  let en = 1e-9;
  for (let i = 0; i < len; i += step) {
    const j = at + i;
    const v = j >= 0 && j < x.length ? x[j] : 0;
    dot += ref[i] * v;
    en += v * v;
  }
  return dot / Math.sqrt(en);
}

/** The offset in [-search, search] whose grain at `nominal + offset` best continues `ref` (0 on silence and ties). */
function bestOffset(x: Float32Array, ref: Float32Array, nominal: number, len: number, search: number): number {
  let best = 0;
  let bestScore = score(x, ref, nominal, len, DECIMATE);
  for (let d = -search; d <= search; d += DECIMATE) {
    const s = score(x, ref, nominal + d, len, DECIMATE);
    if (s > bestScore + 1e-12) {
      bestScore = s;
      best = d;
    }
  }
  let fine = best;
  let fineScore = score(x, ref, nominal + best, len, 1);
  for (let d = Math.max(-search, best - DECIMATE + 1); d <= Math.min(search, best + DECIMATE - 1); d++) {
    const s = score(x, ref, nominal + d, len, 1);
    if (s > fineScore + 1e-12) {
      fineScore = s;
      fine = d;
    }
  }
  return fine;
}

export function stretch({ clip, input, inFirst, rate, outFirst, outLength }: ResampleArgs): Float32Array[] {
  const g = geometry(rate);
  const { hop } = g;
  const n = input[0]?.length ?? 0;
  const reverse = clip.reverse === true;
  // A reversed clip is stretched along the mirrored footage, so the grains always read forward.
  const chans = reverse ? input.map((c) => Float32Array.from(c).reverse()) : input;
  const mono = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) mono[i] += c[i] / chans.length;
  const nominal = (block: number): number => {
    const k = (block - 1) * hop; // the grain's first output sample
    const local = sourceAtOffset(clip, (k + 0.5) / rate) * rate - 0.5 - inFirst;
    return Math.round(reverse ? n - 1 - local : local);
  };
  const bLo = Math.floor(outFirst / hop);
  const bHi = Math.floor((outFirst + Math.max(1, outLength) - 1) / hop) + 1;
  const place = new Map<number, number>();
  const ref = new Float32Array(hop);
  let prev = 0;
  for (let b = chainStartBlock(g, bLo); b <= bHi; b++) {
    const a = nominal(b);
    let p = a;
    if (b % g.anchor !== 0) {
      const from = prev + hop;
      for (let i = 0; i < hop; i++) ref[i] = from + i >= 0 && from + i < n ? mono[from + i] : 0;
      p = a + bestOffset(mono, ref, a, hop, g.search);
    }
    prev = p;
    if (b >= bLo) place.set(b, p);
  }
  const win = new Float32Array(2 * hop);
  for (let i = 0; i < win.length; i++) win[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / hop);
  return chans.map((x) => {
    const out = new Float32Array(outLength);
    const read = (j: number): number => (j >= 0 && j < n ? x[j] : 0);
    for (let k = 0; k < outLength; k++) {
      const gk = outFirst + k;
      const b = Math.floor(gk / hop);
      const i = gk - b * hop; // 0..hop-1 inside block b: second half of grain b, first half of grain b + 1
      out[k] = read(place.get(b)! + hop + i) * win[hop + i] + read(place.get(b + 1)! + i) * win[i];
    }
    return out;
  });
}
