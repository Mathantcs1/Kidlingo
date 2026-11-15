// Speed ramp presets (Plan 5D Task 10): ready-made `speedKeys` over a clip's footage range [in, out].
import type { Ease } from './easing';
import type { Keyframe } from './keyTypes';
import type { Clip, Id, Project } from './model';
import { findClip } from './timeline';
import { setRamp } from './speedEdits';
import type { RetimeOptions } from './speedEdits';

export type SpeedPresetKey = 'rampUp' | 'rampDown' | 'bullet' | 'flash';

export const SPEED_PRESETS: { key: SpeedPresetKey; label: string; hint: string }[] = [
  { key: 'rampUp', label: 'Speed up', hint: 'Normal speed accelerating to 3x' },
  { key: 'rampDown', label: 'Slow down', hint: '3x easing down to normal speed' },
  { key: 'bullet', label: 'Bullet time', hint: 'Normal, slowing to 0.25x in the middle, back to normal' },
  { key: 'flash', label: 'Flash forward', hint: 'Normal, 4x in the middle, back to normal' },
];

const smooth: Ease = { kind: 'easeInOut' };
const key = (t: number, v: number, ease: Ease = smooth): Keyframe => ({ t, v, ease });

/** The keys of `preset` over the footage range [in, out] of `clip`. */
export function speedPresetKeys(preset: SpeedPresetKey, clip: Pick<Clip, 'in' | 'out'>): Keyframe[] {
  const { in: a, out: b } = clip;
  const at = (f: number): number => a + (b - a) * f;
  switch (preset) {
    case 'rampUp': return [key(a, 1), key(b, 3)];
    case 'rampDown': return [key(a, 3), key(b, 1)];
    case 'bullet': return [key(a, 1), key(at(0.3), 1), key(at(0.5), 0.25), key(at(0.7), 1), key(b, 1)];
    case 'flash': return [key(a, 1), key(at(0.3), 1), key(at(0.5), 4), key(at(0.7), 1), key(b, 1)];
  }
}

/** Applies a preset to a clip as its speed ramp (frame-snapped length, overlap refused unless `ripple`). */
export function applySpeedPreset(p: Project, clipId: Id, preset: SpeedPresetKey, opts: RetimeOptions = {}): Project {
  return setRamp(p, clipId, speedPresetKeys(preset, findClip(p, clipId).clip), opts);
}
