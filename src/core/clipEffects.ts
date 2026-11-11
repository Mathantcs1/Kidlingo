import { newId } from './model';
import type { VideoEffect } from './model';

/** Copies the picture effect stack with NEW ids (ids must stay unique across clips after a split). */
export function cloneVideoEffects(effects: VideoEffect[]): VideoEffect[] {
  return effects.map((e) => ({ ...e, id: newId(), params: { ...e.params } }));
}
