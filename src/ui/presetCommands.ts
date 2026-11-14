// Store-bound animation preset commands (Plan 5B Task 7): each is ONE `apply` (one undo step) through `guard`, so a
// refusal (locked track, adjustment layers only fade, playhead off the clip) becomes a toast and adds no step.
// Also the two readers of the stored stack the inspector and the timeline use (the RESOLVED clip has no `motion`, so
// the UI reads the RAW clip here and nowhere else).
import { localTime } from '../core/keyframes';
import { OUTSIDE_REFUSAL } from '../core/keyEditHelpers';
import type { Clip, Id, Project } from '../core/model';
import { setPreset, setPresetParams } from '../core/motionEdits';
import type { PresetPatch } from '../core/motionEdits';
import type { EmphasisUse, LoopUse, MotionSlot, PresetKey, PresetUse } from '../core/motionTypes';
import { swapPreset } from '../core/presetSwap';
import { TimelineError, findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { onClip } from './keyframeCommands';
import { applyOk } from './applyOk';
import { guard } from './Toast';

const editor = () => useEditor.getState();
const apply = (fn: (p: Project) => Project): void => guard(() => editor().apply(fn));

/** A slot of the RAW clip's stack (any slot's fields; `at` on emphasis, `phase`/`count` on loop), or undefined. */
export type SlotUse = PresetUse & Partial<Pick<EmphasisUse, 'at'> & Pick<LoopUse, 'phase' | 'count'>>;
export const slotUse = (clip: Clip, slot: MotionSlot): SlotUse | undefined => clip.motion?.[slot];

/** The stored value of param `key` of a slot (undefined when the preset has no such param). */
export const paramOf = (use: PresetUse, key: string): number | undefined => use.params[key];

/** Chooses `key` for `slot` of the clip (a filled slot keeps its timing and direction: swapPreset, T7-1). True unless refused. */
export const setPresetCmd = (clipId: Id, slot: MotionSlot, key: PresetKey): boolean => {
  const { playhead } = editor();
  return applyOk((p) => swapPreset(p, clipId, slot, key, playhead));
};

/** Empties `slot` (ONE step; undo restores it exactly). */
export const removePresetCmd = (clipId: Id, slot: MotionSlot): void => {
  const { playhead } = editor();
  apply((p) => setPreset(p, clipId, slot, null, playhead));
};

/** Tunes the preset in `slot` (one call per slider release / button press). */
export const setPresetParamsCmd = (clipId: Id, slot: MotionSlot, patch: PresetPatch): void =>
  apply((p) => setPresetParams(p, clipId, slot, patch));

/** Moves the emphasis to the playhead (its local time on the clip); refused off the clip. */
export const emphasisHereCmd = (clipId: Id): void => {
  const { playhead } = editor();
  apply((p) => {
    const { clip } = findClip(p, clipId);
    if (!onClip(clip, playhead)) throw new TimelineError(OUTSIDE_REFUSAL.replace('set a keyframe', 'place the emphasis'));
    return setPresetParams(p, clipId, 'emphasis', { at: localTime(clip, playhead, p.format.fps) });
  });
};
