// Store-bound keyframe commands (Plan 5 Task 6): each edit is ONE `apply` (one undo step) at the playhead; refusals
// (locked track, playhead off the clip) become toasts through `guard`. Jumps move the playhead only (no history).
import { keyFrame, keyIndexAtPlayhead, keyVisible, localRange, tooClose } from '../core/keyframes';
import { frameIndex } from '../core/fps';
export { keyVisible };
import { OUTSIDE_REFUSAL, keyTimes, removeKeys, setKeyEase, setValueAt, targetKeys, targetValueAt } from '../core/keyframeEdits';
import type { AnimTarget, AnimValue, KeyRef } from '../core/keyframeEdits';
import type { Ease } from '../core/easing';
import { clipEnd } from '../core/model';
import type { Clip, Id, Project, Transform } from '../core/model';
import { TimelineError, findClip } from '../core/timeline';
import { setTargetsAnimated, setTargetsAt } from '../core/targetGroups';
import { setTransformAt } from '../core/transformKeyEdits';
import { useEditor } from '../state/store';
import { guard } from './Toast';

const editor = () => useEditor.getState();
const apply = (fn: (p: Project) => Project): void => guard(() => editor().apply(fn));
const EDGE = 1e-9;

/** Whether timeline time `t` is on the clip (the same rule the keyed edits use). */
export const onClip = (clip: Clip, t: number): boolean => t >= clip.start - EDGE && t < clipEnd(clip) - EDGE;

/** The key of `target` under the playhead (in the playhead's frame window, P5-6: keyIndexAtPlayhead), or null. */
export function keyAtPlayhead(clip: Clip, target: AnimTarget, t: number, fps: number): KeyRef | null {
  const list = targetKeys(clip, target);
  const i = list ? keyIndexAtPlayhead(clip, list, t, fps) : -1;
  return i < 0 ? null : { target, t: list![i].t };
}

/** The timeline time of local key time `u` on `clip`. */
export const keyTimelineTime = (clip: Clip, u: number): number => clip.start + (u - localRange(clip)[0]);

/**
 * The timeline time of the previous (`dir` −1) or next (+1) key of `target` (any animated target when null) from
 * playhead `t`, among the keys on the visible part of the clip; null when there is none. Keys are compared by FRAME of
 * the clip's grid (P5-6): the key in the playhead's frame window is neither previous nor next, so a jump always moves,
 * and it lands on the earliest key of the chosen frame, where keyAtPlayhead reports it.
 */
export function keyJumpTime(clip: Clip, target: AnimTarget | null, t: number, fps: number, dir: -1 | 1): number | null {
  const times = target ? (targetKeys(clip, target) ?? []).map((k) => k.t) : keyTimes(clip);
  // Before the clip every key is ahead; after it every key is behind.
  const cur = t < clip.start - EDGE ? -Infinity : onClip(clip, t) ? frameIndex(t - clip.start, fps) : Infinity;
  let pick: number | undefined;
  let best = dir > 0 ? Infinity : -Infinity;
  for (const k of times) {
    if (!keyVisible(clip, k)) continue;
    const f = keyFrame(clip, k, fps);
    const ahead = dir > 0 ? f > cur && f <= best : f < cur && f >= best;
    if (ahead && (f !== best || pick === undefined || k < pick)) { pick = k; best = f; }
  }
  return pick === undefined ? null : keyTimelineTime(clip, pick);
}

/**
 * Stopwatch: animates `target` from the value at the playhead, or makes it static at that value (ONE step). `group`
 * lists the targets that switch together with it (the chroma key colour's three params; `target` leads).
 */
export function toggleAnimatedCmd(clipId: Id, target: AnimTarget, group: readonly AnimTarget[] = [target]): void {
  const { playhead } = editor();
  apply((p) => setTargetsAnimated(p, clipId, group, targetKeys(findClip(p, clipId).clip, target) === undefined, playhead));
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
 * `group`: targets that follow `target` together (the chroma key colour's three params).
 */
export function toggleKeyAtPlayheadCmd(clipId: Id, target: AnimTarget, group: readonly AnimTarget[] = [target]): void {
  const { playhead } = editor();
  apply((p) => {
    const { clip } = findClip(p, clipId);
    if (!targetKeys(clip, target)) return setTargetsAnimated(p, clipId, group, true, playhead);
    if (!onClip(clip, playhead)) throw new TimelineError(OUTSIDE_REFUSAL);
    if (keyAtPlayhead(clip, target, playhead, p.format.fps)) {
      const refs = group.flatMap((g) => keyAtPlayhead(clip, g, playhead, p.format.fps) ?? []);
      return removeKeys(p, clipId, refs);
    }
    const entries = group.map((g) => ({ target: g, value: targetValueAt(clip, g, playhead, p.format.fps) }));
    return setTargetsAt(p, clipId, entries, playhead);
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

/** Sets the ease of the segment starting at every key in `refs` (all selected times, every property) in ONE step; a no-op adds no step. */
export const setEaseCmd = (clipId: Id, refs: readonly KeyRef[], ease: Ease): void => apply((p) => setKeyEase(p, clipId, refs, ease));

/** The refs of `group`'s keys at local time `u` (one per target), for opening the ease editor from a property row. */
export function groupRefsAt(clip: Clip, group: readonly AnimTarget[], u: number): KeyRef[] {
  return group.flatMap((target) => {
    const k = (targetKeys(clip, target) ?? []).find((x) => tooClose(x.t, u));
    return k ? [{ target, t: k.t }] : [];
  });
}
