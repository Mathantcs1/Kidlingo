// The colour effect's maths (Plan 4 D3): the params → coefficients mapping shared by the shader's uniforms and the
// pure CPU reference `colourPixel`, which applies exactly the formulas of shaders/colour.ts.
//
// Values are un-premultiplied, display-referred (sRGB-encoded) 0..1 and pass through, in order, each stage clamped:
//   1. exposure     linear = srgbToLinear(c) · 2^exposure, back to sRGB (stops in LINEAR light)
//   2. white bal.   c · (1 + 0.2·temperature, 1 − 0.2·tint, 1 − 0.2·temperature): warm = R up/B down, tint + = magenta
//   3. tone         L = Rec.709 luma; c + 0.3·shadows·(1 − L)² + 0.3·highlights·L² (soft luma-weighted masks)
//   4. contrast     (c − 0.5) · (1 + contrast) + 0.5
//   5. brightness   c + 0.5·brightness
//   6. saturation   L + (c − L) · (1 + saturation), L = Rec.709 luma (−1 = grey)
//   7. hue          the W3C Filter Effects hueRotate matrix (rotation about the grey axis), degrees
// At the defaults every stage is exactly the identity: exposure, contrast and saturation are skipped when their
// coefficient is 1 (the shader has the same guards); white balance (×1), tone and brightness (+0) and hue (the literal
// identity matrix) are the identity by arithmetic. Note for later effects copying this pattern: the CPU guards compare
// JS doubles while GLSL compares float32 uniforms; both are exactly 1 at the default, and a param a 0.01 step away is
// far from 1 in either precision, so the two always take the same branch.

export type Rgb = [number, number, number];
type Mat3Rows = [Rgb, Rgb, Rgb];

/** Rec.709 luma weights (tone masks and saturation). */
export const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
/** Per-channel white-balance gain at temperature/tint ±1 (±20 %). */
export const WB_GAIN = 0.2;
/** Shadows/highlights offset at ±1 for pure black/white (the masks fall off as (1 − L)² and L²). */
export const TONE_GAIN = 0.3;
/** Brightness offset at ±1. */
export const BRIGHTNESS_RANGE = 0.5;
/** The piecewise sRGB transfer function's constants (IEC 61966-2-1). */
export const SRGB = { encCut: 0.04045, linCut: 0.0031308, slope: 12.92, a: 0.055, gamma: 2.4 };

export const srgbToLinear = (c: number): number =>
  c < SRGB.encCut ? c / SRGB.slope : ((c + SRGB.a) / (1 + SRGB.a)) ** SRGB.gamma;

export const linearToSrgb = (l: number): number =>
  l < SRGB.linCut ? l * SRGB.slope : (1 + SRGB.a) * l ** (1 / SRGB.gamma) - SRGB.a;

/** Everything the shader needs, derived once per frame from the params. */
export interface ColourCoeffs {
  /** 2^exposure (linear-light gain). */
  expo: number;
  /** White-balance channel gains. */
  wb: Rgb;
  /** [shadows, highlights] offsets (× TONE_GAIN). */
  tone: [number, number];
  /** 1 + contrast. */
  contrast: number;
  /** Brightness offset. */
  bright: number;
  /** 1 + saturation. */
  sat: number;
  /** Hue rotation matrix rows (exact identity at 0°). */
  hue: Mat3Rows;
}

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The W3C Filter Effects `hueRotate` matrix rows (feColorMatrix), exact identity at 0. */
export function hueMatrix(degrees: number): Mat3Rows {
  if (degrees === 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}

export function colourCoeffs(p: Record<string, number>): ColourCoeffs {
  const t = num(p.temperature);
  return {
    expo: 2 ** num(p.exposure),
    wb: [1 + WB_GAIN * t, 1 - WB_GAIN * num(p.tint), 1 - WB_GAIN * t],
    tone: [TONE_GAIN * num(p.shadows), TONE_GAIN * num(p.highlights)],
    contrast: 1 + num(p.contrast),
    bright: BRIGHTNESS_RANGE * num(p.brightness),
    sat: 1 + num(p.saturation),
    hue: hueMatrix(num(p.hue)),
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const map = (c: Rgb, f: (v: number, k: number) => number): Rgb => [clamp01(f(c[0], 0)), clamp01(f(c[1], 1)), clamp01(f(c[2], 2))];
const luma = (c: Rgb): number => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
const dot = (r: Rgb, c: Rgb): number => r[0] * c[0] + r[1] * c[1] + r[2] * c[2];

/** The colour effect on one un-premultiplied sRGB pixel (0..1), exactly as the shader computes it. */
export function applyColour(rgb: Rgb, k: ColourCoeffs): Rgb {
  let c = map(rgb, (v) => v);
  if (k.expo !== 1) c = map(c, (v) => linearToSrgb(srgbToLinear(v) * k.expo));
  c = map(c, (v, i) => v * k.wb[i]);
  const l = luma(c);
  c = map(c, (v) => v + k.tone[0] * (1 - l) * (1 - l) + k.tone[1] * l * l);
  if (k.contrast !== 1) c = map(c, (v) => (v - 0.5) * k.contrast + 0.5);
  c = map(c, (v) => v + k.bright);
  if (k.sat !== 1) {
    const y = luma(c);
    c = map(c, (v) => y + (v - y) * k.sat);
  }
  return map(c, (_, i) => dot(k.hue[i], c));
}

/** The CPU reference of the colour effect: `params` as stored on the effect (missing keys = default 0). */
export function colourPixel(rgb: Rgb, p: Record<string, number>): Rgb {
  return applyColour(rgb, colourCoeffs(p));
}
