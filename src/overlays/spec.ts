// DOM-free overlay definitions (Plan 4 E9): intrinsic sizes, parameter ranges, defaults and initial placement.
import type { OverlaySpec, OverlayType, Transform } from '../core/model';

export const MAX_OVERLAY_TEXT = 60;
export const MAX_OVERLAY_SUBTEXT = 80;

/** Intrinsic size in source pixels; the clip's transform scales it onto the canvas (format pixels). */
export const OVERLAY_SIZES: Record<OverlayType, { width: number; height: number }> = {
  lowerThird: { width: 960, height: 180 },
  subscribe: { width: 480, height: 140 },
  progress: { width: 1920, height: 16 },
  sticker: { width: 400, height: 400 },
};

export interface OverlayParamDef {
  key: string;
  label: string;
  kind: 'number' | 'color' | 'select';
  min: number;
  max: number;
  def: number;
  options?: string[];
}

const color = (key: string, label: string, def: number): OverlayParamDef => ({ key, label, kind: 'color', min: 0, max: 0xffffff, def });
const corner = (def: number): OverlayParamDef => ({ key: 'corner', label: 'Corner roundness', kind: 'number', min: 0, max: 1, def });

export const STICKER_SHAPES = ['Arrow', 'Star', 'Heart', 'Check', 'Cross', 'Speech bubble', 'LIVE', 'NEW', 'Circle', 'Burst', 'Swish', 'Pointer'];

export const OVERLAY_PARAMS: Record<OverlayType, OverlayParamDef[]> = {
  lowerThird: [color('accent', 'Accent colour', 0xff3b30), color('background', 'Background', 0x101418), color('textColor', 'Text colour', 0xffffff), corner(0.15)],
  subscribe: [color('accent', 'Button colour', 0xff0000), color('textColor', 'Text colour', 0xffffff), corner(0.5)],
  progress: [
    color('accent', 'Bar colour', 0xff3b30), color('background', 'Track colour', 0x000000), corner(0.5),
    { key: 'source', label: 'Shows', kind: 'select', min: 0, max: 1, def: 0, options: ['This overlay', 'The whole video'] },
  ],
  sticker: [
    color('accent', 'Colour', 0xffd60a), color('textColor', 'Text colour', 0xffffff),
    { key: 'shape', label: 'Shape', kind: 'select', min: 0, max: 11, def: 1, options: STICKER_SHAPES },
  ],
};

const defaultParams = (type: OverlayType): Record<string, number> => Object.fromEntries(OVERLAY_PARAMS[type].map((p) => [p.key, p.def]));

export const OVERLAY_DEFAULTS: Record<OverlayType, OverlaySpec> = {
  lowerThird: { type: 'lowerThird', text: 'Your name', subtext: 'Your title', params: defaultParams('lowerThird') },
  subscribe: { type: 'subscribe', text: 'SUBSCRIBE', subtext: '', params: defaultParams('subscribe') },
  progress: { type: 'progress', text: '', subtext: '', params: defaultParams('progress') },
  sticker: { type: 'sticker', text: '', subtext: '', params: defaultParams('sticker') },
};

/** Every schema key present and in range; non-finite ⇒ default; unknown keys dropped; select/colour rounded. */
export function clampOverlayParams(type: OverlayType, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of OVERLAY_PARAMS[type]) {
    const v = params[p.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      out[p.key] = p.def;
      continue;
    }
    out[p.key] = Math.min(p.max, Math.max(p.min, p.kind === 'number' ? v : Math.round(v)));
  }
  return out;
}

/** Where a new overlay goes on a `format` canvas: transform offsets are from the canvas centre, y down. */
export function initialTransform(type: OverlayType, format: { width: number; height: number }): Transform {
  const { width: W, height: H } = format;
  const size = OVERLAY_SIZES[type];
  const margin = 0.04 * W;
  const base: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  if (type === 'progress') {
    const scale = W / size.width;
    return { ...base, scale, y: H / 2 - (size.height * scale) / 2 };
  }
  if (type === 'sticker') return { ...base, scale: (0.2 * Math.min(W, H)) / size.width };
  const scale = ((type === 'lowerThird' ? 0.45 : 0.22) * W) / size.width;
  const w = size.width * scale;
  const h = size.height * scale;
  const y = H / 2 - margin - h / 2;
  return { ...base, scale, x: type === 'lowerThird' ? -W / 2 + margin + w / 2 : W / 2 - margin - w / 2, y };
}
