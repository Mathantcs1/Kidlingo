// DOM-free schema of the picture effects: params, ranges, defaults and clamping. Shaders live in src/render/effects.
import type { BlendMode, VideoEffectType } from './model';
import type { ParamDef } from '../audio/effects/params';

export type { ParamDef };
export type EffectGroup = 'colour' | 'look' | 'blur' | 'stylise' | 'key';

export interface EffectSchema {
  type: VideoEffectType;
  label: string;
  group: EffectGroup;
  params: ParamDef[];
  /** Output depends on the frame time (grain, glitch, VHS): seeded deterministically from the clip-relative frame. */
  timeBased: boolean;
  /** Whether the UI offers it; each effect task flips its own entry when its shader lands. */
  available: boolean;
}

export const MAX_VIDEO_EFFECTS = 8;

export const BLEND_MODES: readonly BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'colourDodge', 'colourBurn',
  'hardLight', 'softLight', 'difference', 'exclusion',
];

const p = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): ParamDef =>
  ({ key, label, min, max, step, def, unit });

/**
 * The effects whose shader has landed (offered by the UI, registered in PASS_SHADERS). Each effect task adds its type
 * here, and only here.
 */
export const AVAILABLE_VIDEO_EFFECTS: ReadonlySet<VideoEffectType> = new Set<VideoEffectType>([
  'colour', 'bw', 'sepia', 'splitTone', 'vignette', 'grain',
]);

const fx = (
  type: VideoEffectType, label: string, group: EffectGroup, params: ParamDef[], timeBased = false,
): EffectSchema => ({ type, label, group, params, timeBased, available: AVAILABLE_VIDEO_EFFECTS.has(type) });

const amount = (def: number): ParamDef => p('amount', 'Amount', 0, 1, 0.01, def);

export const VIDEO_EFFECTS: Record<VideoEffectType, EffectSchema> = {
  colour: fx('colour', 'Colour', 'colour', [
    p('brightness', 'Brightness', -1, 1, 0.01, 0), p('contrast', 'Contrast', -1, 1, 0.01, 0),
    p('saturation', 'Saturation', -1, 1, 0.01, 0), p('exposure', 'Exposure', -2, 2, 0.01, 0, 'stops'),
    p('temperature', 'Temperature', -1, 1, 0.01, 0), p('tint', 'Tint', -1, 1, 0.01, 0),
    p('hue', 'Hue', -180, 180, 1, 0, '°'), p('shadows', 'Shadows', -1, 1, 0.01, 0), p('highlights', 'Highlights', -1, 1, 0.01, 0),
  ]),
  bw: fx('bw', 'Black & white', 'look', [amount(1)]),
  sepia: fx('sepia', 'Sepia', 'look', [amount(1)]),
  splitTone: fx('splitTone', 'Split tone', 'look', [
    p('shadowHue', 'Shadow hue', 0, 360, 1, 210, '°'), p('shadowAmount', 'Shadow amount', 0, 1, 0.01, 0.3),
    p('highlightHue', 'Highlight hue', 0, 360, 1, 30, '°'), p('highlightAmount', 'Highlight amount', 0, 1, 0.01, 0.3),
    p('balance', 'Balance', -1, 1, 0.01, 0),
  ]),
  vignette: fx('vignette', 'Vignette', 'look', [
    amount(0.4), p('size', 'Size', 0, 1, 0.01, 0.5), p('softness', 'Softness', 0, 1, 0.01, 0.5),
  ]),
  grain: fx('grain', 'Film grain', 'look', [amount(0.15), p('size', 'Size', 1, 4, 0.1, 1.5)], true),
  lut: fx('lut', 'LUT', 'colour', [p('intensity', 'Intensity', 0, 1, 0.01, 1)]),
  blur: fx('blur', 'Blur', 'blur', [p('radius', 'Radius', 0, 100, 1, 8, 'px')]),
  sharpen: fx('sharpen', 'Sharpen', 'blur', [p('amount', 'Amount', 0, 2, 0.01, 0.6), p('radius', 'Radius', 0.5, 5, 0.1, 1, 'px')]),
  glow: fx('glow', 'Glow', 'blur', [
    p('threshold', 'Threshold', 0, 1, 0.01, 0.7), p('radius', 'Radius', 0, 100, 1, 20, 'px'), p('intensity', 'Intensity', 0, 2, 0.01, 0.8),
  ]),
  pixelate: fx('pixelate', 'Pixelate', 'blur', [p('size', 'Size', 1, 200, 1, 12, 'px')]),
  rgbSplit: fx('rgbSplit', 'RGB split', 'stylise', [p('amount', 'Amount', 0, 50, 1, 6, 'px'), p('angle', 'Angle', 0, 360, 1, 0, '°')]),
  glitch: fx('glitch', 'Glitch', 'stylise', [p('intensity', 'Intensity', 0, 1, 0.01, 0.4), p('blockSize', 'Block size', 4, 200, 1, 40, 'px')], true),
  vhs: fx('vhs', 'VHS', 'stylise', [
    p('scanlines', 'Scanlines', 0, 1, 0.01, 0.4), p('bleed', 'Colour bleed', 0, 1, 0.01, 0.4),
    p('noise', 'Noise', 0, 1, 0.01, 0.2), p('wobble', 'Wobble', 0, 1, 0.01, 0.2),
  ], true),
  mirror: fx('mirror', 'Mirror', 'stylise', [p('mode', 'Mode', 0, 3, 1, 0)]),
  invert: fx('invert', 'Invert', 'stylise', [amount(1)]),
  chromaKey: fx('chromaKey', 'Chroma key', 'key', [
    p('keyR', 'Key red', 0, 1, 0.01, 0), p('keyG', 'Key green', 0, 1, 0.01, 1), p('keyB', 'Key blue', 0, 1, 0.01, 0),
    p('similarity', 'Similarity', 0, 1, 0.01, 0.35), p('smoothness', 'Smoothness', 0, 1, 0.01, 0.1), p('spill', 'Spill', 0, 1, 0.01, 0.5),
  ]),
};

export const isVideoEffectType = (v: unknown): v is VideoEffectType =>
  typeof v === 'string' && Object.hasOwn(VIDEO_EFFECTS, v);

export function defaultParams(type: VideoEffectType): Record<string, number> {
  return Object.fromEntries(VIDEO_EFFECTS[type].params.map((d) => [d.key, d.def]));
}

/** A clean copy: every schema key present and clamped; non-finite ⇒ default; unknown keys dropped. */
export function clampParams(type: VideoEffectType, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of VIDEO_EFFECTS[type].params) {
    const v = params[d.key];
    out[d.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.def;
  }
  return out;
}
