// Small shared helpers of the keyframe edits (moved out of keyframeEdits.ts to make room, Plan 5B Task 1; no logic change).
import { assertTarget, sameTarget, targetKeys } from './animTargets';
import type { AnimTarget, AnimValue, KeyRef } from './animTargets';
import { nearestKey } from './keyLists';
import type { AnyKey } from './keyLists';
import { keyFrame, keyVisible } from './keyframes';
import { clipEnd } from './model';
import type { Clip, Id, Project } from './model';
import { EPS, TimelineError, assertUnlocked, findClip } from './timeline';

export const OUTSIDE_REFUSAL = 'Move the playhead onto the clip to set a keyframe';

/** The clip and its track after the lock guard and the per-kind target refusals. */
export function locate(p: Project, clipId: Id, target?: AnimTarget): Clip {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (target) assertTarget(clip, target);
  return clip;
}

/** `p` with clip `clipId` replaced by `next` (only its own track is copied). */
export function commitClip(p: Project, clipId: Id, next: Clip): Project {
  const swap = (c: Clip): Clip => (c.id === clipId ? next : c);
  return { ...p, tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map(swap) } : t)) };
}

export function assertInside(clip: Clip, t: number): void {
  if (!(t >= clip.start - EPS && t < clipEnd(clip) - EPS)) throw new TimelineError(OUTSIDE_REFUSAL);
}

export const isPosition = (target: AnimTarget): boolean => target.kind === 'transform' && target.prop === 'position';
export const keyToValue = (k: AnyKey): AnimValue => ('v' in k ? k.v : { x: k.x, y: k.y });

/** The distinct targets of `refs`, each with the indices of its keys that the refs select (nearest within KEY_EPS). */
export function selection(clip: Clip, refs: readonly KeyRef[]): { target: AnimTarget; list: readonly AnyKey[]; picked: Set<number> }[] {
  const out: { target: AnimTarget; list: readonly AnyKey[]; picked: Set<number> }[] = [];
  for (const r of refs) {
    let entry = out.find((e) => sameTarget(e.target, r.target));
    if (!entry) {
      assertTarget(clip, r.target);
      entry = { target: r.target, list: targetKeys(clip, r.target) ?? [], picked: new Set() };
      out.push(entry);
    }
    const i = nearestKey(entry.list, r.t);
    if (i >= 0) entry.picked.add(i);
  }
  return out.filter((e) => e.picked.size > 0);
}

/** Whether two visible local key times fall in the same frame of the clip's grid (P5-6). */
export const sameFrame = (clip: Clip, a: number, b: number, fps: number): boolean =>
  keyVisible(clip, a) && keyVisible(clip, b) && keyFrame(clip, a, fps) === keyFrame(clip, b, fps);
