import { cloneEffects, fitFades, withAudio } from './clipAudio';
import { cloneVideoEffects } from './clipEffects';
import { copyKey, mapEffectKeys, mapTransformKeys, shiftKeys, splitKeys } from './keyLists';
import type { AnyKey } from './keyLists';
import { withMotion } from './migrateMotion';
import { clipDuration, clipEnd, hasOwnTimeline, outForLength, sourceTimeAt, trimLimits } from './clipTime';
import { newId } from './model';
import { shiftMotion, splitMotionFor } from './motionClipOps';
import type { Clip, Id, Project, TransformKeys } from './model';
import { EPS, MIN_CLIP, TimelineError, assertFinite, assertFree, assertUnlocked, findClip, mapClips, replaceClip } from './timeline';

/** `clip` with its transform keys set to `keys` (no `keys` field when undefined). */
const withClipKeys = (clip: Clip, keys: TransformKeys | undefined): Clip => {
  const { keys: _old, ...rest } = clip;
  return keys ? { ...rest, keys } : rest;
};

/**
 * A key list mapper for one split half: the keys deciding local range [lo, hi] (splitKeys), moved by `d` seconds. A
 * LOOPED list (5B D4: evaluation past its last key reads the whole list) or an oriented path (D7: the heading
 * fallback may read beyond the range) is kept whole. Fresh copies.
 */
const part = (lo: number, hi: number, d: number) => <K extends AnyKey>(l: K[], looped: boolean): K[] => {
  const kept = looped ? l.map(copyKey) : splitKeys(l, lo, hi);
  return d === 0 ? kept : shiftKeys(kept, d);
};

/** Every key of the clip (transform and effect params) moved by `d` seconds; effect ids kept. */
function shiftClipKeys(clip: Clip, d: number): Clip {
  const move = <K extends AnyKey>(l: K[]): K[] => shiftKeys(l, d);
  return { ...withClipKeys(clip, mapTransformKeys(clip.keys, move, move)), effects: clip.effects.map((e) => mapEffectKeys(e, move)) };
}

export function trimClip(p: Project, clipId: Id, edge: 'start' | 'end', time: number): Project {
  assertFinite('trim time', time);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const own = hasOwnTimeline(clip);
  const reverse = clip.reverse === true && !own;
  const limits = trimLimits(own ? undefined : p.media[clip.mediaId]);
  let next: Clip;
  if (edge === 'start') {
    const delta = time - clip.start;
    // An overlay, adjustment or freeze clip has no footage to trim: its start can move either way; `in` stays 0 (its
    // animation runs from `start`). Its keys shift by −Δ so they stay put in timeline time (Plan 5 D3), and so do its
    // emphasis and loop cycles (5B D12: at −= Δ, phase += Δ); a sourced clip's keys and stack stay on their footage.
    // The first footage edge played moves through the time map: `in` forward, `out` in reverse (Plan 5D D6).
    if (own) next = { ...withMotion(shiftClipKeys(clip, -delta), clip.motion && shiftMotion(clip.motion, delta)), start: time, in: 0, out: clipDuration(clip) - delta };
    else if (reverse) next = { ...clip, start: time, out: sourceTimeAt(clip, time) };
    else next = { ...clip, start: time, in: sourceTimeAt(clip, time) };
    // Only the footage edge that moved is checked against the file (forward `in`, reverse `out`).
    if ((reverse ? next.out > limits.footageMax + EPS : next.in < limits.footageMin - EPS) || next.start < -EPS) throw new TimelineError('Trim extends beyond source');
  } else {
    if (own) next = { ...clip, out: outForLength(clip, time - clip.start) };
    else if (reverse) next = { ...clip, in: sourceTimeAt(clip, time) };
    else next = { ...clip, out: sourceTimeAt(clip, time) };
    if (reverse ? next.in < limits.footageMin - EPS : next.out > limits.footageMax + EPS) throw new TimelineError('Trim extends beyond source');
  }
  if (clipDuration(next) < MIN_CLIP - EPS) throw new TimelineError('Clip would be too short');
  assertFree(track, next, clip.id);
  // Fades must still fit the (possibly shorter) clip.
  next = withAudio(next, fitFades(next.audio, clipDuration(next)));
  return replaceClip(p, clipId, next);
}

export function splitClip(p: Project, clipId: Id, time: number): Project {
  assertFinite('split time', time);
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (time < clip.start + MIN_CLIP - EPS || time > clipEnd(clip) - MIN_CLIP + EPS) {
    throw new TimelineError('Split point too close to clip edge');
  }
  // Where the cut falls in the footage (Plan 5D D6): through the time map; a clip with its own timeline cuts at the offset.
  const own = hasOwnTimeline(clip);
  const reverse = clip.reverse === true && !own;
  const d = time - clip.start;
  const cut = own ? d : sourceTimeAt(clip, time);
  // Keys (Plan 5 D9): each half keeps the keys that decide its own local range, a looped target (5B D4) or an
  // oriented path (D7) its whole list; an own-timeline right half's keys shift by −(time − start) (local time restarts).
  // Reverse plays footage downwards, so the LEFT timeline half holds the UPPER footage [cut, out] and the right [in, cut].
  const [lo, hi] = own ? [0, clipDuration(clip)] : [clip.in, clip.out];
  const mid = cut;
  const shift = own ? -d : 0;
  const leftKeys = reverse ? part(mid, hi, 0) : part(lo, mid, 0);
  const rightKeys = reverse ? part(lo, mid, shift) : part(mid, hi, shift);
  // The animation stack (5B D12): left keeps in/loop and an emphasis starting before the cut, right keeps out/loop and
  // an emphasis starting after it (an own-timeline right half's emphasis/loop shift with its local time). In reverse
  // an emphasis belongs to the half whose footage range holds it (the upper footage is the left half).
  const [leftMotion, rightMotion] = splitMotionFor(clip.motion, mid, shift, reverse);
  // A ramp is anchored on its key times, so both halves keep the WHOLE list (an exact table, Plan 5D D4); copies.
  const ramp = (): Pick<Clip, 'speedKeys'> => (clip.speedKeys ? { speedKeys: clip.speedKeys.map(copyKey) } : {});
  // The left half keeps the fade-in, the right half the fade-out; effects are copied with new ids to both.
  // Each half's fade is re-clamped to the half's own TIMELINE duration.
  const left: Clip = {
    ...withMotion(withClipKeys(clip, mapTransformKeys(clip.keys, leftKeys, leftKeys)), leftMotion), ...(reverse ? { in: cut } : { out: cut }),
    effects: cloneVideoEffects(clip.effects, leftKeys), ...ramp(),
    audio: { ...clip.audio, fadeOut: 0, effects: cloneEffects(clip.audio.effects) },
  };
  const right: Clip = {
    ...withMotion(withClipKeys(clip, mapTransformKeys(clip.keys, rightKeys, rightKeys)), rightMotion), id: newId(), start: time, ...(reverse ? { out: cut } : { in: cut }),
    effects: cloneVideoEffects(clip.effects, rightKeys), ...ramp(),
    audio: { ...clip.audio, fadeIn: 0, effects: cloneEffects(clip.audio.effects) },
  };
  left.audio = fitFades(left.audio, clipDuration(left));
  right.audio = fitFades(right.audio, clipDuration(right));
  return mapClips(p, (t) =>
    t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
  );
}
