// Look presets: whole effect stacks applied in ONE edit by applyLook (D4). Built only from the shipped effects
// (colour, bw, sepia, splitTone, vignette, grain); every param is inside its schema range (tests/looks.test.ts).
import type { VideoEffect, VideoEffectType } from './model';

export type LookKey = 'bw' | 'sepia' | 'vintage' | 'tealOrange' | 'cinematic' | 'moody' | 'goldenHour' | 'coolBlue' | 'punchy';

type LookEffect = Omit<VideoEffect, 'id'>;
const on = (type: VideoEffectType, params: Record<string, number> = {}): LookEffect => ({ type, enabled: true, params });

export const LOOKS: Record<LookKey, { label: string; effects: LookEffect[] }> = {
  // Plain monochrome.
  bw: { label: 'Black & White', effects: [on('bw')] },
  // Plain warm brown monochrome.
  sepia: { label: 'Sepia', effects: [on('sepia')] },
  // Faded warm film: partial sepia, lifted-flat contrast and muted colour, soft corners, visible grain.
  vintage: { label: 'Vintage Film', effects: [
    on('sepia', { amount: 0.45 }), on('colour', { contrast: -0.1, saturation: -0.15 }),
    on('vignette', { amount: 0.35 }), on('grain', { amount: 0.12 }),
  ] },
  // Teal shadows, orange highlights, a little contrast and colour.
  tealOrange: { label: 'Teal & Orange', effects: [
    on('colour', { contrast: 0.12, saturation: 0.1 }),
    on('splitTone', { shadowHue: 190, shadowAmount: 0.4, highlightHue: 30, highlightAmount: 0.4 }),
  ] },
  // Film-like: punchier contrast, slightly desaturated, cool shadows / warm highlights, gentle vignette.
  cinematic: { label: 'Cinematic', effects: [
    on('colour', { contrast: 0.2, saturation: -0.1 }),
    on('splitTone', { shadowHue: 200, shadowAmount: 0.2, highlightHue: 40, highlightAmount: 0.15 }),
    on('vignette', { amount: 0.3 }),
  ] },
  // Dark and desaturated, blue-ish shadows, heavy tight vignette.
  moody: { label: 'Moody', effects: [
    on('colour', { exposure: -0.3, contrast: 0.2, saturation: -0.25 }),
    on('splitTone', { shadowHue: 220, shadowAmount: 0.25, highlightHue: 35, highlightAmount: 0.1 }),
    on('vignette', { amount: 0.5, size: 0.4 }),
  ] },
  // Warm sunlight: warmer white balance, richer colour, amber highlights, faint vignette.
  goldenHour: { label: 'Golden Hour', effects: [
    on('colour', { temperature: 0.4, saturation: 0.1 }),
    on('splitTone', { shadowHue: 20, shadowAmount: 0.1, highlightHue: 40, highlightAmount: 0.2 }),
    on('vignette', { amount: 0.2 }),
  ] },
  // Cold daylight: cooler white balance, blue shadows and highlights.
  coolBlue: { label: 'Cool Blue', effects: [
    on('colour', { temperature: -0.4, tint: -0.05 }),
    on('splitTone', { shadowHue: 215, shadowAmount: 0.25, highlightHue: 200, highlightAmount: 0.1 }),
  ] },
  // Strong contrast and saturation.
  punchy: { label: 'Punchy', effects: [on('colour', { contrast: 0.3, saturation: 0.3 })] },
};
