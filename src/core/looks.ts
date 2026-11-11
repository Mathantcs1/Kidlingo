// Look presets: whole effect stacks applied in one edit (D4). Task 5 refines these once the look shaders exist.
import type { VideoEffect, VideoEffectType } from './model';

export type LookKey = 'bw' | 'sepia' | 'vintage' | 'tealOrange' | 'cinematic' | 'moody' | 'goldenHour' | 'coolBlue' | 'punchy';

type LookEffect = Omit<VideoEffect, 'id'>;
const on = (type: VideoEffectType, params: Record<string, number> = {}): LookEffect => ({ type, enabled: true, params });

export const LOOKS: Record<LookKey, { label: string; effects: LookEffect[] }> = {
  bw: { label: 'Black & White', effects: [on('bw')] },
  sepia: { label: 'Sepia', effects: [on('sepia')] },
  vintage: { label: 'Vintage Film', effects: [on('sepia', { amount: 0.4 }), on('vignette'), on('grain')] },
  tealOrange: { label: 'Teal & Orange', effects: [on('splitTone', { shadowHue: 190, highlightHue: 30, shadowAmount: 0.4, highlightAmount: 0.4 }), on('colour', { contrast: 0.1 })] },
  cinematic: { label: 'Cinematic', effects: [on('colour', { contrast: 0.2, saturation: -0.1 }), on('vignette', { amount: 0.3 })] },
  moody: { label: 'Moody', effects: [on('colour', { exposure: -0.3, contrast: 0.2, saturation: -0.25 }), on('vignette', { amount: 0.5 })] },
  goldenHour: { label: 'Golden Hour', effects: [on('colour', { temperature: 0.4, saturation: 0.1 })] },
  coolBlue: { label: 'Cool Blue', effects: [on('colour', { temperature: -0.4, tint: -0.05 })] },
  punchy: { label: 'Punchy', effects: [on('colour', { contrast: 0.3, saturation: 0.3 })] },
};
