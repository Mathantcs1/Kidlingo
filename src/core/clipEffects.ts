import { copyKey, mapEffectKeys } from './keyLists';
import { newId } from './model';
import type { Keyframe, VideoEffect } from './model';

/**
 * Copies the picture effect stack with NEW ids (ids must stay unique across clips after a split). Param keys (data
 * v6) are deep-copied, or mapped by `mapKeys` (a split keeps each half's keys, D9), so no two clips share a key list.
 */
export function cloneVideoEffects(effects: VideoEffect[], mapKeys: (l: Keyframe[]) => Keyframe[] = (l) => l.map(copyKey)): VideoEffect[] {
  return effects.map((e) => mapEffectKeys({ ...e, id: newId(), params: { ...e.params } }, mapKeys));
}
