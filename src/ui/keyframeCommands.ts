// Store-bound keyframe commands (Plan 5 Task 6): each edit is ONE `apply` (one undo step) at the playhead; refusals
// (locked track, playhead off the clip) become toasts through `guard`. Jumps move the playhead only (no history).
import { localRange, localTime, tooClose } from '../core/keyframes';
import { OUTSIDE_REFUSAL, keyTimes, removeKeys, setAnimated, setValueAt, targetKeys, targetValueAt } from '../core/keyframeEdits';
import type { AnimTarget, AnimValue, KeyRef } from '../core/keyframeEdits';
import { clipEnd } from '../core/model';
import type { Clip, Id, Project, Transform } from '../core/model';
import { TimelineError, findClip } from '../core/timeline';
import { setTransformAt } from '../core/transformKeyEdits';
import { useEditor } from '../state/store';
import { guard } from './Toast';

const editor = () => useEditor.getState();
const apply = (fn: (p: Project) => Project): void => guard(() => editor().apply(fn));
const EDGE = 1e-9;

/** Whether timeline time `t` is on the clip (the same rule the keyed edits use). */
export const onClip = (clip: Clip, t: number): boolean => t >= clip.start - EDGE && t < clipEnd(clip) - EDGE;

/** Whether local key time `k` shows on the clip: the clip's visible range, end exclusive (the end is off the clip). The ONE rule for the strip and for previous/next. */
export function keyVisible(clip: Clip, k: number): boolean {
  const [lo, hi] = localRange(clip);
  return k >= lo - EDGE && k < hi - EDGE;
}

/** The key of `target` under the playhead (within KEY_EPS of the playhead's local frame time), or null. */
export function keyAtPlayhead(clip: Clip, target: AnimTarget, t: number, fps: number): KeyRef | null {
  const list = targetKeys(clip, target);
  if (!list || !onClip(clip, t)) return null;
  const u = localTime(clip, t, fps);
  let best: number | null = null;
  for (const k of list) if (tooClose(k.t, u) && (best === null || Math.abs(k.t - u) < Math.abs(best - u))) best = k.t;
  return best === null ? null : { target, t: best };
}

/** The timeline time of local key time `u` on `clip`. */
export const keyTimelineTime = (clip: Clip, u: number): number => clip.start + (u - localRange(clip)[0]);

/**
 * The timeline time of the previous (`dir` −1) or next (+1) key of `target` (any animated target when null) from
 * playhead `t`, among the keys on the visible part of the clip; null when there is none. A playhead between frames
 * counts as its frame's start, so the key it sits on is neither previous nor next.
 */
export function keyJumpTime(clip: Clip, target: AnimTarget | null, t: number, fps: number, dir: -1 | 1): number | null {
  const times = target ? (targetKeys(clip, target) ?? []).map((k) => k.t) : keyTimes(clip);
  const before = t < clip.start - EDGE;
  const u = localTime(clip, Math.min(Math.max(t, clip.start), clipEnd(clip)), fps);
  // The key under the playhead is neither previous nor next, but only when the playhead is on the clip: from before
  // the clip (clamped to its start) a key at the first frame is still ahead.
  const visible = times.filter((k) => keyVisible(clip, k) && !(onClip(clip, t) && tooClose(k, u)));
  const pick = dir > 0
    ? visible.filter((k) => (before ? k >= u - EDGE : k > u)).sort((a, b) => a - b)[0]
    : visible.filter((k) => k < u).sort((a, b) => b - a)[0];
  return pick === undefined ? null : keyTimelineTime(clip, pick);
}

/** Stopwatch: animates `target` from the value at the playhead, or makes it static at that value (ONE step). */
export function toggleAnimatedCmd(clipId: Id, target: AnimTarget): void {
  const { playhead } = editor();
  apply((p) => setAnimated(p, clipId, target, targetKeys(findClip(p, clipId).clip, target) === undefined, playhead));
}

/** Sets `target` to `value` at the playhead: a key when animated, else the static edit (ONE step). */
export const setValueAtCmd = (clipId: Id, target: AnimTarget, value: AnimValue): void => {
  const { playhead } = editor();
  apply((p) => setValueAt(p, clipId, target, value, playhead));
};

/** A transform field commit at the playhead (x/y alone keep the other coordinate), ONE step. */
export const setTransformAtCmd = (clipId: Id, patch: Partial<Transform>): void => {
  const { playhead } = editor();
  apply((p) => setTransformAt(p, clipId, patch, playhead));
};

/**
 * The key diamond: a static target starts animating (one key); on a key, that key is removed (the last one leaves the
 * value static); elsewhere a key holding the value shown at the playhead is added. ONE step; refused off the clip.
 */
export function toggleKeyAtPlayheadCmd(clipId: Id, target: AnimTarget): void {
  const { playhead } = editor();
  apply((p) => {
    const { clip } = findClip(p, clipId);
    if (!targetKeys(clip, target)) return setAnimated(p, clipId, target, true, playhead);
    if (!onClip(clip, playhead)) throw new TimelineError(OUTSIDE_REFUSAL);
    const ref = keyAtPlayhead(clip, target, playhead, p.format.fps);
    if (ref) return removeKeys(p, clipId, [ref]);
    return setValueAt(p, clipId, target, targetValueAt(clip, target, playhead, p.format.fps), playhead);
  });
}

/** Moves the playhead to the previous/next key (of `target`, or of any target when null). Pauses playback; no history. */
export function jumpToKeyCmd(clipId: Id, target: AnimTarget | null, dir: -1 | 1): void {
  guard(() => {
    const { history, playhead, playing, setPlaying, setPlayhead } = editor();
    const p = history.present;
    const to = keyJumpTime(findClip(p, clipId).clip, target, playhead, p.format.fps, dir);
    if (to === null) return;
    if (playing) setPlaying(false);
    setPlayhead(to);
  });
}

/** Moves the playhead to a key's local time `u` on the clip (a strip diamond). Pauses playback; no history. */
export function seekToKeyCmd(clipId: Id, u: number): void {
  guard(() => {
    const { history, playing, setPlaying, setPlayhead } = editor();
    if (playing) setPlaying(false);
    setPlayhead(keyTimelineTime(findClip(history.present, clipId).clip, u));
  });
}
