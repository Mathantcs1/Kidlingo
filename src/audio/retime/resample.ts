// The resampler of audio retiming (Plan 5D Task 8): output sample k (virtual time (k + 0.5) / rate, a GLOBAL index) is the footage
// signal read at u = sourceAtOffset(clip, k / rate) with a Blackman-windowed sinc whose cut-off follows the local speed
// (so speeding up is band-limited, no aliasing). Every output sample depends only on its own index and the input samples
// around u, so any slicing of the output into windows gives bit-identical samples (given enough input margin).
import { sourceAtOffset } from '../../core/clipTime';
import { speedAt } from '../../core/speedRamp';
import type { Clip } from '../../core/model';
import { KERNEL_HALF } from './retimeMath';

const RES = 512;
const TABLE = (() => {
  const t = new Float32Array(KERNEL_HALF * RES + 2);
  for (let i = 0; i < t.length; i++) {
    const x = i / RES;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const r = x / KERNEL_HALF;
    const win = r >= 1 ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * r) + 0.08 * Math.cos(2 * Math.PI * r);
    t[i] = sinc * win;
  }
  return t;
})();

/** The windowed-sinc kernel at distance `x` (>= 0, in kernel units) by linear interpolation of the table. */
function kernel(x: number): number {
  if (x >= KERNEL_HALF) return 0;
  const p = x * RES;
  const i = Math.floor(p);
  const f = p - i;
  return TABLE[i] * (1 - f) + TABLE[i + 1] * f;
}

/** The speed the footage plays at, footage seconds per timeline second, at footage time `u`. */
function speedOf(c: Clip, u: number): number {
  return c.speedKeys && c.speedKeys.length > 0 ? speedAt(c.speedKeys, u) : (c.speed ?? 1);
}

export interface ResampleArgs {
  clip: Clip;
  /** Input channels; sample j is the footage sample with global index `inFirst + j`. */
  input: Float32Array[];
  inFirst: number;
  rate: number;
  /** Global index of the first output sample. */
  outFirst: number;
  outLength: number;
}

export function resample({ clip, input, inFirst, rate, outFirst, outLength }: ResampleArgs): Float32Array[] {
  const out = input.map(() => new Float32Array(outLength));
  const n = input[0]?.length ?? 0;
  for (let k = 0; k < outLength; k++) {
    // Samples are read at their CENTRES (k + 0.5): a reversed clip is then the exact mirror image of the footage sample grid.
    const u = sourceAtOffset(clip, (outFirst + k + 0.5) / rate);
    const s = speedOf(clip, u);
    const fc = s > 1 ? 1 / s : 1; // cut-off relative to the input Nyquist
    const half = KERNEL_HALF / fc;
    const g = u * rate - 0.5 - inFirst;
    const j0 = Math.ceil(g - half);
    const j1 = Math.floor(g + half);
    let norm = 0;
    const acc = new Float64Array(input.length);
    for (let j = j0; j <= j1; j++) {
      const w = fc * kernel(Math.abs(g - j) * fc);
      norm += w;
      if (j < 0 || j >= n) continue;
      for (let c = 0; c < input.length; c++) acc[c] += w * input[c][j];
    }
    const inv = norm !== 0 ? 1 / norm : 0;
    for (let c = 0; c < input.length; c++) out[c][k] = acc[c] * inv;
  }
  return out;
}
