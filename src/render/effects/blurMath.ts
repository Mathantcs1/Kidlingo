// The blur family's kernels and sizes (Plan 4 Task 7), shared by the shaders (shaders/blurFamily.ts, which upload
// these exact taps as uniform arrays) and the CPU references (blurRef.ts).
//
// Sizes: blur/glow `radius`, sharpen `radius` and pixelate `size` are in pixels of a 1080-ROW reference picture, like
// grain (looksMath `referenceScale`): working pixels = value × workingHeight / 1080, so a radius looks the same at any
// source resolution. (This supersedes D2's "clip pixels scaled by working / display size" for consistency with grain.)
//
// Gaussian: sigma = radius / 2 (SIGMA_PER_RADIUS), truncated at ±3 sigma and renormalised. A blur is one or more
// STAGES, each a separable horizontal then vertical pass with one kernel:
//   - sigma whose ±3 sigma reach fits 2 × MAX_SIDE_TAPS texels: one stage of LINEAR-SAMPLING taps. Texels k and k+1
//     (k odd) are fetched together at the weighted offset (k·g_k + (k+1)·g_{k+1}) / (g_k + g_{k+1}) with weight
//     g_k + g_{k+1}; GL LINEAR filtering (CLAMP_TO_EDGE) then returns exactly the discrete gaussian. ≤ 65 reads/pass.
//   - larger sigma: a pre-blur stage of sigma_pre = s (recursively, the same rule), then point taps every s texels
//     (s = ceil(reach / MAX_SIDE_TAPS), ≤ 32 per side) with sigma_main = sqrt(sigma² − s²). The pre-blur removes the
//     detail finer than the stride (its response at the stride's Nyquist frequency is e^(−π²/2) ≈ 0.7 %), so the
//     strided taps do not alias, and the variances add up to sigma². Every pass reads ≤ 65 texels at any radius.
// Blur works on PREMULTIPLIED values (never un-premultiplied: that is what avoids dark/bright fringes).
import { REFERENCE_ROWS } from './looksMath';

export interface Kernel {
  /** Tap offsets in texels (ascending, symmetric, 0 in the middle); fractional for linear-sampling taps. */
  offsets: number[];
  /** Tap weights (sum 1). */
  weights: number[];
}

/** sigma = radius × SIGMA_PER_RADIUS. */
export const SIGMA_PER_RADIUS = 0.5;
/** Kernels are cut at ±TRUNCATE_SIGMAS sigma (and renormalised). */
export const TRUNCATE_SIGMAS = 3;
/** Taps on each side of the centre in one pass (texture reads per pass ≤ 2 × MAX_SIDE_TAPS + 1). */
export const MAX_SIDE_TAPS = 32;
export const MAX_TAPS = 2 * MAX_SIDE_TAPS + 1;
/** Glow's soft threshold: the bright mask is smoothstep(threshold, threshold + GLOW_KNEE, luma). */
export const GLOW_KNEE = 0.1;
/** Added before flooring a pixelate block coordinate (exact block edges stay on the same side on every GPU). */
export const BLOCK_EPS = 1e-4;

/** value (1080-row pixels) × workingHeight / 1080; the value itself for a non-finite or non-positive height. */
const toWorking = (value: number, workingHeight: number): number =>
  Number.isFinite(workingHeight) && workingHeight > 0 ? (value * workingHeight) / REFERENCE_ROWS : value;

/** A blur/glow/sharpen radius (1080-row pixels) in working pixels. */
export const blurRadius = (radius: number, workingHeight: number): number => toWorking(radius, workingHeight);

/** The pixelate block edge in working pixels: 1 (the identity) at size ≤ 1 at every resolution, else ≥ 1. */
export function pixelBlock(size: number, workingHeight: number): number {
  if (!(size > 1)) return 1;
  return Math.max(1, toWorking(size, workingHeight));
}

const sigmaOf = (radius: number): number => (Number.isFinite(radius) && radius > 0 ? radius * SIGMA_PER_RADIUS : 0);
const reachOf = (sigma: number): number => Math.ceil(TRUNCATE_SIGMAS * sigma);
const strideOf = (sigma: number): number => Math.ceil(reachOf(sigma) / MAX_SIDE_TAPS);
const gauss = (x: number, sigma: number): number => Math.exp(-(x * x) / (2 * sigma * sigma));

/** The symmetric kernel of a centre weight and one side's [offset, weight] taps, normalised to sum 1. */
function symmetric(centre: number, side: [number, number][]): Kernel {
  const total = centre + 2 * side.reduce((s, [, w]) => s + w, 0);
  const rev = [...side].reverse();
  return {
    offsets: [...rev.map(([o]) => -o), 0, ...side.map(([o]) => o)],
    weights: [...rev.map(([, w]) => w / total), centre / total, ...side.map(([, w]) => w / total)],
  };
}

function linearKernel(sigma: number): Kernel {
  const reach = reachOf(sigma);
  const side: [number, number][] = [];
  for (let k = 1; k <= reach; k += 2) {
    const w1 = gauss(k, sigma);
    const w2 = k + 1 <= reach ? gauss(k + 1, sigma) : 0;
    if (w1 + w2 > 0) side.push([(k * w1 + (k + 1) * w2) / (w1 + w2), w1 + w2]);
  }
  return symmetric(1, side);
}

function stridedKernel(sigma: number, stride: number): Kernel {
  const side: [number, number][] = [];
  for (let k = 1; k <= Math.ceil((TRUNCATE_SIGMAS * sigma) / stride); k++) side.push([k * stride, gauss(k * stride, sigma)]);
  return symmetric(1, side);
}

const fitsOnePass = (sigma: number): boolean => reachOf(sigma) <= 2 * MAX_SIDE_TAPS;

/**
 * The single-pass kernel of `radius` (working pixels): linear-sampling taps of sigma = radius / 2; beyond the tap cap,
 * point taps every `stride` texels of the same sigma (blurStages adds the anti-alias pre-blur). Radius 0 (or not a
 * positive finite number) is the identity: one tap of weight 1.
 */
export function gaussianKernel(radius: number): Kernel {
  const sigma = sigmaOf(radius);
  if (sigma === 0) return { offsets: [0], weights: [1] };
  return fitsOnePass(sigma) ? linearKernel(sigma) : stridedKernel(sigma, strideOf(sigma));
}

function stagesOf(sigma: number): Kernel[] {
  if (sigma === 0) return [];
  if (fitsOnePass(sigma)) return [linearKernel(sigma)];
  const s = strideOf(sigma);
  return [...stagesOf(s), stridedKernel(Math.sqrt(sigma * sigma - s * s), s)];
}

/** The stages (each one horizontal + one vertical pass) of a gaussian blur of `radius` working pixels; [] at 0. */
export const blurStages = (radius: number): Kernel[] => stagesOf(sigmaOf(radius));
