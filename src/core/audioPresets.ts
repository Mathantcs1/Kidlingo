// Applying a voice preset: replaces a clip's whole effect chain in one edit.
import { PRESETS, presetAvailable } from '../audio/presets';
import type { PresetKey } from '../audio/presets';
import { editEffects } from './audioEdits';
import { clampEffectParams } from './effectParams';
import { newId } from './model';
import type { AudioEffect, Id, Project } from './model';
import { TimelineError } from './timeline';

const sameChain = (a: readonly AudioEffect[], b: readonly Omit<AudioEffect, 'id'>[]): boolean =>
  a.length === b.length &&
  a.every((e, i) => e.type === b[i].type && e.enabled === b[i].enabled && JSON.stringify(e.params) === JSON.stringify(b[i].params));

/** Replaces the clip's effects with preset `key` (fresh ids). Refused on a locked track; same reference if equal. */
export function applyPreset(p: Project, clipId: Id, key: PresetKey): Project {
  const preset = PRESETS[key];
  if (!preset || !presetAvailable(key)) throw new TimelineError('This preset is not available yet');
  return editEffects(p, clipId, (list) =>
    sameChain(list, preset) ? list : preset.map((e) => ({ ...e, id: newId(), params: { ...e.params } })),
  );
}

/**
 * Normalise result: sets the clip's first `gain` effect to `gainDb` (clamped) and enables it, or appends a new
 * one. Refused on a locked track; same reference if nothing changes.
 */
export function setGainEffect(p: Project, clipId: Id, gainDb: number): Project {
  const params = clampEffectParams('gain', { gainDb });
  return editEffects(p, clipId, (list) => {
    const i = list.findIndex((e) => e.type === 'gain');
    if (i < 0) return [...list, { id: newId(), type: 'gain', enabled: true, params }];
    const e = list[i];
    if (e.enabled && e.params.gainDb === params.gainDb && Object.keys(e.params).length === 1) return list;
    return list.map((x, j) => (j === i ? { ...e, enabled: true, params } : x));
  });
}
