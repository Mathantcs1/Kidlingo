// DOM-free voice presets: whole effect chains applied in one edit (see core/audioPresets.applyPreset).
import type { AudioEffect, AudioEffectType } from '../core/model';
import { EFFECT_SCHEMAS, defaultParams } from './effects/params';

export type PresetKey = 'podcast' | 'radio' | 'telephone' | 'deep' | 'chipmunk';
export type PresetEffect = Omit<AudioEffect, 'id'>;

/** Defaults merged with `over` WITHOUT clamping, so the unit test catches an out-of-range preset value. */
const fx = (type: AudioEffectType, over: Record<string, number> = {}): PresetEffect => ({
  type,
  enabled: true,
  params: { ...defaultParams(type), ...over },
});

export const PRESET_LABELS: Record<PresetKey, string> = {
  podcast: 'Podcast voice',
  radio: 'Radio',
  telephone: 'Telephone',
  deep: 'Deep voice',
  chipmunk: 'Chipmunk',
};

export const PRESETS: Record<PresetKey, PresetEffect[]> = {
  podcast: [
    fx('highpass', { freq: 80 }),
    fx('eq', { low: -2, mid: 2, high: 3 }),
    fx('compressor', { threshold: -20, ratio: 3, attack: 0.005, release: 0.2, makeup: 4 }),
  ],
  radio: [
    fx('highpass', { freq: 300 }),
    fx('lowpass', { freq: 5000 }),
    fx('eq', { low: -6, mid: 4, high: 0 }),
    fx('compressor', { threshold: -30, ratio: 6, attack: 0.003, release: 0.1, makeup: 8 }),
  ],
  telephone: [fx('highpass', { freq: 400 }), fx('lowpass', { freq: 3400 }), fx('eq', { low: 0, mid: 6, high: 0 })],
  // Pitch presets: their effect is built in Plan 3 Task 7; until then they are listed as unavailable.
  deep: [fx('pitch', { semitones: -4 })],
  chipmunk: [fx('pitch', { semitones: 6 })],
};

/** A preset can be offered once every effect in it has a real builder. */
export const presetAvailable = (key: PresetKey): boolean => PRESETS[key].every((e) => EFFECT_SCHEMAS[e.type].available);

/** [key, effects] of the presets the UI offers, in menu order. */
export function availablePresets(): [PresetKey, PresetEffect[]][] {
  return (Object.keys(PRESETS) as PresetKey[]).filter(presetAvailable).map((k) => [k, PRESETS[k]]);
}
