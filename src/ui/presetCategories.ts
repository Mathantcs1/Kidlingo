// The preset browser's categories and the one rule about which presets a clip can take (Plan 5B D10, D13).
import type { Clip } from '../core/model';
import { ADJUSTMENT_ONLY_FADE } from '../core/motionEdits';
import { MOTION_SLOTS } from '../core/motionTypes';
import type { MotionSlot, PresetKey } from '../core/motionTypes';
import { PRESETS } from '../core/presets';

export type Category = MotionSlot | 'mine' | 'favourites';
export const CATEGORIES: readonly Category[] = [...MOTION_SLOTS, 'mine', 'favourites'];
export const CAT_LABEL: Record<Category, string> = { in: 'Entrance', emphasis: 'Emphasis', loop: 'Continuous', out: 'Exit', mine: 'My presets', favourites: 'Favourites' };
export const EMPTY: Partial<Record<Category, string>> = {
  mine: 'Presets you save from a clip appear here.',
  favourites: 'Star a preset to keep it here.',
};

/** Why `key` cannot go on this clip, or null. */
export const reasonFor = (clip: Clip, key: PresetKey): string | null => (clip.kind === 'adjustment' && !PRESETS[key].opacityOnly ? ADJUSTMENT_ONLY_FADE : null);
