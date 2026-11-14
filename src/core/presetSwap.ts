// Choosing a preset from the browser (Plan 5B Task 7, ruling T7-1). An empty slot gets the preset's defaults
// (setPreset). Replacing the preset in a filled slot keeps WHERE it sits in time (in/out `delay`, emphasis `at`, loop
// `phase` and `count`) and the `direction` when the new preset takes that value; everything else (duration, ease,
// other params) resets to the new preset's defaults, because the old values mean different things (a Slide distance
// of 1 is a whole frame, a Rise of 0.5 is its maximum). One project; the same reference when the slot already holds
// `key`. Refusals are setPreset's (locked track, audio, adjustment layers only fade, wrong slot).
import { setPreset, setPresetParams } from './motionEdits';
import type { PresetPatch } from './motionEdits';
import type { Id, Project } from './model';
import type { EmphasisUse, LoopUse, MotionSlot, PresetKey } from './motionTypes';
import { PRESET_SCHEMA } from './presets';
import { findClip } from './timeline';

export function swapPreset(p: Project, clipId: Id, slot: MotionSlot, key: PresetKey, t: number): Project {
  const old = findClip(p, clipId).clip.motion?.[slot];
  const next = setPreset(p, clipId, slot, key, t);
  if (!old || next === p) return next;
  const patch: PresetPatch = {};
  if (slot === 'in' || slot === 'out') patch.delay = old.delay;
  if (slot === 'emphasis') patch.at = (old as EmphasisUse).at;
  if (slot === 'loop') {
    patch.phase = (old as LoopUse).phase;
    patch.count = (old as LoopUse).count;
  }
  const dir = PRESET_SCHEMA[key].params.find((d) => d.key === 'direction');
  const was = old.params.direction;
  if (dir && Number.isFinite(was) && was >= dir.min && was <= dir.max) patch.params = { direction: was };
  return setPresetParams(next, clipId, slot, patch);
}
