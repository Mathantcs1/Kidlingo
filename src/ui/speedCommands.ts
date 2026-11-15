// Store-bound speed commands (Plan 5D Task 11): each is ONE `apply` (one undo step); refusals (overlap, locked track, wrong
// clip kind, out-of-range speed) become toasts through `guard`. `ripple` pushes the later clips of the track instead of refusing an overlap.
import { freezeFrame } from '../core/freezeEdits';
import type { Keyframe } from '../core/keyTypes';
import type { Id, Project } from '../core/model';
import { MAX_SPEED, MIN_SPEED } from '../core/speedTypes';
import { setPreservePitch, setRamp, setReverse, setSpeed } from '../core/speedEdits';
import { applySpeedPreset } from '../core/speedPresets';
import type { SpeedPresetKey } from '../core/speedPresets';
import { findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { guard, showError } from './Toast';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

export const setSpeedCmd = (ids: Id[], speed: number, ripple = false): void => apply((p) => setSpeed(p, ids, speed, { ripple }));
export const setReverseCmd = (ids: Id[], reverse: boolean): void => apply((p) => setReverse(p, ids, reverse));
export const setPreservePitchCmd = (ids: Id[], preserve: boolean): void => apply((p) => setPreservePitch(p, ids, preserve));
export const setRampCmd = (clipId: Id, keys: Keyframe[] | null, ripple = false): void => apply((p) => setRamp(p, clipId, keys, { ripple }));
export const applySpeedPresetCmd = (clipId: Id, preset: SpeedPresetKey, ripple = false): void => apply((p) => applySpeedPreset(p, clipId, preset, { ripple }));
/** A freeze frame at the playhead (the clip under it is split and a still inserted; later clips on the track move). */
export const freezeFrameCmd = (clipId: Id): void => apply((p) => freezeFrame(p, clipId, useEditor.getState().playhead));

/** The Duration field: the speed that makes the clip's footage last `seconds` (refused outside 0.25x-4x). */
export function setDurationCmd(clipId: Id, seconds: number, ripple = false): void {
  const { clip } = findClip(useEditor.getState().history.present, clipId);
  if (!(seconds > 0) || !Number.isFinite(seconds)) return showError('Duration must be above 0');
  const speed = (clip.out - clip.in) / seconds;
  if (speed < MIN_SPEED || speed > MAX_SPEED) return showError(`That duration needs a speed of ${Math.round(speed * 100)}%: speed stays between ${MIN_SPEED * 100}% and ${MAX_SPEED * 100}%`);
  setSpeedCmd([clipId], speed, ripple);
}
