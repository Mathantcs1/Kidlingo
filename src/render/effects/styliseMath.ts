// The stylise effects' maths (Plan 4 Task 8): params → coefficients shared by the shaders' uniforms
// (shaders/stylise.ts) and the CPU references (styliseRef.ts) the e2e drift guards compare against. Positions are
// working-pixel CENTRE coordinates (pixel index + 0.5, y down), samples are clamped to the picture's pixel centres.
//
//   invert    straight colour mix(c, 1 − c, amount); alpha untouched.
//   mirror    mode 0 left→right (the right half shows the left half mirrored), 1 right→left, 2 top→bottom,
//             3 four-way (the top-left quadrant in all four). Moves premultiplied RGBA as a whole (alpha mirrors too).
//   rgbSplit  offset d = amount · referenceScale · (cos angle, sin angle) (y down, so the angle turns clockwise);
//             red is sampled at p − d (the red picture moves by +d), blue at p + d, green and alpha at p.
//   glitch    blocks GLITCH_ASPECT·b wide and b = max(1, blockSize · referenceScale) tall. A block is hit when
//             hash(frame, bx, by) < intensity · GLITCH_PROB; a hit block samples at a whole-pixel horizontal shift
//             ⌊(hash(frame, bx, by + SALT_SHIFT) − 0.5) · maxShift⌋ (maxShift = intensity · GLITCH_SHIFT · width),
//             with red at +split and blue at −split (⌊hash(…, by + SALT_SPLIT) · intensity · GLITCH_SPLIT · b⌋);
//             alpha comes with the shifted green sample, so a shifted block carries its transparency along.
//   vhs       wobble: rows in bands of max(1, WOBBLE_BAND · scale) shift horizontally by whole pixels
//             ⌊(hash(frame, 0, band + SALT_WOBBLE) − 0.5) · wobble · WOBBLE_PX · scale⌋ (alpha moves along);
//             bleed: chroma (c − luma) mixes towards the mean chroma of BLEED_TAPS samples to the left (steps of
//             max(1, round(BLEED_STEP · scale)) pixels) by `bleed`; scanlines: rows in cells of
//             max(1, SCAN_HALF · scale) — every odd cell is darkened by scanlines · SCAN_DEPTH; noise: luminance noise
//             noise · NOISE_GAIN · (hash(frame, cx, cy) − 0.5) on cells of max(1, NOISE_CELL · scale) pixels.
//
// Every size-like quantity is relative to 1080 working rows (looksMath.referenceScale, computed here on the CPU and
// passed as a uniform), so the look is the same at any source resolution. Cell indices use looksMath's float32
// recipe: ⌊(pixel + 0.5) · invCell + CELL_EPS⌋ with invCell = float32(1 / cell). Time-based effects (glitch, vhs) use
// the clip-relative frame index (EffectContext.frame), so a frame renders identically every time.
import { CELL_EPS, grainHash, referenceScale } from './looksMath';
import type { Size } from '../geometry';

/** Deterministic noise in [0, 1) from (frame, x, y); the GLSL `hash` (shaders/glsl.ts GLSL_HASH) is identical. */
export const hash = grainHash;

/** Glitch blocks are this many times wider than tall. */
export const GLITCH_ASPECT = 4;
/** Fraction of blocks hit at intensity 1. */
export const GLITCH_PROB = 0.5;
/** Largest horizontal shift (both ways together) as a fraction of the width at intensity 1. */
export const GLITCH_SHIFT = 0.2;
/** Largest red/blue split as a fraction of the block height at intensity 1. */
export const GLITCH_SPLIT = 0.5;
/** Added to the hash's y argument for each independent draw (block rows never reach 2^16). */
export const SALT_SHIFT = 0x10000;
export const SALT_SPLIT = 0x20000;
export const SALT_WOBBLE = 0x30000;
/** VHS constants, in 1080-row pixels where they are sizes. */
export const VHS = {
  scanHalf: 2, scanDepth: 0.5, noiseCell: 2, noiseGain: 0.5, bleedStep: 3, bleedTaps: 4, wobbleBand: 8, wobblePx: 12,
} as const;

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const fr = Math.fround;
const atLeast1 = (v: number): number => Math.max(1, v);

/** ⌊(index + 0.5) · inv + CELL_EPS⌋ in float32, exactly as the shaders compute it from gl_FragCoord. */
export const cellOf = (index: number, inv: number): number => Math.floor(fr(fr(fr(index + 0.5) * inv) + fr(CELL_EPS)));

/** The mirror mode 0..3 (rounded, clamped). */
export const mirrorMode = (p: Record<string, number>): number => Math.min(3, Math.max(0, Math.round(num(p.mode))));

/** The pixel centre that the output pixel centre (x, y) shows in `mode` for a width × height picture. */
export function mirrorSource(x: number, y: number, width: number, height: number, mode: number): [number, number] {
  const flipX = (mode === 0 || mode === 3) ? x >= width / 2 : mode === 1 ? x < width / 2 : false;
  const flipY = (mode === 2 || mode === 3) && y >= height / 2;
  return [flipX ? width - x : x, flipY ? height - y : y];
}

/** The red channel's displacement in working pixels (float32); blue moves the opposite way. */
export function rgbSplitOffset(p: Record<string, number>, workingHeight: number): [number, number] {
  const len = num(p.amount) * referenceScale(workingHeight);
  if (len === 0) return [0, 0];
  const a = (num(p.angle) * Math.PI) / 180;
  return [fr(len * Math.cos(a)), fr(len * Math.sin(a))];
}

export interface GlitchCoeffs {
  invBlock: number;
  invBlockW: number;
  prob: number;
  maxShift: number;
  maxSplit: number;
}

export function glitchCoeffs(p: Record<string, number>, size: Size): GlitchCoeffs {
  const intensity = num(p.intensity);
  const block = atLeast1(num(p.blockSize) * referenceScale(size.height));
  return {
    invBlock: fr(1 / block),
    invBlockW: fr(1 / (block * GLITCH_ASPECT)),
    prob: fr(intensity * GLITCH_PROB),
    maxShift: fr(intensity * GLITCH_SHIFT * size.width),
    maxSplit: fr(intensity * GLITCH_SPLIT * block),
  };
}

/** The whole-pixel shift and split of output pixel (px, py) in `frame`, or null when its block is not hit. */
export function glitchShift(frame: number, px: number, py: number, k: GlitchCoeffs): { shift: number; split: number } | null {
  const bx = cellOf(px, k.invBlockW);
  const by = cellOf(py, k.invBlock);
  if (!(hash(frame, bx, by) < k.prob)) return null;
  return {
    shift: Math.floor(fr((hash(frame, bx, by + SALT_SHIFT) - 0.5) * k.maxShift)),
    split: Math.floor(fr(hash(frame, bx, by + SALT_SPLIT) * k.maxSplit)),
  };
}

export interface VhsCoeffs {
  invScan: number;
  scanDepth: number;
  invNoise: number;
  noise: number;
  bleed: number;
  /** Bleed tap step in whole working pixels. */
  step: number;
  invWobble: number;
  wobbleSpan: number;
}

export function vhsCoeffs(p: Record<string, number>, size: Size): VhsCoeffs {
  const s = referenceScale(size.height);
  return {
    invScan: fr(1 / atLeast1(VHS.scanHalf * s)),
    scanDepth: fr(num(p.scanlines) * VHS.scanDepth),
    invNoise: fr(1 / atLeast1(VHS.noiseCell * s)),
    noise: fr(num(p.noise) * VHS.noiseGain),
    bleed: fr(num(p.bleed)),
    step: atLeast1(Math.round(VHS.bleedStep * s)),
    invWobble: fr(1 / atLeast1(VHS.wobbleBand * s)),
    wobbleSpan: fr(num(p.wobble) * VHS.wobblePx * s),
  };
}

/** The whole-pixel wobble shift of row `py` in `frame`. */
export const vhsShift = (frame: number, py: number, k: VhsCoeffs): number =>
  Math.floor(fr((hash(frame, 0, cellOf(py, k.invWobble) + SALT_WOBBLE) - 0.5) * k.wobbleSpan));

/** Whether row `py` is a darkened scanline. */
export const vhsDark = (py: number, k: VhsCoeffs): boolean => cellOf(py, k.invScan) % 2 === 1;

/** The luminance noise offset of pixel (px, py) in `frame`. */
export const vhsNoise = (frame: number, px: number, py: number, k: VhsCoeffs): number =>
  fr(k.noise * fr(hash(frame, cellOf(px, k.invNoise), cellOf(py, k.invNoise)) - 0.5));
