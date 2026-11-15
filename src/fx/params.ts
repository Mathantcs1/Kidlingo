// DOM-free effect schemas: ranges, defaults and clamping. src/core imports this; the GLSL lives in src/render/fx.
import type { FxType } from '../core/model';
import type { FxGroup, FxParamDef, FxParamKind, FxSchema } from './types';

export const MAX_FX_PER_CLIP = 12;

const n = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): FxParamDef => ({
  key, label, kind: 'number', min, max, step, def, ...(unit ? { unit } : {}),
});
const kind = (k: FxParamKind, key: string, label: string, min: number, max: number, def: number, options?: string[]): FxParamDef => ({
  key, label, kind: k, min, max, step: 1, def, ...(options ? { options } : {}),
});
const amount = (def = 1): FxParamDef => n('amount', 'Amount', 0, 1, 0.01, def);

const schema = (type: FxType, label: string, group: FxGroup, params: FxParamDef[], extra: Partial<FxSchema> = {}): FxSchema => ({
  type, label, group, params, timeDriven: false, ...extra,
});

export const FX_SCHEMAS: Record<FxType, FxSchema> = {
  color: schema('color', 'Colour', 'Colour', [
    n('exposure', 'Exposure', -3, 3, 0.05, 0, 'stops'),
    n('brightness', 'Brightness', -1, 1, 0.01, 0),
    n('contrast', 'Contrast', -1, 1, 0.01, 0),
    n('saturation', 'Saturation', -1, 1, 0.01, 0),
    n('hue', 'Hue', -180, 180, 1, 0, '°'),
    n('temperature', 'Temperature', -1, 1, 0.01, 0),
    n('tint', 'Tint', -1, 1, 0.01, 0),
    n('shadows', 'Shadows', -1, 1, 0.01, 0),
    n('highlights', 'Highlights', -1, 1, 0.01, 0),
  ]),
  look: schema('look', 'Look', 'Looks', [
    kind('select', 'preset', 'Preset', 0, 8, 0, ['Cinematic', 'Moody', 'Golden Hour', 'Teal-Orange', 'Fashion', 'Clean Vlog', 'Film 35mm', 'Cyberpunk', 'Dreamy']),
    n('intensity', 'Intensity', 0, 1, 0.01, 1),
  ]),
  lut: schema('lut', 'LUT', 'Looks', [n('intensity', 'Intensity', 0, 1, 0.01, 1)], { needsLut: true }),
  bw: schema('bw', 'Black & white', 'Looks', [amount()]),
  sepia: schema('sepia', 'Sepia', 'Looks', [amount()]),
  invert: schema('invert', 'Invert', 'Stylise', [amount()]),
  vignette: schema('vignette', 'Vignette', 'Looks', [
    amount(0.5), n('size', 'Size', 0, 1, 0.01, 0.5), n('softness', 'Softness', 0, 1, 0.01, 0.5),
  ]),
  grain: schema('grain', 'Film grain', 'Looks', [
    amount(0.3), n('size', 'Size', 1, 8, 0.1, 1.5, 'px'), n('color', 'Colour noise', 0, 1, 0.01, 0.3),
  ], { timeDriven: true }),
  blur: schema('blur', 'Blur', 'Blur & sharpen', [n('radius', 'Radius', 0, 100, 0.5, 8, 'px')]),
  sharpen: schema('sharpen', 'Sharpen', 'Blur & sharpen', [n('amount', 'Amount', 0, 2, 0.01, 0.5), n('radius', 'Radius', 0.5, 5, 0.1, 1, 'px')]),
  glow: schema('glow', 'Glow', 'Blur & sharpen', [
    n('threshold', 'Threshold', 0, 1, 0.01, 0.7), n('radius', 'Radius', 1, 80, 0.5, 20, 'px'), n('intensity', 'Intensity', 0, 2, 0.01, 0.8),
  ]),
  pixelate: schema('pixelate', 'Pixelate', 'Blur & sharpen', [n('size', 'Block size', 1, 200, 1, 12, 'px')]),
  rgbsplit: schema('rgbsplit', 'RGB split', 'Stylise', [n('amount', 'Amount', 0, 60, 0.5, 8, 'px'), n('angle', 'Angle', -180, 180, 1, 0, '°')]),
  glitch: schema('glitch', 'Glitch', 'Stylise', [amount(0.4), n('speed', 'Speed', 0, 1, 0.01, 0.5)], { timeDriven: true }),
  vhs: schema('vhs', 'VHS', 'Stylise', [amount(0.6)], { timeDriven: true }),
  mirror: schema('mirror', 'Mirror', 'Stylise', [
    kind('select', 'mode', 'Mode', 0, 4, 0, ['Left to right', 'Right to left', 'Top to bottom', 'Bottom to top', 'Quad']),
  ]),
  chroma: schema('chroma', 'Chroma key', 'Key', [
    kind('color', 'key', 'Key colour', 0, 0xffffff, 0x00ff00),
    n('tolerance', 'Tolerance', 0, 1, 0.01, 0.35), n('softness', 'Softness', 0, 1, 0.01, 0.15), n('spill', 'Spill removal', 0, 1, 0.01, 0.5),
  ]),
};

export function defaultFxParams(type: FxType): Record<string, number> {
  return Object.fromEntries(FX_SCHEMAS[type].params.map((p) => [p.key, p.def]));
}

/** A clean copy: every schema key present and in range; non-finite ⇒ default; unknown keys dropped; discrete kinds rounded. */
export function clampFxParams(type: FxType, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of FX_SCHEMAS[type].params) {
    const v = params[p.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      out[p.key] = p.def;
      continue;
    }
    const x = p.kind === 'number' ? v : Math.round(v);
    out[p.key] = Math.min(p.max, Math.max(p.min, x));
  }
  return out;
}
